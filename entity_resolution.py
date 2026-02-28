"""
Entity Resolution Engine for SYP Analytics
Fuzzy matching + canonical identity management for mills & customers.
"""
import re
import json
import sqlite3
from datetime import datetime

# ── Scoring weights ──────────────────────────────────────────────
W_LEVENSHTEIN = 0.50
W_TOKEN       = 0.30
W_SEMANTIC    = 0.20

# ── Thresholds ───────────────────────────────────────────────────
THRESH_AUTO   = 0.92   # auto-link (high confidence)
THRESH_REVIEW = 0.75   # show candidates for manual review
# below THRESH_REVIEW → create new entity

# ── Noise tokens removed before scoring ──────────────────────────
_NOISE = {
    'inc', 'llc', 'co', 'corp', 'ltd', 'company', 'corporation',
    'enterprises', 'limited', 'group', 'holdings',
    'lumber', 'timber', 'forest', 'products', 'building', 'supply',
    'distribution', 'manufacturing', 'mfg', 'industries',
}

# ── State abbreviations (preserved during normalization) ─────────
_STATES = {
    'AL','AR','FL','GA','LA','MS','NC','OK','SC','TN','TX','VA',
    'KY','MO','OH','WV','PA','MD','DE','NJ','NY','CT','ME','NH',
}

# ── Abbreviation expansions for mills ────────────────────────────
_COMPANY_EXPANSIONS = {
    'gp': 'georgia pacific',
    'wf': 'west fraser',
    'pld': 'potlatchdeltic',
    'pd': 'potlatchdeltic',
    'ifg': 'idaho forest group',
    'csp': 'canfor',
    'wey': 'weyerhaeuser',
    'fp': 'forest products',
}


# ═══════════════════════════════════════════════════════════════════
#  STRING UTILITIES
# ═══════════════════════════════════════════════════════════════════

def _normalize(name):
    """Lowercase, strip punctuation/dashes, collapse whitespace."""
    if not name:
        return ''
    s = name.strip().lower()
    s = re.sub(r'[_\-–—/\\]', ' ', s)       # dashes → spaces
    s = re.sub(r'[.,;:\'\"()\[\]{}!?#@]', '', s)  # strip punctuation
    s = re.sub(r'\s*&\s*', ' and ', s)        # & → and
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def _expand_abbreviations(s):
    """Expand known abbreviations (gp → georgia pacific, etc.)."""
    words = s.split()
    result = []
    for w in words:
        if w in _COMPANY_EXPANSIONS:
            result.append(_COMPANY_EXPANSIONS[w])
        else:
            result.append(w)
    return ' '.join(result)


def _tokenize(s):
    """Split into meaningful tokens, removing noise words."""
    return [t for t in s.split() if t not in _NOISE and len(t) > 1]


def _make_canonical_id(entity_type, name):
    """Generate a canonical_id slug from type + name."""
    prefix = 'mill' if entity_type == 'mill' else 'cust'
    slug = re.sub(r'[^a-z0-9]+', '_', name.strip().lower()).strip('_')
    return f'{prefix}_{slug}'


def _make_normalized_key(name):
    """Normalized sort/lookup key."""
    return _normalize(name)


# ═══════════════════════════════════════════════════════════════════
#  LEVENSHTEIN DISTANCE
# ═══════════════════════════════════════════════════════════════════

def levenshtein(a, b):
    """Compute Levenshtein edit distance."""
    m, n = len(a), len(b)
    if m == 0: return n
    if n == 0: return m
    # Optimize: single-row DP
    prev = list(range(n + 1))
    for i in range(1, m + 1):
        curr = [i] + [0] * n
        for j in range(1, n + 1):
            cost = 0 if a[i-1] == b[j-1] else 1
            curr[j] = min(curr[j-1] + 1, prev[j] + 1, prev[j-1] + cost)
        prev = curr
    return prev[n]


def levenshtein_score(a, b):
    """Normalized Levenshtein similarity (0.0–1.0)."""
    if not a and not b:
        return 1.0
    max_len = max(len(a), len(b))
    if max_len == 0:
        return 1.0
    return max(0.0, 1.0 - levenshtein(a, b) / max_len)


# ═══════════════════════════════════════════════════════════════════
#  TOKEN OVERLAP
# ═══════════════════════════════════════════════════════════════════

