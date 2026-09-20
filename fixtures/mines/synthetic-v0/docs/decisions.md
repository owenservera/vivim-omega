# pantrylog decision log

- D1: JSONL over SQLite — replayability and readable diffs beat queries.
- D2: integer seq over timestamps — total order without a clock.
- D3: indexes are derived state — any drift is a rebuild, never a repair.
- D4: workflows as data — the executor is 40 lines and never grows.
- D5: no dependencies — stdlib only, the mine boots anywhere Python does.
