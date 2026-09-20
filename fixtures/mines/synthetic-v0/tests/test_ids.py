import unittest

from src.ids import recipe_id, event_id, index_id


class TestIds(unittest.TestCase):
    def test_deterministic(self):
        self.assertEqual(recipe_id("soup"), recipe_id("soup"))
        self.assertNotEqual(recipe_id("soup"), recipe_id("stew"))

    def test_event_id_pads_seq(self):
        self.assertTrue(event_id(3, "cook").startswith("e-000003-cook"))


if __name__ == "__main__":
    unittest.main()
