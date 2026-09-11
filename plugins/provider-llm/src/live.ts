// provider-llm — live.ts: the openai-compatible HTTP leg. OWNER-MACHINE ONLY.
//
// DEAD CODE IN-SANDBOX, BY CONSTRUCTION (this is the honest way to ship it):
//   * the path runs only when ctx.config.live is set by the composition AND the
//     composition granted the `credential.use` capability — no in-sandbox
//     composition grants it, and no credentials spine (the plugin that would
//     route `credential.use@1`) exists yet;
//   * even if a test composition granted `credential.use`, the port call below
//     fails closed (the shim refuses locally: "no capability token for
//     credential.use@1") because the grant grammar for the op is
//     `port:credential.use@1` — a capability no recipe in this repo carries.
//
// The code is kept real and complete because the owner machine will run it as-is.
// CREDENTIAL LAW (docs/SURFACES.md):
//   * the API key NEVER appears in the payload (config is data passthrough,
//     never authority and never a secret store) and NEVER in the environment;
//   * the key is fetched per-call through the port from the credentials spine
//     (op `credential.use@1`), referenced only by {credentialId};
//   * the target is an openai-compatible POST {baseUrl}/chat/completions.
import type { PluginContext } from "@vivim/omega-shim";
import type { ChatRequest, ChatCompletion } from "./simulator.ts";

export interface LiveConfig {
  baseUrl: string;     // e.g. "https://api.openai.com/v1"
  model: string;       // e.g. "gpt-4o-mini"
  credentialId: string; // reference into the owner machine's credential vault
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseLiveConfig(v: unknown): LiveConfig {
  if (!isObj(v)) throw new Error("chat.complete: config.live must be an object {baseUrl, model, credentialId}");
  const baseUrl = v["baseUrl"];
  const model = v["model"];
  const credentialId = v["credentialId"];
  if (typeof baseUrl !== "string" || !/^https?:\/\//.test(baseUrl)) {
    throw new Error(`chat.complete: config.live.baseUrl must be an http(s) URL (got ${JSON.stringify(baseUrl)})`);
  }
  if (typeof model !== "string" || !model) {
    throw new Error("chat.complete: config.live.model must be a non-empty string");
  }
  if (typeof credentialId !== "string" || !credentialId) {
    throw new Error("chat.complete: config.live.credentialId must be a non-empty string (a reference, never the secret itself)");
  }
  return { baseUrl, model, credentialId };
}

export async function liveComplete(ctx: PluginContext, cfg: LiveConfig, req: ChatRequest): Promise<Omit<ChatCompletion, "sim" | "seed"> & { sim: false }> {
  // 1. fetch the credential THROUGH THE PORT (never payload, never env). The
  //    credentials spine owns the secret; this compartment only borrows it per-call.
  const cred = await ctx.port.call("credential.use@1", { credentialId: cfg.credentialId }, 5000);
  if (!cred.ok) {
    throw new Error(
      `chat.complete (live): credential '${cfg.credentialId}' unavailable — ${cred.error}: ${cred.detail ?? ""}. ` +
      "The credentials spine must route credential.use@1 and the composition must grant port:credential.use@1. " +
      "This leg is owner-machine only (docs/SURFACES.md credential law).",
    );
  }
  const secret = (cred.value as { secret?: unknown } | null)?.secret;
  if (typeof secret !== "string" || !secret) {
    throw new Error("chat.complete (live): credentials spine returned no usable secret (expected {secret: string}) — refusing");
  }

  // 2. the openai-compatible chat completion call
  const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: req.temperature,
      max_tokens: req.maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`chat.complete (live): HTTP ${res.status} from ${cfg.baseUrl}`);
  const data = (await res.json()) as {
    model?: string;
    choices?: Array<{ message?: { role?: string; content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const msg = data.choices?.[0]?.message;
  if (!msg || typeof msg.content !== "string") {
    throw new Error("chat.complete (live): unexpected response shape (no choices[0].message.content)");
  }
  return {
    completion: { role: "assistant", content: msg.content },
    model: data.model ?? cfg.model,
    sim: false,
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    },
    finishReason: data.choices?.[0]?.finish_reason === "length" ? "length" : "stop",
  };
}
