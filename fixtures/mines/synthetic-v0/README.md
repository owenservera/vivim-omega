# pantrylog — the synthetic second mine (v0)

A small offline kitchen log: recipes as DATA, an append-only JSONL event
store, derived per-recipe indexes, and a plain-text renderer. Runs anywhere
Python 3 runs; no network, no database server, no framework.

## Why this shape (the mine's charter)

This mine exists to keep the Omega Forge honest: it shares NO shape with the
Vivim cluster it will be mined beside. Concretely, it is NOT:

- a plugin system (no manifest-driven compartment, no ports, no host);
- a capability graph (there are grants of nothing; access is file perms);
- a browser automation stack (no CDP, no DOM, no sessions);
- a Prisma/Next.js app (no ORM, no SSR, no JS at all);
- a chat/LLM harness (no providers, no prompts, no streams).

Its persistence is an append-only `log/events.jsonl` plus derived index
files — flat files over an event log, the opposite of a SQL store with a
content-addressed blob layer. Mining code that accidentally assumes
"SQL + blobs + plugin manifests" will fail loudly here, which is the point.

## Layout

    bin/run.sh         CLI entry (add, plan, cook, list, render)
    src/               pure Python modules (store, query, workflow, render)
    data/              the seed catalog: recipes, units, pantry, tags
    examples/          recorded recipes and data-driven workflows
    docs/              design notes, schema, decision log
    tests/             unittest suite (run: make test)

## Quick start

    make seed        # init log/ + indexes/ from data/
    bin/run.sh cook oatmeal-bowl
    bin/run.sh plan week --workflow examples/workflow-weekly-plan.json
    make verify      # re-derive indexes and diff (determinism proof)

Determinism: same seed data + same commands -> identical bytes, every time.
MANIFEST.json pins every file's sha256 and a root hash.
