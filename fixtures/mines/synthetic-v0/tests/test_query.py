import unittest
from pathlib import Path
import tempfile

from src.store import Store
from src.query import totals, last_cooked


class TestQuery(unittest.TestCase):
    def test_totals_and_last(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "log"
            log.mkdir()
            s = Store({"log_dir": str(log), "index_dir": str(Path(tmp) / "idx")})
            s.append("cook", "a")
            s.append("cook", "b")
            s.append("cook", "a")
            self.assertEqual(totals(s), {"a": 2, "b": 1})
            self.assertEqual(last_cooked(s), {"a": 3, "b": 2})


if __name__ == "__main__":
    unittest.main()
