// provider-llm — live.ts: the openai-compatible HTTP leg. OWNER-MACHINE ONLY.
//
// DEAD CODE IN-SANDBOX, BY CONSTRUCTION (this is the honest way to ship it):
//   * the path runs only when ctx.config.live is set by the composition AND the
//     composition granted the `credential.use` capability — no in-sandbox
//     composition grants it (the grant grammar is `port:credential.use@1`, a
//     capability no recipe in this repo carries);
//   * the in-tree credentials spine (plugins/vivim-credentials, D-356) DOES route
//     credential.use@1 — but it stores sim-synthetic REFERENCE rows only, never
//     secret material (SURFACES.md credential law: live secrets never enter the
//     sandbox). Even with the capability granted, the check below refuses: the
//     spine structurally cannot return {secret} (D-384 documents this shape —
//     the mismatch is the designed fail-closed path, not a bug).
//
// The code is kept real and complete because the owner machine will run it as-is
// against a credentials spine that returns real material ({secret: string}).
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
  const credVal = (cred.value ?? null) as Record<string, unknown> | null;
  const secret = credVal?.["secret"];
  if (typeof secret !== "string" || !secret) {
    // D-384: name the actual contract shape — the in-tree spine returns sim-synthetic
    // reference rows ({credentialId, kind: "sim-synthetic", sim: true}), never {secret}.
    const kind = credVal && "kind" in credVal ? String(credVal["kind"]) : "no record";
    throw new Error(
      `chat.complete (live): credentials spine returned no usable secret (kind: ${kind}; expected {secret: string}) — ` +
      "the in-tree vivim-credentials spine stores sim-synthetic REFERENCE rows only " +
      "(SURFACES.md credential law: live secrets never enter the sandbox); a live call " +
      "requires an owner-machine credentials spine. Refusing (fail-closed).",
    );
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
