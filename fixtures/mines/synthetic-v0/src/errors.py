"""Error taxonomy: three failures, no exceptions hierarchy games."""


class PantryError(Exception):
    """base — never raised directly"""


class UnknownRecipe(PantryError):
    """recipe id not in the catalog"""


class UnknownUnit(PantryError):
    """unit id not in units.json"""


class BadEvent(PantryError):
    """event row failed shape checks"""
