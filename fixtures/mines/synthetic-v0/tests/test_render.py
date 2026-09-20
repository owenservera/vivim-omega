import tempfile
import unittest
from pathlib import Path

from src.store import Store
from src.render import render_all


class TestRender(unittest.TestCase):
    def test_renders_sorted_lines(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "log"
            log.mkdir()
            s = Store({"log_dir": str(log), "index_dir": str(Path(tmp) / "idx")})
            s.append("cook", "b")
            s.append("cook", "a")
            text = render_all(s, str(Path(tmp) / "out.md"))
            self.assertIn("- a: cooked 1x", text)
            self.assertIn("- b: cooked 1x", text)


if __name__ == "__main__":
    unittest.main()
