import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { logEvent } from "@/lib/log";
import { cleanReply } from "./prompts";

/** The current Opus model, with the API's fallback when it declines a request. */
const MODEL = "claude-opus-5-5";

/** Off until the server has a key: nothing here runs, or costs, without one. */
export function isAssistantEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;

export type AssistantResult = { ok: true; text: string } | { ok: false; reason: "disabled" | "declined" | "unavailable" };

/**
 * One short request. Effort is low: these are short texts, and lower effort means a faster
 * answer for someone waiting in the inbox.
 */
export async function askAssistant(system: string, prompt: string): Promise<AssistantResult> {
  if (!isAssistantEnabled()) return { ok: false, reason: "disabled" };
  client ??= new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") return { ok: false, reason: "declined" };
    const text = cleanReply(
      response.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n"),
    );
    return text ? { ok: true, text } : { ok: false, reason: "unavailable" };
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      logEvent("ai.failed", { status: error.status ?? null }, "warn");
    } else {
      logEvent("ai.failed", { error: error instanceof Error ? error.name : "unknown" }, "warn");
    }
    return { ok: false, reason: "unavailable" };
  }
}
