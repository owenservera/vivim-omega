#!/usr/bin/env python3
# vivim-omega polyglot shim — Python process tier (D-374, FOUNDATION-DRAFT-002 §5)
#
# A process-tier compartment is ANY process that reads newline-delimited JSON
# frames from stdin and answers on stdout through the Port Protocol vocabulary:
#
#   child -> parent  {"type":"ready","shim":"vivim-omega-polyglot/1","runtime":...}
#   parent -> child  {"type":"call","id":N,"op":"<op>","payload":{...}}
#   child -> parent  {"type":"return","id":N,"result":{"ok":true,"data":...}}
#                    {"type":"return","id":N,"result":{"ok":false,"error":"REFUSED","detail":...}}
#   parent -> child  {"type":"shutdown"}  (child exits 0)
#
# Hardening (DRAFT-002 arbitration item 10), implemented without an event loop
# on purpose — a synchronous line loop cannot leak an unawaited drain and has
# no Proactor/selector hazard on Windows; flush-after-write IS the awaited
# drain:
#   * stdout is flushed after every frame (drain discipline);
#   * malformed input lines increment a bounded counter, are reported back, and
#     exit the shim non-zero past the threshold — the broker's BUDGET trip is
#     therefore backed by the child self-bounding, never a silent wedge;
#   * unknown ops are REFUSED (fail-closed, house law) — never guessed;
#   * stderr is free-form diagnostics only (the broker journals it); all wire
#     traffic rides stdout strictly one frame per line.
#
# Plugin ops are registered in OPS below — this shim ships echo.say as the
# falsifier op; real plugins extend OPS (data, not transport changes).
import json
import platform
import sys

MALFORMED_LIMIT = 5


def op_echo_say(payload):
    if not isinstance(payload, dict):
        return {"ok": False, "error": "REFUSED", "detail": "echo.say expects an object payload"}
    say = payload.get("say")
    if not isinstance(say, str):
        return {"ok": False, "error": "REFUSED", "detail": "echo.say expects a string 'say'"}
    return {"ok": True, "data": {"said": say, "tier": "process", "runtime": "python"}}


OPS = {
    "echo.say": op_echo_say,
}


def emit(obj):
    sys.stdout.write(json.dumps(obj, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main():
    emit({"type": "ready", "shim": "vivim-omega-polyglot/1", "runtime": "python " + platform.python_version()})
    malformed = 0
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            frame = json.loads(line)
        except ValueError:
            malformed += 1
            emit({"type": "malformed", "count": malformed})
            if malformed > MALFORMED_LIMIT:
                sys.stderr.write("shim: malformed limit exceeded — self-bounding exit\n")
                sys.exit(3)
            continue
        if not isinstance(frame, dict):
            malformed += 1
            emit({"type": "malformed", "count": malformed})
            continue
        kind = frame.get("type")
        if kind == "shutdown":
            sys.exit(0)
        if kind != "call":
            malformed += 1
            emit({"type": "malformed", "count": malformed})
            continue
        op = frame.get("op")
        handler = OPS.get(op) if isinstance(op, str) else None
        if handler is None:
            emit({"type": "return", "id": frame.get("id"), "result": {"ok": False, "error": "REFUSED", "detail": f"unknown op: {op!r}"}})
            continue
        try:
            result = handler(frame.get("payload"))
        except Exception as e:  # handler throw -> DEGRADED-shape return, house law
            emit({"type": "return", "id": frame.get("id"), "result": {"ok": False, "error": "DEGRADED", "detail": str(e)}})
            continue
        emit({"type": "return", "id": frame.get("id"), "result": result})
    sys.exit(0)


if __name__ == "__main__":
    main()
