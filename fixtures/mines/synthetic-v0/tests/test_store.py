import json
import tempfile
import unittest
from pathlib import Path

from src.store import Store
from src.errors import BadEvent


class TestStore(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        (self.base / "data").mkdir()
        (self.base / "data" / "recipes.json").write_text(
            json.dumps([{"id": "r1", "title": "R", "steps": 1, "minutes": 5, "ingredients": []}]), encoding="utf-8")
        self.store = Store({"log_dir": str(self.base / "log"), "index_dir": str(self.base / "idx")})
        self.store.log_path.parent.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        self.tmp.cleanup()

    def test_append_is_sequential(self):
        e1 = self.store.append("cook", "r1")
        e2 = self.store.append("cook", "r1")
        self.assertEqual((e1["seq"], e2["seq"]), (1, 2))

    def test_event_shape_is_enforced(self):
        with self.assertRaises(BadEvent):
            self.store._check({"seq": 1, "kind": "nope", "recipe": "r1", "at": "x"})

    def test_log_lines_are_sorted_json(self):
        self.store.append("cook", "r1")
        line = self.store.log_path.read_text(encoding="utf-8").strip()
        self.assertEqual(json.loads(line), self.store.events()[0])
