import unittest
from pathlib import Path
import json

from src import catalog


class TestCatalog(unittest.TestCase):
    def test_pretty_qty_pluralizes(self):
        self.assertEqual(catalog.pretty_qty(2, "g"), "2 grams")
        self.assertEqual(catalog.pretty_qty(1, "g"), "1 gram")
        self.assertEqual(catalog.pretty_qty(3, "cubit"), "3 cubit")

    def test_tagged_intersects(self):
        tagged = {r["id"] for r in catalog.tagged("breakfast")}
        self.assertEqual(tagged, {"oatmeal-bowl", "pancake"})


if __name__ == "__main__":
    unittest.main()
