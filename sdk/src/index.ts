// @vivim/omega-sdk — public API.
// Schemas (zod mirror of the pinned contracts), semantic validators, manifest
// signing (host canon wrappers), and the typed port client.
export * from "./schema.ts";
export * from "./validate.ts";
export * from "./sign.ts";
export * from "./client.ts";
export * from "./stream.ts"; // D-352 — the streaming consumer half
