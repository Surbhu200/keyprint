import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ProjectedPin2D } from "./matching";

export const AI_PROMPT_VERSION = "keyprint-diff-v1";

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
- If a mark or scratch already existed identically in BEFORE and AFTER, do NOT flag it as a new change.`;

/**
 * Calls Claude Opus 5.5 server-side with structured outputs (zodOutputFormat).
 * Returns null on refusal, missing key, or network/API error so callers cleanly
 * fall back to the cached report or manual change mode.
 */
export async function analyzeRenderPairs(
  pairs: RenderPairInput[],
): Promise<ChangeReportOutput | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY not configured; falling back to cache/manual.");
    return null;
  }
  if (pairs.length === 0 || pairs.length > 12) {
    throw new Error("Provide between 1 and 12 render pairs.");
  }

  const client = new Anthropic();

  const content = pairs.flatMap((p) => [
    {
      type: "text" as const,
      text: `View ${p.viewId}. Move-in pins (id, x, y in pixels): ${JSON.stringify(p.pins)}. BEFORE:`,
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
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "high",
        format: zodOutputFormat(ChangeReportSchema),
      },
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return null;
    }
    return response.parsed_output;
  } catch (err) {
    console.error("analyzeRenderPairs failed:", err);
    return null;
  }
}
