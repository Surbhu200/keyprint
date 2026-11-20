import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ProjectedPin2D } from "./matching";

// v4: Gemini returns boxes in its native 0-1000 box_2d format (converted to pixels below), so
// reports cached under v3, whose Gemini boxes could be off, are never reused.
export const AI_PROMPT_VERSION = "keyprint-diff-v4";

export const ChangeSchema = z.object({
  view_id: z.string(),
  box: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }), // pixels in 1024x768 AFTER image, origin top-left, y down
  title: z.string(),
  description: z.string(),
  category: z.enum(["possible_damage", "possible_wear", "not_a_real_change"]),
  confidence: z.enum(["low", "medium", "high"]),
});

export const ChangeReportSchema = z.object({
  changes: z.array(ChangeSchema),
});

export type ChangeReportOutput = z.infer<typeof ChangeReportSchema>;

export interface RenderPairInput {
  viewId: string;
  pins: ProjectedPin2D[]; // ONLY id, x, y in pixels — never pin text or co-sign status
  beforeBase64: string;
  afterBase64: string;
}

export interface AnalyzeResult {
  report: ChangeReportOutput;
  model: string;
}

const RENDER_WIDTH = 1024;
const RENDER_HEIGHT = 768;

/** What the model sees: short view labels (V1, V2…) and pins as P1, P2… with pixel positions. */
interface LabeledPair {
  label: string;
  pins: Array<{ id: string; x: number; y: number }>;
  beforeBase64: string;
  afterBase64: string;
}

const PIXEL_BOX_RULE =
  "- Provide pixel bounding boxes in the 1024x768 AFTER image (origin top-left, y down).";
// Gemini is trained to locate things as box_2d = [ymin, xmin, ymax, xmax] on a 0-1000 scale and
// tends to answer in that space even when asked for pixels, so it is asked for that directly.
const GEMINI_BOX_RULE =
  "- Provide box_2d for each change as [ymin, xmin, ymax, xmax] in the AFTER image, each value normalized to 0-1000.";

const SYSTEM_PROMPT = `You are inspecting two 1024x768 3D room renders taken from the exact same camera viewpoint: BEFORE (move-in) and AFTER (move-out).

List physical changes to the apartment unit between BEFORE and AFTER.
Report anything new on or attached to walls, floors, doors, counters or fixtures: stains, marks, scuffs, holes, scratches, burns, tape, stickers, notes or paint.
Ignore lighting shifts, exposure, color balance, scan noise, holes or stretched textures from 3D reconstruction, missing scan coverage at the image edges, and free-standing belongings (furniture, bags, boxes) that moved.

Label each item strictly as one of:
- possible_damage: holes, burns, large stains, broken fixtures, deep gouges
- possible_wear: light scuffs, faded paint, carpet wear in walkways, small nail holes, marks or items stuck on a surface
- not_a_real_change: likely a scan artifact or shadow

Important rules:
- These are suggestions for people to review, never legal or billing verdicts.
- Never estimate repair costs or dollar amounts.
${PIXEL_BOX_RULE}
- Use low confidence whenever uncertain.
- If a mark or scratch already existed identically in BEFORE and AFTER, do NOT flag it as a new change.
- Set view_id to the exact view label (V1, V2, ...) written before each BEFORE/AFTER pair.`;

const GEMINI_SYSTEM_PROMPT = SYSTEM_PROMPT.replace(PIXEL_BOX_RULE, GEMINI_BOX_RULE);

/** What Gemini returns: the same fields, with box_2d instead of a pixel box. */
const GeminiReportSchema = z.object({
  changes: z.array(ChangeSchema.omit({ box: true }).extend({ box_2d: z.array(z.number()) })),
});

/**
 * Gemini's box_2d ([ymin, xmin, ymax, xmax], each 0-1000 of the image) as a pixel box in the
 * 1024x768 render. Null when it isn't four finite numbers.
 */
export function fromGeminiBox(box2d: number[]): ChangeReportOutput["changes"][number]["box"] | null {
  if (box2d.length !== 4 || !box2d.every((v) => Number.isFinite(v))) return null;
  const [y0, x0, y1, x1] = box2d.map((v) => Math.min(Math.max(v, 0), 1000));
  const xmin = Math.min(x0, x1);
  const ymin = Math.min(y0, y1);
  return {
    x: (xmin / 1000) * RENDER_WIDTH,
    y: (ymin / 1000) * RENDER_HEIGHT,
    w: ((Math.max(x0, x1) - xmin) / 1000) * RENDER_WIDTH,
    h: ((Math.max(y0, y1) - ymin) / 1000) * RENDER_HEIGHT,
  };
}

