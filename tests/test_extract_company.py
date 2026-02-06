"""
Tests for extract_company_name() — backend mill name extraction.
"""
import re
import sys
import os

# We need to import the function and its dependencies directly from app.py
# without starting the Flask app. We'll extract the relevant pieces.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the actual function and its data from app
from app import extract_company_name, MILL_COMPANY_ALIASES


class TestExtractCompanyName:
    """Tests for extracting company name from mill name strings."""

    def test_company_dash_city_format(self):
        """Standard 'Company - City' format extracts company."""
        assert extract_company_name('Canfor - DeQuincy') == 'Canfor'
        assert extract_company_name('GP - Gurdon') == 'GP'
        assert extract_company_name('West Fraser - Huttig') == 'West Fraser'

    def test_en_dash_format(self):
        """En-dash separator works."""
        assert extract_company_name('Canfor \u2013 DeQuincy') == 'Canfor'

    def test_em_dash_format(self):
        """Em-dash separator works."""
        assert extract_company_name('Canfor \u2014 DeQuincy') == 'Canfor'

    def test_alias_lookup_simple(self):
        """Simple alias lookup returns canonical name."""
        assert extract_company_name('canfor') == 'Canfor'
        assert extract_company_name('gp') == 'GP'
        assert extract_company_name('wf') == 'West Fraser'

    def test_alias_lookup_full_name(self):
        """Full company name alias returns canonical."""
        assert extract_company_name('Georgia Pacific') == 'GP'
        assert extract_company_name('Weyerhaeuser Company') == 'Weyerhaeuser'
        assert extract_company_name('Canfor Southern Pine') == 'Canfor'

    def test_alias_case_insensitive(self):
        """Alias lookup is case-insensitive."""
        assert extract_company_name('CANFOR') == 'Canfor'
        assert extract_company_name('GEORGIA PACIFIC') == 'GP'
        assert extract_company_name('potlatchdeltic') == 'PotlatchDeltic'

    def test_prefix_match(self):
        """Partial prefix match with word boundary."""
        assert extract_company_name('Canfor Something') == 'Canfor'
        assert extract_company_name('Weyerhaeuser NR') == 'Weyerhaeuser'

    def test_no_match_returns_original(self):
        """Unknown names return original trimmed value."""
        assert extract_company_name('Unknown Mill Co') == 'Unknown Mill Co'
        assert extract_company_name('  Some Mill  ') == 'Some Mill'

    def test_null_and_empty(self):
        """Null/empty inputs handled gracefully."""
        assert extract_company_name(None) is None
        assert extract_company_name('') == ''
        assert extract_company_name('  ') == ''

    def test_underscore_dash_normalization(self):
        """Underscores and various dashes normalized to spaces."""
        assert extract_company_name('canfor_southern_pine') == 'Canfor'
        assert extract_company_name('west-fraser') == 'West Fraser'

    def test_potlatchdeltic_variations(self):
        """PotlatchDeltic aliases all resolve correctly."""
        assert extract_company_name('PotlatchDeltic') == 'PotlatchDeltic'
        assert extract_company_name('Potlatch') == 'PotlatchDeltic'
        assert extract_company_name('PLD') == 'PotlatchDeltic'
        assert extract_company_name('potlatch deltic') == 'PotlatchDeltic'

    def test_klausner_to_binderholz(self):
        """Legacy Klausner alias maps to Binderholz."""
        assert extract_company_name('Klausner') == 'Binderholz'
        assert extract_company_name('Klausner Lumber') == 'Binderholz'

    def test_lumberton_to_ifg(self):
        """Lumberton aliases map to Idaho Forest Group."""
        assert extract_company_name('Lumberton') == 'Idaho Forest Group'
        assert extract_company_name('Lumberton Lumber') == 'Idaho Forest Group'

    def test_multiple_location_company(self):
        """Companies with multiple locations extract correctly."""
        assert extract_company_name('Canfor - DeQuincy') == 'Canfor'
        assert extract_company_name('Canfor - Urbana') == 'Canfor'
        assert extract_company_name('Canfor - Axis') == 'Canfor'

    def test_parity_with_frontend(self):
        """Key aliases match between backend and frontend.

        The backend MILL_COMPANY_ALIASES should produce the same results
        as the frontend _MILL_COMPANY_ALIASES for common inputs.
        """
        # These are the most critical parity checks
        parity_cases = {
            'canfor': 'Canfor',
            'west fraser': 'West Fraser',
            'gp': 'GP',
            'weyerhaeuser': 'Weyerhaeuser',
            'interfor': 'Interfor',
            'potlatchdeltic': 'PotlatchDeltic',
            'rex lumber': 'Rex Lumber',
            'biewer': 'Biewer',
        }
        for alias, expected in parity_cases.items():
            assert extract_company_name(alias) == expected, \
                f"Parity check failed: {alias!r} -> {extract_company_name(alias)!r}, expected {expected!r}"
