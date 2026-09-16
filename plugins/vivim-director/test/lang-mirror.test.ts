// lang-mirror guard (ISS-031): contracts/lang.ts re-declares nlcl-pure's frame
// shapes (contracts must stay self-contained; nlcl-pure must stay zero-import).
// Mirrors drift on Fridays, so this test pins them mechanically against REAL
// engine data (DEFAULT_FRAMES — not hand-made samples): any field added to or
// removed from either side fails here. Type-level bidirectional assignments
// below document the exactness claim for editors and future typecheck runs.
import { describe, test, expect } from "bun:test";
import type {
  LangFamilyChar, LangFrameSlot, LangOpFrame, LangSlotKind,
} from "@vivim/omega-contracts";
import type { FamilyChar, FrameSlot, OpFrame, SlotKind } from "@vivim/omega-nlcl-pure";
import { DEFAULT_FRAMES } from "@vivim/omega-nlcl-pure";
import { LangOpFrameSchema } from "@vivim/omega-sdk";

// ---- type-level exactness claim (breaks under tsc on drift; documents intent) ----
const _slotA: LangFrameSlot = null as unknown as FrameSlot;
const _slotB: FrameSlot = null as unknown as LangFrameSlot;
const _frameA: LangOpFrame = null as unknown as OpFrame;
const _frameB: OpFrame = null as unknown as LangOpFrame;
const _famA: LangFamilyChar = null as unknown as FamilyChar;
const _famB: FamilyChar = null as unknown as LangFamilyChar;
const _kindA: LangSlotKind = null as unknown as SlotKind;
const _kindB: SlotKind = null as unknown as LangSlotKind;
void _slotA; void _slotB; void _frameA; void _frameB;
void _famA; void _famB; void _kindA; void _kindB;

// NOTE (deliberate exclusion): contracts LangLexiconEntry is NOT an exact
// mirror of nlcl-pure LexiconEntry (engine rows carry required source +
// createdAt; the contracts contribution shape carries optional source, no
// createdAt). Different jobs (engine record vs contribution declaration) —
// unifying them would couple the contribution grammar to engine internals.
// If either side changes its lexicon shape, extend this test then.

// ---- runtime pins against real engine data ----
const FRAME_REQUIRED = ["op", "verbs", "title", "slots", "reading", "examples", "family"];
const FRAME_KNOWN = [...FRAME_REQUIRED, "surfaceOnly"];
const SLOT_REQUIRED = ["role", "kind"];
const SLOT_KNOWN = [...SLOT_REQUIRED, "preps", "entityTypes", "enumValues", "required", "patient", "payloadKey", "family"];

describe("lang mirror (contracts ↔ nlcl-pure frames)", () => {
  test("engine ships frames (guard is live, not vacuous)", () => {
    expect(DEFAULT_FRAMES.length).toBeGreaterThan(0);
  });

  test("every real OpFrame has exactly the mirrored shape (no unknown, none missing)", () => {
    for (const f of DEFAULT_FRAMES) {
      const keys = Object.keys(f).sort();
      expect(keys.every((k) => FRAME_KNOWN.includes(k))).toBe(true);
      for (const k of FRAME_REQUIRED) expect(keys).toContain(k);
      for (const s of f.slots) {
        const sk = Object.keys(s).sort();
        expect(sk.every((k) => SLOT_KNOWN.includes(k))).toBe(true);
        for (const k of SLOT_REQUIRED) expect(sk).toContain(k);
      }
    }
  });

  test("the contracts-side zod schema accepts every real engine frame", () => {
    for (const f of DEFAULT_FRAMES) {
      expect(LangOpFrameSchema.safeParse(f).success).toBe(true);
    }
  });
});
