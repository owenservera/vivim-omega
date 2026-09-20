#!/usr/bin/env python3
"""Generate pack.builder fixture files (deterministic content, LF endings).

Seven valid + seven invalid fixtures — one pair per artifact schema. The
invalid fixture for each kind violates exactly ONE named rule so the failure
diagnostic is unambiguous. Hash-pinning happens in pin.ts (same pattern as the
sdk generality fixtures).
"""
import json
import pathlib

DIR = pathlib.Path(__file__).parent

S = "sha256:" + "a" * 64

valid = {
    "capture-receipt": {
        "schemaVersion": "1",
        "op": "forge.mine.capture@1",
        "mineId": "vivim-final-program@4a5eb84",
        "mineRoot": "/srv/mines/vivim-final-program",
        "capturedAt": "2026-09-20T00:00:00Z",
        "fileCount": 1,
        "rootHash": S,
        "files": [{"path": "src/main.ts", "hash": S, "bytes": 120, "casRef": "cas:abc123"}],
        "refusals": [{"path": "node_modules/x", "reason": "dependency tree outside the declared mine"}],
    },
    "inventory-row": {
        "schemaVersion": "1",
        "path": "src/main.ts",
        "hash": S,
        "bytes": 120,
        "language": "typescript",
        "exports": ["main"],
        "imports": ["node:path"],
        "models": [],
        "headings": [],
    },
    "assay-verdict": {
        "schemaVersion": "1",
        "subjectPath": "src/engines/parsers/chatgpt-import.ts",
        "disposition": "PORT",
        "harvestClass": "ALGORITHM",
        "clusters": ["C6-parsing"],
        "boundaries": [
            {
                "op": "parser.history.import@1",
                "rationale": "pure transform over recorded bytes; refusable (bad input), substitutable (claude/gemini variants), provable (recorded fixtures)",
                "refusable": True,
                "substitutable": True,
                "provable": True,
            }
        ],
        "risks": ["timestamp source removed (ts:0 + tsEstimated)"],
        "evidence": ["fixture:import/chatgpt-conversations@" + "b" * 7],
    },
    "shape-blueprint": {
        "schemaVersion": "1",
        "namespaces": [{"name": "chat", "writer": "vivim.chat", "readers": ["vivim.mind"], "retention": "conversations hot 180d; messages capped per D-378"}],
        "plugins": [
            {
                "id": "vivim.chat",
                "ops": ["chat.open@1", "chat.append@1", "chat.history@1"],
                "writtenNamespace": "chat",
                "generality": {"level": "harvested", "mine": "vivim-final-program@4a5eb84", "originPaths": ["src/engines/conversation-store.ts"], "harvestClass": "SHAPED", "evidence": []},
            },
            {"id": "vivim.mind", "ops": ["mind.snapshot@1"], "writtenNamespace": None, "generality": {"level": "speculative", "mine": None, "originPaths": [], "harvestClass": None, "evidence": []}},
        ],
        "compositions": [{"id": "chat", "members": ["vivim.law", "vivim.vault", "vivim.chat"]}],
        "mappings": [{"source": "src/engines/conversation-store.ts", "targetOp": "chat.append@1", "reason": "the store's append path is the op's body; one writer of ns chat"}],
    },
    "proposal-artifact": {
        "schemaVersion": "1",
        "targetPath": "scratch/forge-author/plugin.json",
        "artifactKind": "manifest",
        "contentHash": S,
        "generatedBy": "forge.author.init@1",
        "ledgerRef": None,
        "authority": "none",
        "justification": "self-hosting emission: the Author Forge reproduces its own manifest from spec/self.json",
    },
    "proof-report": {
        "schemaVersion": "1",
        "subject": "plugins/forge-author",
        "op": "forge.proof.replay@1",
        "result": "pass",
        "checks": [{"name": "byte-identical outside AUTHORED regions", "result": "pass", "diff": None}],
        "replayHash": S,
        "refusalResults": [{"name": "SPEC_UNKNOWN_FIELD", "result": "pass"}],
    },
    "generality-stamp": {
        "schemaVersion": "1",
        "level": "harvested",
        "mine": "vivim-final-program@4a5eb84",
        "originPaths": ["src/engines/parsers/chatgpt-import.ts"],
        "harvestClass": "ALGORITHM",
        "evidence": ["fixture:import/chatgpt-conversations@" + "b" * 7],
    },
}

# Each invalid fixture breaks exactly ONE named rule (the failure names itself).
invalid = {
    "capture-receipt": ("hash grammar", lambda v: {**v, "files": [{**v["files"][0], "hash": "not-a-hash"}]}),
    "inventory-row": ("language must be string|null", lambda v: {**v, "language": 7}),
    "assay-verdict": ("disposition enum", lambda v: {**v, "disposition": "KEEP"}),
    "shape-blueprint": ("writer must be non-empty", lambda v: {**v, "namespaces": [{**v["namespaces"][0], "writer": ""}]}),
    "proposal-artifact": ("authority must be the literal 'none' — emission confers no authority", lambda v: {**v, "authority": "granted"}),
    "proof-report": ("check result enum", lambda v: {**v, "checks": [{**v["checks"][0], "result": "maybe"}]}),
    "generality-stamp": ("mine must be pinned <repo>@<sha>", lambda v: {**v, "mine": "unpinned"}),
}


def write(kind: str, body: dict, subdir: str) -> None:
    p = DIR / subdir / f"{kind}.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8", newline="\n")


for kind, body in valid.items():
    write(kind, body, "valid")
for kind, (reason, mutate) in invalid.items():
    write(kind, mutate(valid[kind]), "invalid")

print(f"wrote {len(valid)} valid + {len(invalid)} invalid fixtures to {DIR}")
