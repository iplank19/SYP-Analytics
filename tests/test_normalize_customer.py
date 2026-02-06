"""
Tests for normalize_customer_name() — backend customer name normalization.
Uses mock DB to avoid needing a real SQLite database.
"""
import re
import sys
import os
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import normalize_customer_name, CUSTOMER_ALIASES, _CORP_SUFFIXES_RE


def mock_db_with_customers(customer_names):
    """Create a mock get_crm_db that returns given customer names."""
    mock_conn = MagicMock()
    rows = [{'name': n} for n in customer_names]
    mock_conn.execute.return_value.fetchall.return_value = rows
    return mock_conn


class TestNormalizeCustomerNameAliases:
    """Tests for alias-based normalization."""

    @patch('app.get_crm_db')
    def test_alias_power_truss(self, mock_db):
        mock_db.return_value = mock_db_with_customers([])
        assert normalize_customer_name('power truss') == 'Power Truss and Lumber'
        assert normalize_customer_name('Power Truss & Lumber') == 'Power Truss and Lumber'
        assert normalize_customer_name('Power Truss Inc') == 'Power Truss and Lumber'

    @patch('app.get_crm_db')
    def test_alias_protec(self, mock_db):
        mock_db.return_value = mock_db_with_customers([])
        assert normalize_customer_name('protec panel and truss') == 'ProTec Panel and Truss'
        assert normalize_customer_name('protec panel & truss') == 'ProTec Panel and Truss'

    @patch('app.get_crm_db')
    def test_alias_rehkemper(self, mock_db):
        mock_db.return_value = mock_db_with_customers([])
        assert normalize_customer_name('rehkemper and sons') == 'Rehkemper & Sons'
        assert normalize_customer_name('rehkemper & sons') == 'Rehkemper & Sons'
        assert normalize_customer_name('rehkemper & son inc') == 'Rehkemper & Sons'

    @patch('app.get_crm_db')
    def test_alias_craters(self, mock_db):
        mock_db.return_value = mock_db_with_customers([])
        assert normalize_customer_name('craters and freighters') == 'Craters & Freighters'


class TestNormalizeCustomerNameFuzzy:
    """Tests for fuzzy matching (& <-> and)."""

    @patch('app.get_crm_db')
    def test_and_ampersand_matching(self, mock_db):
        """'&' and 'and' should match existing customers."""
        mock_db.return_value = mock_db_with_customers(['Smith & Sons Lumber'])
        assert normalize_customer_name('Smith and Sons Lumber') == 'Smith & Sons Lumber'

    @patch('app.get_crm_db')
    def test_ampersand_to_and_matching(self, mock_db):
        mock_db.return_value = mock_db_with_customers(['Johnson and Associates'])
        assert normalize_customer_name('Johnson & Associates') == 'Johnson and Associates'


class TestNormalizeCustomerNameSuffix:
    """Tests for suffix-stripped matching."""

    @patch('app.get_crm_db')
    def test_strip_inc(self, mock_db):
        mock_db.return_value = mock_db_with_customers(['Acme Builders'])
        # "Acme Builders Inc" should match "Acme Builders" after stripping
        result = normalize_customer_name('Acme Builders Inc')
        assert result == 'Acme Builders'

    @patch('app.get_crm_db')
    def test_strip_llc(self, mock_db):
        mock_db.return_value = mock_db_with_customers(['Delta Construction'])
        result = normalize_customer_name('Delta Construction LLC')
        assert result == 'Delta Construction'

    @patch('app.get_crm_db')
    def test_strip_corp(self, mock_db):
        mock_db.return_value = mock_db_with_customers(['Acme Building'])
        result = normalize_customer_name('Acme Building Corp')
        assert result == 'Acme Building'


class TestNormalizeCustomerNameEdgeCases:
    """Tests for edge cases."""

    @patch('app.get_crm_db')
    def test_null_empty(self, mock_db):
        mock_db.return_value = mock_db_with_customers([])
        assert normalize_customer_name(None) is None
        assert normalize_customer_name('') == ''
        assert normalize_customer_name('  ') == ''

    @patch('app.get_crm_db')
    def test_no_match_returns_trimmed(self, mock_db):
        mock_db.return_value = mock_db_with_customers([])
        assert normalize_customer_name('  Brand New Customer  ') == 'Brand New Customer'

    @patch('app.get_crm_db')
    def test_existing_customer_match_preserves_case(self, mock_db):
        """When an alias matches an existing customer, return the DB version."""
        mock_db.return_value = mock_db_with_customers(['Power Truss and Lumber'])
        # The alias should find the existing customer and return its exact name
        result = normalize_customer_name('power truss')
        assert result == 'Power Truss and Lumber'

    @patch('app.get_crm_db')
    def test_db_error_graceful_fallback(self, mock_db):
        """If DB connection fails, still process via aliases."""
        mock_db.side_effect = Exception('DB connection failed')
        # Should still try aliases and return canonical
        result = normalize_customer_name('power truss')
        assert result == 'Power Truss and Lumber'

    @patch('app.get_crm_db')
    def test_dash_normalization(self, mock_db):
        """Dashes and underscores normalized during matching."""
        mock_db.return_value = mock_db_with_customers([])
        result = normalize_customer_name('precision_truss')
        assert result == 'Precision Truss & Metal'


class TestCorpSuffixesRegex:
    """Tests for the corporate suffix stripping regex."""

    def test_strips_inc(self):
        assert _CORP_SUFFIXES_RE.sub('', 'Acme Inc').strip() == 'Acme'
        assert _CORP_SUFFIXES_RE.sub('', 'Acme Inc.').strip() == 'Acme'

    def test_strips_llc(self):
        assert _CORP_SUFFIXES_RE.sub('', 'Acme LLC').strip() == 'Acme'

    def test_strips_company(self):
        assert _CORP_SUFFIXES_RE.sub('', 'Acme Company').strip() == 'Acme'

    def test_strips_lumber(self):
        assert _CORP_SUFFIXES_RE.sub('', 'National Lumber').strip() == 'National'

    def test_preserves_mid_word(self):
        """Doesn't strip 'inc' from the middle of a name."""
        result = _CORP_SUFFIXES_RE.sub('', 'Incremental Corp').strip()
        assert result == 'Incremental'  # Only 'Corp' stripped