const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    changes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          view_id: { type: "STRING" },
          box_2d: {
            type: "ARRAY",
            items: { type: "INTEGER" },
          },
          title: { type: "STRING" },
          description: { type: "STRING" },
          category: {
            type: "STRING",
            enum: ["possible_damage", "possible_wear", "not_a_real_change"],
          },
          confidence: {
            type: "STRING",
            enum: ["low", "medium", "high"],
          },
        },
        required: ["view_id", "box_2d", "title", "description", "category", "confidence"],
      },
    },
  },
  required: ["changes"],
};

// Measured Nov 19-20 with this project's key: 3.5-flash is the most accurate (found both planted
// changes) but is sometimes overloaded (503 / very slow), so it gets a short wait; 3.8-flash is
// Google's suggested successor; 3.5-flash-lite answers a 3-pair batch in ~8 s even under load.
// (gemini-2.5-flash is no longer offered to new keys.)
const GEMINI_MODEL_FALLBACKS = [
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
] as const;

async function analyzeWithClaude(
  pairs: LabeledPair[],
): Promise<AnalyzeResult | null> {
  const client = new Anthropic();

  const content = pairs.flatMap((p) => [
    {
      type: "text" as const,
      text: `View ${p.label}. Move-in pins (id, x, y in pixels): ${JSON.stringify(p.pins)}. BEFORE:`,
    },
    {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: "image/jpeg" as const,
        data: p.beforeBase64,
      },
    },
    { type: "text" as const, text: "AFTER:" },
    {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: "image/jpeg" as const,
        data: p.afterBase64,
      },
    },
  ]);

  try {
    const response = await client.messages.parse(
      {
        model: "claude-opus-5-5",
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        output_config: {
          effort: "high",
          format: zodOutputFormat(ChangeReportSchema),
        },
        messages: [{ role: "user", content }],
      },
      // Leaves room for the Gemini fallback inside the route's 300 s limit.
      { timeout: 80_000, maxRetries: 0 },
    );

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return null;
    }
    return { report: response.parsed_output, model: "claude-opus-5-5" };
  } catch (err) {
    console.error("analyzeWithClaude failed:", err);
    return null;
  }
}

