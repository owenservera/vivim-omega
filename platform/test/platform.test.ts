// @vivim/omega-platform — unit tests (D-372): the seam's contract.
// Falsifier for the whole concept: same assertions green on every OS.
import { describe, test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { TMP_TOKEN, tmpRoot, omegaTmp, isGrandfatheredTmp, resolveDataDir, ownerOnly, retryOsLock } from "../src/platform.ts";

describe("platform seam (D-372)", () => {
  test("tmpRoot is the machine scratch root", () => {
    expect(tmpRoot()).toBe(tmpdir());
  });

  test("omegaTmp joins under the scratch root", () => {
    expect(omegaTmp("omega-x", "run-1")).toBe(join(tmpdir(), "omega-x", "run-1"));
  });

  test("token spelling resolves under the scratch root", () => {
    expect(resolveDataDir(`${TMP_TOKEN}/omega-chat/vault-data`)).toBe(join(tmpdir(), "omega-chat", "vault-data"));
    expect(resolveDataDir(TMP_TOKEN)).toBe(tmpdir());
  });

  test("grandfathered /tmp spelling maps to the identical result (portable recipes)", () => {
    expect(resolveDataDir("/tmp/omega-chat/vault-data")).toBe(resolveDataDir(`${TMP_TOKEN}/omega-chat/vault-data`));
    expect(isGrandfatheredTmp("/tmp/x")).toBe(true);
    expect(isGrandfatheredTmp(`${TMP_TOKEN}/x`)).toBe(false);
    expect(isGrandfatheredTmp("./dev-vault/vault-data")).toBe(false);
  });

  test("relative and absolute pass through verbatim (plugin-relative + operator override)", () => {
    expect(resolveDataDir("./dev-vault/vault-data")).toBe("./dev-vault/vault-data");
    expect(resolveDataDir("packs/domain-email/plugin.json")).toBe("packs/domain-email/plugin.json");
    const abs = join(tmpdir(), "operator", "vault-data");
    expect(resolveDataDir(abs)).toBe(abs);
  });

  test("empty/non-string input throws fail-closed", () => {
    expect(() => resolveDataDir("")).toThrow(/non-empty/);
    expect(() => resolveDataDir(undefined)).toThrow(/non-empty/);
    expect(() => resolveDataDir(42)).toThrow(/non-empty/);
  });

  test("ownerOnly never throws (Windows ACL best-effort)", () => {
    const dir = mkdtempSync(join(tmpdir(), "omega-platform-"));
    try {
      const f = join(dir, "key");
      writeFileSync(f, "{}");
      expect(() => ownerOnly(f)).not.toThrow();
      expect(() => ownerOnly(join(dir, "missing"))).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("retryOsLock returns the first success (transient locks absorbed)", () => {
    let n = 0;
    const v = retryOsLock(() => {
      n++;
      if (n < 3) throw Object.assign(new Error("locked"), { code: "EBUSY" });
      return "ok";
    });
    expect(v).toBe("ok");
    expect(n).toBe(3);
  });

  test("retryOsLock rethrows non-retryable errors immediately", () => {
    let n = 0;
    expect(() =>
      retryOsLock(() => {
        n++;
        throw new Error("permanent");
      }),
    ).toThrow(/permanent/);
    expect(n).toBe(1);
  });

  test("retryOsLock exhausts the budget then rethrows the last error", () => {
    let n = 0;
    expect(() =>
      retryOsLock(
        () => {
          n++;
          throw Object.assign(new Error("busy"), { code: "EPERM" });
        },
        { tries: 3, baseMs: 1 },
      ),
    ).toThrow(/busy/);
    expect(n).toBe(3);
  });
});