def token_overlap_score(tokens_a, tokens_b):
    """Fraction of shared tokens relative to smaller set."""
    if not tokens_a or not tokens_b:
        return 0.0
    set_a, set_b = set(tokens_a), set(tokens_b)
    shared = len(set_a & set_b)
    min_size = min(len(set_a), len(set_b))
    return shared / min_size if min_size > 0 else 0.0


# ═══════════════════════════════════════════════════════════════════
#  SEMANTIC SCORING (mill-aware)
# ═══════════════════════════════════════════════════════════════════

def _extract_parts(name, mill_company_aliases=None):
    """Extract (company, city, state) from a mill name.
    Handles 'Company - City', 'Company City', etc."""
    if not name:
        return '', '', ''
    raw = name.strip()

    # "Company - City" format
    for sep in (' - ', ' – ', ' — '):
        if sep in raw:
            parts = raw.split(sep, 1)
            company = parts[0].strip()
            rest = parts[1].strip() if len(parts) > 1 else ''
            # Rest might be "City" or "City, ST"
            city, state = '', ''
            if ',' in rest:
                city, state = rest.split(',', 1)
                city, state = city.strip(), state.strip().upper()
            else:
                city = rest
                # Check if last word is a state
                words = rest.split()
                if words and words[-1].upper() in _STATES:
                    state = words[-1].upper()
                    city = ' '.join(words[:-1])
            return company.lower(), city.lower(), state

    # No separator — try alias lookup for company, rest is city
    norm = _normalize(raw)
    if mill_company_aliases:
        # Try longest-first prefix match
        for alias in sorted(mill_company_aliases.keys(), key=len, reverse=True):
            if norm == alias or norm.startswith(alias + ' '):
                company = alias
                city = norm[len(alias):].strip()
                # Strip state from end of city
                words = city.split()
                state = ''
                if words and words[-1].upper() in _STATES:
                    state = words[-1].upper()
                    city = ' '.join(words[:-1])
                return company, city, state

    return norm, '', ''


def semantic_score(name_a, name_b, entity_type, mill_company_aliases=None):
    """Semantic similarity based on company/city/state decomposition."""
    if entity_type != 'mill':
        # For customers: just check if names share a meaningful root
        # (handled by levenshtein + token overlap already)
        return 0.0

    comp_a, city_a, state_a = _extract_parts(name_a, mill_company_aliases)
    comp_b, city_b, state_b = _extract_parts(name_b, mill_company_aliases)

    score = 0.0

    # Company match (0.5)
    if comp_a and comp_b:
        # Expand abbreviations for comparison
        ca = _expand_abbreviations(_normalize(comp_a))
        cb = _expand_abbreviations(_normalize(comp_b))
        if ca == cb:
            score += 0.5
        elif levenshtein_score(ca, cb) > 0.85:
            score += 0.4

    # City match (0.3)
    if city_a and city_b:
        ca = _normalize(city_a)
        cb = _normalize(city_b)
        if ca == cb:
            score += 0.3
        elif levenshtein_score(ca, cb) > 0.85:
            score += 0.2

    # State match (0.2)
    if state_a and state_b and state_a == state_b:
        score += 0.2

    return score


# ═══════════════════════════════════════════════════════════════════
#  COMPOSITE SCORE
# ═══════════════════════════════════════════════════════════════════

def compute_score(input_name, candidate_name, entity_type='mill', mill_company_aliases=None):
    """
    Compute composite similarity score (0.0–1.0).

    score = 0.5 × levenshtein + 0.3 × token_overlap + 0.2 × semantic
    """
    # Pre-normalize both names
    norm_a = _expand_abbreviations(_normalize(input_name))
    norm_b = _expand_abbreviations(_normalize(candidate_name))

    # 1. Levenshtein (50%)
    lev = levenshtein_score(norm_a, norm_b)

    # 2. Token overlap (30%)
    tok_a = _tokenize(norm_a)
    tok_b = _tokenize(norm_b)
    tok = token_overlap_score(tok_a, tok_b)

    # 3. Semantic bonus (20%)
    sem = semantic_score(input_name, candidate_name, entity_type, mill_company_aliases)

    return W_LEVENSHTEIN * lev + W_TOKEN * tok + W_SEMANTIC * sem


# ═══════════════════════════════════════════════════════════════════
#  RESOLUTION ENGINE
# ═══════════════════════════════════════════════════════════════════

