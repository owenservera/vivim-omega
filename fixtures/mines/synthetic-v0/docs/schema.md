# Event schema (v0)

    {"seq": 1, "kind": "seed|cook|plan|note", "recipe": "oatmeal-bowl", "at": "..."}

- seq: integer, 1-based, strictly increasing, gaps forbidden
- kind: one of four (the taxonomy is closed)
- recipe: a catalog id, or the literal "pantry" for housekeeping notes
- at: fixed RFC3339 string; the log is deterministic, so it is a constant

Index docs (derived, disposable): one JSON per cooked recipe
    {"recipe": ..., "cooked": n, "last_seq": n}
