import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

// Central Claude client. Model and effort are configurable; secrets stay server-side
// and are never included in prompts.

export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5";
const EFFORT = (process.env.AI_EFFORT || "medium") as "low" | "medium" | "high" | "xhigh" | "max";
const FALLBACKS_ON = process.env.AI_REFUSAL_FALLBACKS !== "off";

let client: Anthropic | null = null;

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 2, timeout: 5 * 60_000 });
  return client;
}

export class AIError extends Error {}

/**
 * Structured generation: Claude returns JSON validated against a Zod schema.
 * Uses server-side refusal fallbacks (`fallbacks: "default"`) so a policy
 * decline on the primary model is retried on a suitable fallback model.
 */
export async function generateStructured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  prompt: string;
  maxTokens?: number;
  effort?: typeof EFFORT;
}): Promise<z.infer<S>> {
  if (!aiConfigured()) throw new AIError("AI is not configured (set ANTHROPIC_API_KEY).");
  try {
    const res = await getClient().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort ?? EFFORT, format: betaZodOutputFormat(opts.schema) },
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.prompt }],
      ...(FALLBACKS_ON ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (res.stop_reason === "refusal") {
      throw new AIError("The AI declined this request. Try rephrasing the topic.");
    }
    if (res.stop_reason === "max_tokens") {
      throw new AIError("The AI response was cut off. Try requesting fewer items at once.");
    }
    if (!res.parsed_output) throw new AIError("The AI returned an unreadable response.");
    return res.parsed_output as z.infer<S>;
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AIError("AI authentication failed. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) throw new AIError("AI rate limit reached. Please retry shortly.");
    if (e instanceof Anthropic.BadRequestError) throw new AIError(`AI request rejected: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new AIError(`AI service error (${e.status ?? "network"}).`);
    throw e;
  }
}
