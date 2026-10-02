import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { CONFIG } from "../config.js";

export const anthropic = new Anthropic();

export interface Call {
  /** Consigne stable, mise en cache d'une requête à l'autre. */
  system: string;
  content: Anthropic.ContentBlockParam[];
  maxTokens?: number;
  /** Pour déléguer une tâche annexe à un modèle moins cher. */
  model?: string;
  effort?: typeof CONFIG.anthropic.effort;
}

function common(call: Call) {
  return {
    model: call.model ?? CONFIG.anthropic.model,
    // La réflexion est adaptative par défaut ; `effort` en règle la profondeur.
    output_config: { effort: call.effort ?? CONFIG.anthropic.effort },
  } as const;
}

function systemBlocks(system: string): Anthropic.TextBlockParam[] {
  return [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
}

/** Réponse en texte libre (fiche, résumé, explication). En streaming : les sorties sont longues. */
export async function generateText(call: Call): Promise<string> {
  const { system, content, maxTokens = 32_000 } = call;
  const stream = anthropic.messages.stream({
    ...common(call),
    max_tokens: maxTokens,
    system: systemBlocks(system),
    messages: [{ role: "user", content }],
  });
  const message = await stream.finalMessage();
  assertUsable(message.stop_reason, message.stop_details);
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Réponse validée contre un schéma zod (flashcards, quiz, verdicts). */
export async function generateStructured<S extends z.ZodType>(
  call: Call,
  schema: S,
): Promise<z.infer<S>> {
  const { system, content, maxTokens = 16_000 } = call;
  const base = common(call);
  const message = await anthropic.messages.parse({
    ...base,
    max_tokens: maxTokens,
    system: systemBlocks(system),
    output_config: { ...base.output_config, format: zodOutputFormat(schema) },
    messages: [{ role: "user", content }],
  });
  assertUsable(message.stop_reason, message.stop_details);
  if (!message.parsed_output) {
    throw new Error(`Claude a renvoyé une sortie illisible (stop_reason=${message.stop_reason})`);
  }
  return message.parsed_output;
}

function assertUsable(stopReason: string | null, stopDetails: Anthropic.RefusalStopDetails | null | undefined): void {
  if (stopReason === "refusal") {
    throw new Error(`Claude a refusé de répondre (${stopDetails?.category ?? "sans catégorie"})`);
  }
  if (stopReason === "max_tokens") {
    throw new Error("Réponse coupée : relance avec KCL_MAX_TOKENS plus haut, ou sur un périmètre plus petit.");
  }
}