class EntityResolver:
    """Resolves names to canonical entities using fuzzy matching."""

    def __init__(self, crm_db_path, mill_company_aliases=None):
        self.crm_db_path = crm_db_path
        self.mill_company_aliases = mill_company_aliases or {}

    def _get_conn(self):
        conn = sqlite3.connect(self.crm_db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def resolve(self, name, entity_type, context='manual'):
        """
        Resolve a name to a canonical entity.
        Returns: {canonical_id, canonical_name, action, score, candidates}
        action: 'matched' | 'review' | 'created'
        """
        if not name or not name.strip():
            return {'error': 'Name is required'}

        norm_input = _make_normalized_key(name)
        conn = self._get_conn()

        try:
            # 1. Exact alias match (fast path)
            alias = conn.execute(
                "SELECT canonical_id FROM entity_alias WHERE variant_normalized=?",
                (norm_input,)
            ).fetchone()
            if alias:
                canonical = conn.execute(
                    "SELECT * FROM entity_canonical WHERE canonical_id=?",
                    (alias['canonical_id'],)
                ).fetchone()
                if canonical:
                    return {
                        'canonical_id': canonical['canonical_id'],
                        'canonical_name': canonical['canonical_name'],
                        'action': 'matched',
                        'score': 1.0,
                    }

            # 2. Exact canonical name match
            exact = conn.execute(
                "SELECT * FROM entity_canonical WHERE type=? AND normalized_key=?",
                (entity_type, norm_input)
            ).fetchone()
            if exact:
                # Register this variant as an alias
                self._add_alias(conn, exact['canonical_id'], name, norm_input, 'auto', 1.0)
                conn.commit()
                return {
                    'canonical_id': exact['canonical_id'],
                    'canonical_name': exact['canonical_name'],
                    'action': 'matched',
                    'score': 1.0,
                }

            # 3. Fuzzy match against all entities of same type
            all_entities = conn.execute(
                "SELECT * FROM entity_canonical WHERE type=?",
                (entity_type,)
            ).fetchall()

            candidates = []
            for entity in all_entities:
                score = compute_score(
                    name, entity['canonical_name'],
                    entity_type, self.mill_company_aliases
                )
                # Also check against all aliases of this entity
                aliases = conn.execute(
                    "SELECT variant FROM entity_alias WHERE canonical_id=?",
                    (entity['canonical_id'],)
                ).fetchall()
                for a in aliases:
                    alias_score = compute_score(
                        name, a['variant'],
                        entity_type, self.mill_company_aliases
                    )
                    score = max(score, alias_score)

                if score >= THRESH_REVIEW:
                    candidates.append({
                        'canonical_id': entity['canonical_id'],
                        'canonical_name': entity['canonical_name'],
                        'score': round(score, 4),
                        'metadata': json.loads(entity['metadata'] or '{}'),
                    })

            candidates.sort(key=lambda c: c['score'], reverse=True)

            # 4. Decide action
            if candidates and candidates[0]['score'] >= THRESH_AUTO:
                best = candidates[0]
                self._add_alias(conn, best['canonical_id'], name, norm_input, 'auto', best['score'])
                conn.commit()
                return {
                    'canonical_id': best['canonical_id'],
                    'canonical_name': best['canonical_name'],
                    'action': 'matched',
                    'score': best['score'],
                }
            elif candidates:
                # Queue for review
                review_id = self._add_review(
                    conn, name, norm_input, entity_type, candidates[:5], context
                )
                conn.commit()
                # Enrich candidates with alias lists
                for c in candidates[:5]:
                    aliases = conn.execute(
                        "SELECT variant FROM entity_alias WHERE canonical_id=?",
                        (c['canonical_id'],)
                    ).fetchall()
                    c['aliases'] = [a['variant'] for a in aliases]
                return {
                    'action': 'review',
                    'review_id': review_id,
                    'candidates': candidates[:5],
                    'input_name': name,
                }
            else:
                # Create new entity
                result = self.create_entity(conn, entity_type, name)
                conn.commit()
                return {
                    'canonical_id': result['canonical_id'],
                    'canonical_name': result['canonical_name'],
                    'action': 'created',
                    'score': 0.0,
                }
        finally:
            conn.close()

    def create_entity(self, conn, entity_type, name, metadata=None):
        """Create a new canonical entity + self-alias."""
        canonical_id = _make_canonical_id(entity_type, name)
        canonical_name = name.strip()
        norm_key = _make_normalized_key(name)
        meta_json = json.dumps(metadata or {})

        # Ensure unique canonical_id
        existing = conn.execute(
            "SELECT canonical_id FROM entity_canonical WHERE canonical_id=?",
            (canonical_id,)
        ).fetchone()
        if existing:
            # Append numeric suffix
            i = 2
            while True:
                cid = f'{canonical_id}_{i}'
                if not conn.execute("SELECT 1 FROM entity_canonical WHERE canonical_id=?", (cid,)).fetchone():
                    canonical_id = cid
                    break
                i += 1

        conn.execute(
            """INSERT INTO entity_canonical (type, canonical_name, canonical_id, normalized_key, metadata)
               VALUES (?,?,?,?,?)""",
            (entity_type, canonical_name, canonical_id, norm_key, meta_json)
        )
        # Add self as alias
        self._add_alias(conn, canonical_id, canonical_name, norm_key, 'canonical', 1.0)
        return {'canonical_id': canonical_id, 'canonical_name': canonical_name}

    def _add_alias(self, conn, canonical_id, variant, variant_normalized, source, score):
        """Add an alias, ignoring duplicates."""
        try:
            conn.execute(
                """INSERT OR IGNORE INTO entity_alias
                   (canonical_id, variant, variant_normalized, source, score)
                   VALUES (?,?,?,?,?)""",
                (canonical_id, variant.strip(), variant_normalized, source, score)
            )
        except sqlite3.IntegrityError:
            pass

    def _add_review(self, conn, input_name, input_normalized, entity_type, candidates, context):
        """Add to manual review queue."""
        cur = conn.execute(
            """INSERT INTO entity_review (input_name, entity_type, candidates, source_context)
               VALUES (?,?,?,?)""",
            (input_name, entity_type,
             json.dumps([{'canonical_id': c['canonical_id'], 'score': c['score']} for c in candidates]),
             context)
        )
        return cur.lastrowid

    def submit_review(self, review_id, chosen_canonical_id=None, create_new=False):
        """Process a review decision."""
        conn = self._get_conn()
        try:
            review = conn.execute("SELECT * FROM entity_review WHERE id=?", (review_id,)).fetchone()
            if not review:
                return {'error': 'Review not found'}

            if create_new:
                result = self.create_entity(conn, review['entity_type'], review['input_name'])
                conn.execute(
                    "UPDATE entity_review SET resolved_id=? WHERE id=?",
                    (result['canonical_id'], review_id)
                )
                conn.commit()
                return {'canonical_id': result['canonical_id'], 'action': 'created'}
            elif chosen_canonical_id:
                # Link to chosen entity
                norm = _make_normalized_key(review['input_name'])
                self._add_alias(conn, chosen_canonical_id, review['input_name'], norm, 'manual_review', None)
                conn.execute(
                    "UPDATE entity_review SET resolved_id=? WHERE id=?",
                    (chosen_canonical_id, review_id)
                )
                conn.commit()
                canonical = conn.execute(
                    "SELECT * FROM entity_canonical WHERE canonical_id=?", (chosen_canonical_id,)
                ).fetchone()
                return {
                    'canonical_id': chosen_canonical_id,
                    'canonical_name': canonical['canonical_name'] if canonical else '',
                    'action': 'linked',
                }
            else:
                return {'error': 'Must provide chosen_canonical_id or create_new=true'}
        finally:
            conn.close()

    def search(self, query, entity_type, limit=10):
        """Search entities by fuzzy match — for autocomplete / manual linking."""
        conn = self._get_conn()
        try:
            all_entities = conn.execute(
                "SELECT * FROM entity_canonical WHERE type=?", (entity_type,)
            ).fetchall()
            results = []
            for entity in all_entities:
                score = compute_score(
                    query, entity['canonical_name'],
                    entity_type, self.mill_company_aliases
                )
                if score >= 0.3:  # low threshold for search
                    aliases = conn.execute(
                        "SELECT variant FROM entity_alias WHERE canonical_id=?",
                        (entity['canonical_id'],)
                    ).fetchall()
                    results.append({
                        'canonical_id': entity['canonical_id'],
                        'canonical_name': entity['canonical_name'],
                        'score': round(score, 4),
                        'aliases': [a['variant'] for a in aliases],
                        'metadata': json.loads(entity['metadata'] or '{}'),
                    })
            results.sort(key=lambda r: r['score'], reverse=True)
            return results[:limit]
        finally:
            conn.close()

    def get_unified_view(self, canonical_id, mi_db_path=None, trades_data=None):
        """Get all data for one entity across all systems."""
        conn = self._get_conn()
        try:
            canonical = conn.execute(
                "SELECT * FROM entity_canonical WHERE canonical_id=?", (canonical_id,)
            ).fetchone()
            if not canonical:
                return {'error': 'Entity not found'}

            # Aliases
            aliases = conn.execute(
                "SELECT * FROM entity_alias WHERE canonical_id=? ORDER BY source, variant",
                (canonical_id,)
            ).fetchall()
            alias_names = [a['variant'] for a in aliases]

            # CRM records
            crm_customers = conn.execute(
                "SELECT * FROM customers WHERE canonical_id=?", (canonical_id,)
            ).fetchall()
            crm_mills = conn.execute(
                "SELECT * FROM mills WHERE canonical_id=?", (canonical_id,)
            ).fetchall()

            # Also find CRM records by name (for unlinked records)
            for alias_name in alias_names:
                extra_custs = conn.execute(
                    "SELECT * FROM customers WHERE UPPER(name)=? AND (canonical_id IS NULL OR canonical_id='')",
                    (alias_name.upper(),)
                ).fetchall()
                crm_customers = list(crm_customers) + list(extra_custs)
                extra_mills = conn.execute(
                    "SELECT * FROM mills WHERE UPPER(name)=? AND (canonical_id IS NULL OR canonical_id='')",
                    (alias_name.upper(),)
                ).fetchall()
                crm_mills = list(crm_mills) + list(extra_mills)

            # Dedupe
            seen_cust_ids = set()
            unique_custs = []
            for c in crm_customers:
                if c['id'] not in seen_cust_ids:
                    seen_cust_ids.add(c['id'])
                    unique_custs.append(dict(c))

            seen_mill_ids = set()
            unique_mills = []
            for m in crm_mills:
                if m['id'] not in seen_mill_ids:
                    seen_mill_ids.add(m['id'])
                    unique_mills.append(dict(m))

            result = {
                'canonical': {
                    'canonical_id': canonical['canonical_id'],
                    'canonical_name': canonical['canonical_name'],
                    'type': canonical['type'],
                    'metadata': json.loads(canonical['metadata'] or '{}'),
                },
                'aliases': [{'variant': a['variant'], 'source': a['source'],
                             'score': a['score']} for a in aliases],
                'crm': {'customers': unique_custs, 'mills': unique_mills},
                'mill_quotes': [],
                'price_changes': [],
                'trades': {'buys': [], 'sells': []},
            }

            # Mill Intel data
            if mi_db_path:
                try:
                    mi_conn = sqlite3.connect(mi_db_path, timeout=10)
                    mi_conn.row_factory = sqlite3.Row
                    # Get quotes for all alias names
                    placeholders = ','.join(['?' for _ in alias_names])
                    if alias_names:
                        upper_names = [n.upper() for n in alias_names]
                        quotes = mi_conn.execute(
                            f"SELECT * FROM mill_quotes WHERE UPPER(mill_name) IN ({placeholders}) ORDER BY date DESC LIMIT 100",
                            upper_names
                        ).fetchall()
                        result['mill_quotes'] = [dict(q) for q in quotes]

                        # Price changes
                        try:
                            changes = mi_conn.execute(
                                f"SELECT * FROM mill_price_changes WHERE UPPER(mill_name) IN ({placeholders}) ORDER BY date DESC LIMIT 50",
                                upper_names
                            ).fetchall()
                            result['price_changes'] = [dict(c) for c in changes]
                        except:
                            pass  # table might not exist
                    mi_conn.close()
                except:
                    pass

            # Trades from localStorage data (passed in from frontend)
            if trades_data:
                upper_aliases = {n.upper() for n in alias_names}
                entity_type = canonical['type']
                if entity_type == 'customer':
                    for buy in trades_data.get('buys', []):
                        cust = (buy.get('customer') or '').upper()
                        if cust in upper_aliases:
                            result['trades']['buys'].append(buy)
                    for sell in trades_data.get('sells', []):
                        cust = (sell.get('customer') or '').upper()
                        if cust in upper_aliases:
                            result['trades']['sells'].append(sell)
                elif entity_type == 'mill':
                    for buy in trades_data.get('buys', []):
                        mill = (buy.get('mill') or '').upper()
                        if mill in upper_aliases:
                            result['trades']['buys'].append(buy)
                    for sell in trades_data.get('sells', []):
                        mill = (sell.get('mill') or '').upper()
                        if mill in upper_aliases:
                            result['trades']['sells'].append(sell)

            return result
        finally:
            conn.close()

    def link_alias(self, canonical_id, variant_name):
        """Manually link an alias to an entity."""
        conn = self._get_conn()
        try:
            canonical = conn.execute(
                "SELECT * FROM entity_canonical WHERE canonical_id=?", (canonical_id,)
            ).fetchone()
            if not canonical:
                return {'error': 'Entity not found'}
            norm = _make_normalized_key(variant_name)
            self._add_alias(conn, canonical_id, variant_name, norm, 'manual', 1.0)
            conn.commit()
            return {'ok': True, 'canonical_id': canonical_id, 'variant': variant_name}
        finally:
            conn.close()

    def merge_entities(self, source_id, target_id):
        """Merge source entity into target. Moves all aliases + references."""
        conn = self._get_conn()
        try:
            source = conn.execute("SELECT * FROM entity_canonical WHERE canonical_id=?", (source_id,)).fetchone()
            target = conn.execute("SELECT * FROM entity_canonical WHERE canonical_id=?", (target_id,)).fetchone()
            if not source or not target:
                return {'error': 'Entity not found'}

            # Move aliases from source to target
            aliases = conn.execute("SELECT * FROM entity_alias WHERE canonical_id=?", (source_id,)).fetchall()
            for a in aliases:
                self._add_alias(conn, target_id, a['variant'], a['variant_normalized'], 'merge', a['score'])

            # Update CRM references
            conn.execute("UPDATE customers SET canonical_id=? WHERE canonical_id=?", (target_id, source_id))
            conn.execute("UPDATE mills SET canonical_id=? WHERE canonical_id=?", (target_id, source_id))

            # Add source canonical name as alias of target
            self._add_alias(conn, target_id, source['canonical_name'],
                          _make_normalized_key(source['canonical_name']), 'merge', 1.0)

            # Delete source aliases and entity
            conn.execute("DELETE FROM entity_alias WHERE canonical_id=?", (source_id,))
            conn.execute("DELETE FROM entity_canonical WHERE canonical_id=?", (source_id,))

            # Resolve any pending reviews pointing to source
            conn.execute("UPDATE entity_review SET resolved_id=? WHERE resolved_id=?", (target_id, source_id))

            conn.commit()
            return {
                'ok': True,
                'target_id': target_id,
                'target_name': target['canonical_name'],
                'merged_aliases': len(aliases),
            }
        finally:
            conn.close()

    def migrate_existing(self, mill_company_aliases=None, mill_directory=None,
                         customer_aliases=None, mi_db_path=None):
        """
        One-time migration: seed canonical entities from alias dictionaries,
        scan existing CRM + Mill Intel data, build alias table.
        Returns migration stats.
        """
        conn = self._get_conn()
        aliases_dict = mill_company_aliases or self.mill_company_aliases
        stats = {'entities_created': 0, 'aliases_created': 0, 'reviews_queued': 0,
                 'crm_linked': 0, 'mi_linked': 0}

        try:
            # ── Phase 1: Seed from MILL_DIRECTORY ──────────────────
            if mill_directory:
                for full_name, info in mill_directory.items():
                    norm = _make_normalized_key(full_name)
                    existing = conn.execute(
                        "SELECT canonical_id FROM entity_canonical WHERE type='mill' AND normalized_key=?",
                        (norm,)
                    ).fetchone()
                    if not existing:
                        meta = {'city': info.get('city', ''), 'state': info.get('state', '')}
                        result = self.create_entity(conn, 'mill', full_name, meta)
                        stats['entities_created'] += 1

                        # Add company name as alias too
                        company = full_name.split(' - ')[0].strip() if ' - ' in full_name else full_name
                        if company.lower() != full_name.lower():
                            comp_norm = _make_normalized_key(company)
                            # Only add if not ambiguous (company might map to multiple mills)
                            # e.g., "GP" maps to GP-Rome, GP-Clarendon, etc.
                            # So we don't add bare company names as aliases for specific locations

            # ── Phase 2: Seed from MILL_COMPANY_ALIASES ───────────
            # These map variant → canonical company (no city).
            # We create company-level entities for mills that don't have city-specific entries.
            company_entities = {}  # company_name → canonical_id
            for variant, canonical_company in aliases_dict.items():
                # Check if this company already has an entity (from directory)
                comp_norm = _make_normalized_key(canonical_company)
                existing = conn.execute(
                    "SELECT canonical_id FROM entity_canonical WHERE type='mill' AND normalized_key=?",
                    (comp_norm,)
                ).fetchone()
                if existing:
                    company_entities[canonical_company] = existing['canonical_id']
                    # Add variant as alias
                    var_norm = _make_normalized_key(variant)
                    self._add_alias(conn, existing['canonical_id'], variant, var_norm, 'dictionary', 1.0)
                    stats['aliases_created'] += 1

            # ── Phase 3: Seed from CUSTOMER_ALIASES ───────────────
            if customer_aliases:
                for variant, canonical_name in customer_aliases.items():
                    norm = _make_normalized_key(canonical_name)
                    existing = conn.execute(
                        "SELECT canonical_id FROM entity_canonical WHERE type='customer' AND normalized_key=?",
                        (norm,)
                    ).fetchone()
                    if not existing:
                        result = self.create_entity(conn, 'customer', canonical_name)
                        stats['entities_created'] += 1
                        cid = result['canonical_id']
                    else:
                        cid = existing['canonical_id']
                    var_norm = _make_normalized_key(variant)
                    self._add_alias(conn, cid, variant, var_norm, 'dictionary', 1.0)
                    stats['aliases_created'] += 1

            # ── Phase 4: Scan CRM customers ───────────────────────
            crm_custs = conn.execute("SELECT * FROM customers WHERE canonical_id IS NULL OR canonical_id=''").fetchall()
            for cust in crm_custs:
                name = cust['name']
                norm = _make_normalized_key(name)
                # Try exact alias match first
                alias = conn.execute(
                    "SELECT canonical_id FROM entity_alias WHERE variant_normalized=?", (norm,)
                ).fetchone()
                if alias:
                    conn.execute("UPDATE customers SET canonical_id=? WHERE id=?",
                               (alias['canonical_id'], cust['id']))
                    stats['crm_linked'] += 1
                else:
                    # Try fuzzy match
                    all_entities = conn.execute(
                        "SELECT * FROM entity_canonical WHERE type='customer'"
                    ).fetchall()
                    best_score, best_id = 0, None
                    for ent in all_entities:
                        s = compute_score(name, ent['canonical_name'], 'customer', aliases_dict)
                        if s > best_score:
                            best_score, best_id = s, ent['canonical_id']
                    if best_score >= THRESH_AUTO and best_id:
                        self._add_alias(conn, best_id, name, norm, 'migration', best_score)
                        conn.execute("UPDATE customers SET canonical_id=? WHERE id=?", (best_id, cust['id']))
                        stats['crm_linked'] += 1
                    elif best_score >= THRESH_REVIEW and best_id:
                        stats['reviews_queued'] += 1
                    else:
                        # Create new
                        result = self.create_entity(conn, 'customer', name)
                        conn.execute("UPDATE customers SET canonical_id=? WHERE id=?",
                                   (result['canonical_id'], cust['id']))
                        stats['entities_created'] += 1
                        stats['crm_linked'] += 1

            # ── Phase 5: Scan CRM mills ───────────────────────────
            crm_mills = conn.execute("SELECT * FROM mills WHERE canonical_id IS NULL OR canonical_id=''").fetchall()
            for mill in crm_mills:
                name = mill['name']
                norm = _make_normalized_key(name)
                alias = conn.execute(
                    "SELECT canonical_id FROM entity_alias WHERE variant_normalized=?", (norm,)
                ).fetchone()
                if alias:
                    conn.execute("UPDATE mills SET canonical_id=? WHERE id=?",
                               (alias['canonical_id'], mill['id']))
                    stats['crm_linked'] += 1
                else:
                    all_entities = conn.execute(
                        "SELECT * FROM entity_canonical WHERE type='mill'"
                    ).fetchall()
                    best_score, best_id = 0, None
                    for ent in all_entities:
                        s = compute_score(name, ent['canonical_name'], 'mill', aliases_dict)
                        if s > best_score:
                            best_score, best_id = s, ent['canonical_id']
                    if best_score >= THRESH_AUTO and best_id:
                        self._add_alias(conn, best_id, name, norm, 'migration', best_score)
                        conn.execute("UPDATE mills SET canonical_id=? WHERE id=?", (best_id, mill['id']))
                        stats['crm_linked'] += 1
                    elif best_score >= THRESH_REVIEW and best_id:
                        stats['reviews_queued'] += 1
                    else:
                        meta = {'city': mill['city'] or '', 'state': mill['state'] or '',
                                'region': mill['region'] or ''}
                        result = self.create_entity(conn, 'mill', name, meta)
                        conn.execute("UPDATE mills SET canonical_id=? WHERE id=?",
                                   (result['canonical_id'], mill['id']))
                        stats['entities_created'] += 1
                        stats['crm_linked'] += 1

            # ── Phase 6: Scan Mill Intel mills ────────────────────
            if mi_db_path:
                try:
                    mi_conn = sqlite3.connect(mi_db_path, timeout=10)
                    mi_conn.row_factory = sqlite3.Row
                    mi_mills = mi_conn.execute(
                        "SELECT * FROM mills WHERE canonical_id IS NULL OR canonical_id=''"
                    ).fetchall()
                    for mi_mill in mi_mills:
                        name = mi_mill['name']
                        norm = _make_normalized_key(name)
                        alias = conn.execute(
                            "SELECT canonical_id FROM entity_alias WHERE variant_normalized=?", (norm,)
                        ).fetchone()
                        if alias:
                            mi_conn.execute("UPDATE mills SET canonical_id=? WHERE id=?",
                                          (alias['canonical_id'], mi_mill['id']))
                            stats['mi_linked'] += 1
                        else:
                            all_entities = conn.execute(
                                "SELECT * FROM entity_canonical WHERE type='mill'"
                            ).fetchall()
                            best_score, best_id = 0, None
                            for ent in all_entities:
                                s = compute_score(name, ent['canonical_name'], 'mill', aliases_dict)
                                if s > best_score:
                                    best_score, best_id = s, ent['canonical_id']
                            if best_score >= THRESH_AUTO and best_id:
                                self._add_alias(conn, best_id, name, norm, 'migration', best_score)
                                mi_conn.execute("UPDATE mills SET canonical_id=? WHERE id=?",
                                              (best_id, mi_mill['id']))
                                stats['mi_linked'] += 1
                            else:
                                meta = {'city': mi_mill['city'] or '', 'state': mi_mill['state'] or '',
                                        'region': mi_mill['region'] or ''}
                                result = self.create_entity(conn, 'mill', name, meta)
                                mi_conn.execute("UPDATE mills SET canonical_id=? WHERE id=?",
                                              (result['canonical_id'], mi_mill['id']))
                                stats['entities_created'] += 1
                                stats['mi_linked'] += 1
                    mi_conn.commit()
                    mi_conn.close()
                except Exception as e:
                    stats['mi_error'] = str(e)

            conn.commit()
            return stats
        finally:
            conn.close()

    def get_pending_reviews(self):
        """Get all unresolved review items."""
        conn = self._get_conn()
        try:
            reviews = conn.execute(
                "SELECT * FROM entity_review WHERE resolved_id IS NULL ORDER BY created_at DESC"
            ).fetchall()
            results = []
            for r in reviews:
                candidates = json.loads(r['candidates'] or '[]')
                # Enrich with names
                for c in candidates:
                    ent = conn.execute(
                        "SELECT canonical_name FROM entity_canonical WHERE canonical_id=?",
                        (c['canonical_id'],)
                    ).fetchone()
                    c['canonical_name'] = ent['canonical_name'] if ent else '(deleted)'
                results.append({
                    'id': r['id'],
                    'input_name': r['input_name'],
                    'entity_type': r['entity_type'],
                    'candidates': candidates,
                    'source_context': r['source_context'],
                    'created_at': r['created_at'],
                })
            return results
        finally:
            conn.close()

    def get_stats(self):
        """Get entity resolution statistics."""
        conn = self._get_conn()
        try:
            mills = conn.execute("SELECT COUNT(*) as c FROM entity_canonical WHERE type='mill'").fetchone()['c']
            custs = conn.execute("SELECT COUNT(*) as c FROM entity_canonical WHERE type='customer'").fetchone()['c']
            aliases = conn.execute("SELECT COUNT(*) as c FROM entity_alias").fetchone()['c']
            pending = conn.execute("SELECT COUNT(*) as c FROM entity_review WHERE resolved_id IS NULL").fetchone()['c']
            return {
                'mill_entities': mills,
                'customer_entities': custs,
                'total_aliases': aliases,
                'pending_reviews': pending,
            }
        finally:
            conn.close()