/** One request to one Gemini model; null on any failure (HTTP error, timeout, bad JSON). */
async function geminiCall(
  model: string,
  parts: unknown[],
  apiKey: string,
  timeoutMs: number,
): Promise<AnalyzeResult | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: GEMINI_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: GEMINI_RESPONSE_SCHEMA,
          },
        }),
      },
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn(`Gemini ${model} failed (${res.status}):`, errBody.slice(0, 200));
      return null;
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;
    const parsed = GeminiReportSchema.safeParse(JSON.parse(rawText));
    if (!parsed.success) {
      console.warn(`Gemini ${model} schema validation mismatch:`, parsed.error.message);
      return null;
    }
    const changes = parsed.data.changes.flatMap(({ box_2d, ...rest }) => {
      const box = fromGeminiBox(box_2d);
      return box ? [{ ...rest, box }] : [];
    });
    return { report: { changes }, model };
  } catch (err) {
    console.warn(`Gemini ${model} request error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

const [BEST_MODEL, BACKUP_MODEL, FAST_MODEL] = GEMINI_MODEL_FALLBACKS;
/** After the fast model answers, how long to keep waiting for the more accurate one. */
const BEST_MODEL_GRACE_MS = 10_000;

/**
 * One batch of view pairs. The most accurate model and the fast model are asked at the same
 * time: the accurate answer wins if it arrives (or within a short grace period after the fast
 * one); otherwise the fast answer is used, so an overloaded model can't stall the comparison.
 * If both fail, the backup model gets one try.
 */
async function geminiBatch(
  pairs: LabeledPair[],
  apiKey: string,
): Promise<AnalyzeResult | null> {
  const parts = pairs.flatMap((p) => [
    {
      text: `View ${p.label}. Move-in pins (id, x, y in pixels): ${JSON.stringify(p.pins)}. BEFORE:`,
    },
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: p.beforeBase64,
      },
    },
    { text: "AFTER:" },
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: p.afterBase64,
      },
    },
  ]);

  // Worst case per batch: 45 s (both in parallel) + 35 s backup; batches also run in parallel.
  const best = geminiCall(BEST_MODEL, parts, apiKey, 45_000);
  const fast = geminiCall(FAST_MODEL, parts, apiKey, 30_000);

  const winner = await new Promise<AnalyzeResult | null>((resolve) => {
    let bestDone = false;
    let fastResult: AnalyzeResult | null = null;
    let fastDone = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = (r: AnalyzeResult | null) => {
      if (graceTimer) clearTimeout(graceTimer);
      resolve(r);
    };
    void best.then((r) => {
      bestDone = true;
      if (r) return finish(r);
      if (fastDone) finish(fastResult);
    });
    void fast.then((r) => {
      fastDone = true;
      fastResult = r;
      if (bestDone) return finish(r);
      if (r) graceTimer = setTimeout(() => finish(r), BEST_MODEL_GRACE_MS);
    });
  });
  if (winner) return winner;
  return geminiCall(BACKUP_MODEL, parts, apiKey, 35_000);
}

const GEMINI_BATCH_SIZE = 3;

/**
 * Sends the views in small batches at the same time: one request with 8+ image pairs can take
 * well over a minute (or time out), while 3-pair requests in parallel return in about the time
 * of one. A failed batch only loses its own views; results are merged.
 */
async function analyzeWithGemini(
  pairs: LabeledPair[],
  apiKey: string,
): Promise<AnalyzeResult | null> {
  const batches: LabeledPair[][] = [];
  for (let i = 0; i < pairs.length; i += GEMINI_BATCH_SIZE) {
    batches.push(pairs.slice(i, i + GEMINI_BATCH_SIZE));
  }
  const results = await Promise.all(batches.map((batch) => geminiBatch(batch, apiKey)));
  const ok = results.filter((r): r is AnalyzeResult => r !== null);
  if (ok.length === 0) return null;
  if (ok.length < results.length) {
    console.warn(`Gemini: ${results.length - ok.length} of ${results.length} view batches failed.`);
  }
  const models = [...new Set(ok.map((r) => r.model))];
  return {
    report: { changes: ok.flatMap((r) => r.report.changes) },
    model: models.join("+"),
  };
}

/**
 * Compares matched 1024x768 before/after render pairs server-side with structured outputs.
 * Uses Claude Opus 5.5 when ANTHROPIC_API_KEY is configured, or Google Gemini Flash when
 * GEMINI_API_KEY is configured. Returns null on failure so callers cleanly fall back to
 * cache or manual change mode.
 */
export async function analyzeRenderPairs(
  pairs: RenderPairInput[],
): Promise<AnalyzeResult | null> {
  if (pairs.length === 0 || pairs.length > 12) {
    throw new Error("Provide between 1 and 12 render pairs.");
  }

  // Models copy short labels back reliably; long view ids and 66-character pin ids they don't.
  const labeled: LabeledPair[] = pairs.map((p, i) => ({
    label: `V${i + 1}`,
    pins: p.pins.map((pin, j) => ({ id: `P${j + 1}`, x: pin.x, y: pin.y })),
    beforeBase64: p.beforeBase64,
    afterBase64: p.afterBase64,
  }));
  const viewByLabel = new Map(labeled.map((l, i) => [l.label, pairs[i].viewId]));
  const knownViews = new Set(pairs.map((p) => p.viewId));

  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    const claudeRes = await analyzeWithClaude(labeled);
    if (claudeRes) return { ...claudeRes, report: normalizeReport(claudeRes.report, viewByLabel, knownViews) };
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    const geminiRes = await analyzeWithGemini(labeled, geminiKey);
    if (geminiRes) return { ...geminiRes, report: normalizeReport(geminiRes.report, viewByLabel, knownViews) };
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim() && !geminiKey) {
    console.warn("Neither ANTHROPIC_API_KEY nor GEMINI_API_KEY is configured.");
  }
  return null;
}

/**
 * Maps the model's view labels back to real view ids and keeps every box inside the
 * 1024x768 render. Items naming an unknown view or with an empty box are dropped, since
 * code (not the model) later raycasts each box into the 3D scan.
 */
export function normalizeReport(
  report: ChangeReportOutput,
  viewByLabel: Map<string, string>,
  knownViews: Set<string>,
): ChangeReportOutput {
  const changes: ChangeReportOutput["changes"] = [];
  for (const c of report.changes) {
    const raw = String(c.view_id ?? "").trim();
    const viewId =
      viewByLabel.get(raw) ?? viewByLabel.get(raw.toUpperCase()) ?? (knownViews.has(raw) ? raw : null);
    if (!viewId) continue;
    const nums = [c.box.x, c.box.y, c.box.w, c.box.h];
    if (!nums.every((n) => Number.isFinite(n))) continue;
    const x = Math.min(Math.max(c.box.x, 0), RENDER_WIDTH);
    const y = Math.min(Math.max(c.box.y, 0), RENDER_HEIGHT);
    const w = Math.min(c.box.w, RENDER_WIDTH - x);
    const h = Math.min(c.box.h, RENDER_HEIGHT - y);
    if (w <= 0 || h <= 0) continue;
    changes.push({
      ...c,
      view_id: viewId,
      box: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) },
    });
  }
  return { changes };
}
