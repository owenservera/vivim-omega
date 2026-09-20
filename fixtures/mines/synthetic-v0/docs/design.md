# pantrylog design notes

One event log, honestly derived views. The store APPENDS; every read is a
fold over the log; indexes are disposable derived state that `make verify`
can rebuild and diff. There is no database and no cache invalidation problem
because there is no cache — only the log and what you fold from it.

Why JSONL: one writer (the CLI), human-readable diffs, trivially replayable.
Why integer seq: total order without a clock. Why no uuids: determinism is a
feature (the mine must hash-pin identically on every machine).

The one architectural claim this mine makes on purpose: workflows are DATA.
`examples/workflow-*.json` describe multi-step plans; `src/workflow.py` only
executes them. A new workflow is a new JSON file, never a code change.
