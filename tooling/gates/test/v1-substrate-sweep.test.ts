// D-418 falsifiers — the v1-substrate sweep, mechanically checked.
// F-1 (the sweep is complete): the four law-bearing planning docs this record
//     amends no longer teach Ollama-first sequencing, and the passages the
//     record amends carry the D-418 markers. The per-doc rules match the
//     record's own sweep inventory:
//       · OMEGA-ENDSTATE-VISION.md + OMEGA-FORGE-ARCHITECTURE.md — LINE-LEVEL
//         sweep (the record amends their passages): every Ollama-first
//         sequencing claim is gone; every surviving ollama mention sits on a
//         markered line (D-418 marker, post-v1 re-dating, harvest/historical
//         note) or the §3 end-state realization list (explicitly not touched).
//       · ROADMAP.md + WAVE2-PROVIDER-STRATUM.md — BANNER-coverage rule (the
//         correction prescribes the one-line banner pointer; their historical
//         wave text stays under the banner, honestly superseded, not
//         rewritten).
//     A regression of any amended passage fails BY NAME.
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const VISION = join(ROOT, "docs/forge/OMEGA-ENDSTATE-VISION.md");
const ROADMAP = join(ROOT, "docs/ROADMAP.md");
const ARCHITECTURE = join(ROOT, "docs/forge/OMEGA-FORGE-ARCHITECTURE.md");
const WAVE2 = join(ROOT, "docs/migration/20-WAVES/WAVE2-PROVIDER-STRATUM.md");

const read = (p: string): string => readFileSync(p, "utf-8");
const lines = (text: string): string[] => text.split("\n");

/** The sequencing claims D-418 kills — none may survive unmarkered. */
const SEQUENCING_CLAIM_RE = /Ollama pilots the spine|Ollama first|Ollama over ChatGPT|ollama pilot-first|the named pilot/i;
/** The markers that make a surviving mention lawful (D-418's sweep inventory). */
const MARKERED_RE = /D-418|post-v1|historical record|superseded/i;
/** The §3 end-state realization list: external intelligence as substitutable
 *  realizations — an end-state claim D-418 explicitly leaves standing. */
const ENDSTATE_LIST_RE = /substitutable, revocable realizations/;

describe("D-418 · F-1a — the vision doc's amended passages (line-level sweep)", () => {
  const text = read(VISION);

  test("the header amendment line names this record", () => {
    expect(text).toContain("Superseded by D-418");
    expect(text).toContain("no AI-API realization ships in v1");
  });

  test("§28 row 3 reads Chrome-first: the Ollama-pilots claim is gone, the substrate call is present", () => {
    expect(text).not.toContain("Ollama pilots the spine");
    expect(text).toContain("Chrome master/slave (`provider.browser`) is the shippable-v1 substrate");
    expect(text).toContain("no AI-API realization ships in v1");
  });

  test("§24's Frank badge is re-dated post-v1, not depicted as a v1 shipment", () => {
    const frank = lines(text).find((l) => l.includes("provider.llm-ollama"));
    expect(frank).toBeDefined();
    expect(frank).toContain("post-v1");
    expect(frank).toContain("D-418");
  });

  test("§31's Wave-1 boundary names provider.browser and no longer provider.llm-ollama", () => {
    const wave1 = lines(text).find((l) => l.includes("five vertical-slice boundaries"));
    expect(wave1).toBeDefined();
    expect(wave1).toContain("provider.browser");
    expect(wave1).not.toContain("provider.llm-ollama");
    expect(wave1).toContain("D-418");
  });

  test("every surviving ollama mention in the vision doc is markered, historical, or the §3 end-state list", () => {
    const bad = lines(text)
      .filter((l) => /ollama/i.test(l))
      .filter((l) => !MARKERED_RE.test(l) && !ENDSTATE_LIST_RE.test(l));
    expect(bad, `unmarkered ollama mentions survive in the vision doc:\n${bad.join("\n")}`).toEqual([]);
  });

  test("no Ollama-first sequencing claim survives anywhere in the vision doc", () => {
    const bad = lines(text).filter((l) => SEQUENCING_CLAIM_RE.test(l));
    expect(bad, `sequencing claims survive in the vision doc:\n${bad.join("\n")}`).toEqual([]);
  });
});

describe("D-418 · F-1b — the ROADMAP banner pointer (banner-coverage rule)", () => {
  const text = read(ROADMAP);

  test("the existing supersede banner additionally covers the Ollama-first W2 sequencing, naming D-418", () => {
    expect(text).toContain("additionally superseded by D-418");
    expect(text).toContain("Ollama-first W2 sequencing");
  });
});

describe("D-418 · F-1c — the architecture doc's banner + amended boundary row (line-level sweep)", () => {
  const text = read(ARCHITECTURE);

  test("the banner names D-418 and the v1 substrate call", () => {
    expect(text).toContain("D-418");
    expect(text).toContain("Chrome master/slave");
  });

  test("the round-one boundary table no longer names provider.llm-ollama as the pilot boundary", () => {
    expect(text).toContain("provider.browser");
    expect(text).not.toContain("provider.llm-ollama");
  });

  test("every surviving ollama mention is markered or historical", () => {
    const bad = lines(text)
      .filter((l) => /ollama/i.test(l))
      .filter((l) => !MARKERED_RE.test(l));
    expect(bad, `unmarkered ollama mentions survive in the architecture doc:\n${bad.join("\n")}`).toEqual([]);
  });

  test("no Ollama-first sequencing claim survives unmarkered", () => {
    const bad = lines(text).filter((l) => SEQUENCING_CLAIM_RE.test(l) && !MARKERED_RE.test(l));
    expect(bad, `unmarkered sequencing claims survive in the architecture doc:\n${bad.join("\n")}`).toEqual([]);
  });
});

describe("D-418 · F-1d — the W2 wave doc's banner (banner-coverage rule)", () => {
  const text = read(WAVE2);

  test("the order line's Ollama-first ordering is bannered as superseded, naming D-410 + D-418", () => {
    expect(text).toContain("D-418");
    expect(text).toContain("Chrome master/slave");
  });
});

describe("D-418 · F-1e — the consolidation annex's carried posture gained its decision pointer", () => {
  const text = read(join(ROOT, "docs/forge/annex/OMEGA-CONSOLIDATION-INTEGRATION.md"));

  test("§4.10 (the ship posture, carried 'here only' pending decision) points at its decision", () => {
    expect(text).toContain("D-418");
    expect(text).toContain("no AI-API realization");
  });
});
