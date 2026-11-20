import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ProjectedPin2D } from "./matching";

export const AI_PROMPT_VERSION = "keyprint-diff-v2";

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

const SYSTEM_PROMPT = `You are inspecting two 1024x768 3D room renders taken from the exact same camera viewpoint: BEFORE (move-in) and AFTER (move-out).

List physical changes to the apartment unit between BEFORE and AFTER.
Ignore lighting shifts, exposure, color balance, scan noise, holes or stretched textures from 3D reconstruction, and personal belongings that moved.

Label each item strictly as one of:
- possible_damage: holes, burns, large stains, broken fixtures, deep gouges
- possible_wear: light scuffs, faded paint, carpet wear in walkways, small nail holes
- not_a_real_change: likely a scan artifact or shadow

Important rules:
- These are suggestions for people to review, never legal or billing verdicts.
- Never estimate repair costs or dollar amounts.
- Provide pixel bounding boxes in the 1024x768 AFTER image (origin top-left, y down).
- Use low confidence whenever uncertain.
- If a mark or scratch already existed identically in BEFORE and AFTER, do NOT flag it as a new change.
- Set view_id to the exact view label (V1, V2, ...) written before each BEFORE/AFTER pair.`;

const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    changes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          view_id: { type: "STRING" },
          box: {
            type: "OBJECT",
            properties: {
              x: { type: "NUMBER" },
              y: { type: "NUMBER" },
              w: { type: "NUMBER" },
              h: { type: "NUMBER" },
            },
            required: ["x", "y", "w", "h"],
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
        required: ["view_id", "box", "title", "description", "category", "confidence"],
      },
    },
  },
  required: ["changes"],
};

// Measured Nov 19 with this project's key: 3.5-flash answered one pair in ~5 s and found both
// planted changes; 3.8-flash timed out at 55 s on the same pair, so it's the last resort.
const GEMINI_MODEL_FALLBACKS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
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
      { timeout: 110_000, maxRetries: 0 },
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

async function analyzeWithGemini(
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

  for (const model of GEMINI_MODEL_FALLBACKS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          signal: AbortSignal.timeout(55_000),
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
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
        continue;
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      const parsed = ChangeReportSchema.safeParse(JSON.parse(rawText));
      if (parsed.success) {
        return { report: parsed.data, model };
      }
      console.warn(`Gemini ${model} schema validation mismatch:`, parsed.error.message);
    } catch (err) {
      console.warn(`Gemini ${model} request error:`, err);
    }
  }

  return null;
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
