import json
import tempfile
import unittest
from pathlib import Path

from src.store import Store
from src.workflow import run_workflow


class TestWorkflow(unittest.TestCase):
    def test_steps_execute_in_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            wf = Path(tmp) / "wf.json"
            wf.write_text(json.dumps({"name": "t", "steps": [
                {"do": "note", "recipe": "pantry"},
                {"do": "cook", "recipe": "oatmeal-bowl"},
            ]}), encoding="utf-8")
            log = Path(tmp) / "log"
            log.mkdir()
            s = Store({"log_dir": str(log), "index_dir": str(Path(tmp) / "idx")})
            done = run_workflow(str(wf), s)
            self.assertEqual(len(done), 2)
            self.assertEqual([e["kind"] for e in s.events()], ["note", "cook"])


if __name__ == "__main__":
    unittest.main()
