# webmail-menu fixture (D-311)

A minimal menubar capture backing the `menu` / `menu-item` node kinds: the
`MENU_PATH` variation channel (Upgrade 1, `VariationChannel`) cannot be
represented without them. Deliberately small — 10 nodes:

- `#app` (container) → `#menubar` (container, role=menubar)
- `#menu-file` (menu) → `#mi-new`, `#mi-archive` (menu-item), `#mi-print` (menu-item via menuitemcheckbox)
- `#menu-edit` (menu) → `#mi-undo` (menu-item), `#mi-redo` (menu-item via menuitemradio)
- `#archive-btn` (button) — the `UI_ELEMENT` counterpart to the
  File → Archive menu path: the Upgrade-1 example (toolbar button AND menu
  path for `email.archive`) grounded in one capture.

No `events.jsonl`: observe-level menu traces arrive when a `MENU_PATH`
variation actually needs them (evidence before authority — same rule as the kinds).
