/**
 * One AI turn: the model reads the conversation, may use tools a few times, and writes the
 * reply. The API call is passed in, so the loop is tested without the network.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { cleanAgentReply } from "./prompt";
import type { AgentAction, ToolOutcome } from "./tools";

/** Checking times, booking and confirming take three or four rounds; more means something is off. */
export const MAX_TOOL_ROUNDS = 6;

export type CreateMessage = (params: {
  system: Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  tools: Anthropic.Beta.BetaTool[];
}) => Promise<Anthropic.Beta.BetaMessage>;

export type AgentTurn =
  | { status: "reply"; text: string; actions: AgentAction[] }
  /** Nothing to send, but actions may have happened (a handoff with no text). */
  | { status: "silent"; actions: AgentAction[] }
  | { status: "declined"; actions: AgentAction[] }
  | { status: "failed"; actions: AgentAction[]; reason: string };

export async function runAgentTurn(input: {
  createMessage: CreateMessage;
  system: Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  tools: Anthropic.Beta.BetaTool[];
  runTool: (name: string, input: unknown) => Promise<ToolOutcome>;
}): Promise<AgentTurn> {
  const messages = [...input.messages];
  const actions: AgentAction[] = [];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const response = await input.createMessage({ system: input.system, messages, tools: input.tools });
    if (response.stop_reason === "refusal") return { status: "declined", actions };

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      if (response.stop_reason === "max_tokens") return { status: "failed", actions, reason: "max_tokens" };
      const text = cleanAgentReply(
        response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n"),
      );
      return text ? { status: "reply", text, actions } : { status: "silent", actions };
    }

    if (round === MAX_TOOL_ROUNDS) break;
    // The whole response goes back unchanged: thinking blocks included.
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of toolUses) {
      let outcome: ToolOutcome;
      try {
        outcome = await input.runTool(use.name, use.input);
      } catch {
        outcome = { content: "Erro ao executar. Chame a equipe.", isError: true };
      }
      if (outcome.action) actions.push(outcome.action);
      results.push({ type: "tool_result", tool_use_id: use.id, content: outcome.content, ...(outcome.isError ? { is_error: true } : {}) });
    }
    // All results of one round in a single message.
    messages.push({ role: "user", content: results });
  }
  return { status: "failed", actions, reason: "too_many_rounds" };
}
