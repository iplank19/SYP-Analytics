"""
SYP Analytics - Flask Server
Handles mileage API proxy, CRM, and static file serving
"""
from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
import requests
import os
import re
import time
import sqlite3
import json
from datetime import datetime, timedelta
import tempfile
import math

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# CRM Database Setup
CRM_DB_PATH = os.path.join(os.path.dirname(__file__), 'crm.db')

def get_crm_db():
    conn = sqlite3.connect(CRM_DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_crm_db():
    conn = get_crm_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS prospects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL,
            contact_name TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            notes TEXT,
            status TEXT DEFAULT 'prospect' CHECK(status IN ('prospect', 'qualified', 'converted', 'lost')),
            source TEXT,
            trader TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS contact_touches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prospect_id INTEGER NOT NULL,
            touch_type TEXT CHECK(touch_type IN ('call', 'email', 'meeting', 'note')),
            notes TEXT,
            products_discussed TEXT,
            follow_up_date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS prospect_product_interest (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prospect_id INTEGER NOT NULL,
            product TEXT NOT NULL,
            interest_level TEXT CHECK(interest_level IN ('high', 'medium', 'low')),
            volume_estimate TEXT,
            notes TEXT,
            FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_touches_prospect ON contact_touches(prospect_id);
        CREATE INDEX IF NOT EXISTS idx_touches_follow_up ON contact_touches(follow_up_date);
        CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
        CREATE INDEX IF NOT EXISTS idx_prospects_trader ON prospects(trader);

        -- Customers table (cloud-based)
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            contact TEXT,
            phone TEXT,
            email TEXT,
            destination TEXT,
            locations TEXT,
            notes TEXT,
            trader TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Mills table (universal — used by both CRM and Mill Intel)
        CREATE TABLE IF NOT EXISTS mills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            contact TEXT,
            phone TEXT,
            email TEXT,
            location TEXT,
            city TEXT,
            state TEXT,
            region TEXT,
            lat REAL,
            lon REAL,
            products TEXT,
            notes TEXT,
            trader TEXT NOT NULL DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_customers_trader ON customers(trader);
        CREATE INDEX IF NOT EXISTS idx_mills_trader ON mills(trader);
        CREATE INDEX IF NOT EXISTS idx_mills_name ON mills(name);
        CREATE INDEX IF NOT EXISTS idx_mills_region ON mills(region);
    ''')
    # Add locations column if missing (migration)
    try:
        conn.execute("ALTER TABLE mills ADD COLUMN locations TEXT DEFAULT '[]'")
    except:
        pass
    conn.commit()
    conn.close()

# Initialize CRM database on startup
init_crm_db()

def find_or_create_crm_mill(name, city='', state='', region='', lat=None, lon=None, trader=''):
    """Find mill by company name, or create. Adds location to locations array if new."""
    company = extract_company_name(name)
    conn = get_crm_db()
    try:
        # Look up by company name (case-insensitive)
        mill = conn.execute("SELECT * FROM mills WHERE UPPER(name)=?", (company.upper(),)).fetchone()

        city_clean = city.split(',')[0].strip() if city else ''
        if not state and city:
            state = mi_extract_state(city)
        if not region and state:
            region = MI_STATE_REGIONS.get(state.upper(), 'central')

        if mill:
            # Add location to locations array if not already present
            try:
                locations = json.loads(mill['locations'] or '[]')
            except (json.JSONDecodeError, TypeError):
                locations = []
            loc_exists = any(
                l.get('city', '').lower() == city_clean.lower() and l.get('state', '').upper() == (state or '').upper()
                for l in locations
            ) if city_clean else True  # Skip if no city

            updates = []
            vals = []
            if city_clean and not loc_exists:
                locations.append({
                    'city': city_clean, 'state': state or '',
                    'lat': lat, 'lon': lon, 'name': name
                })
                updates.append("locations=?"); vals.append(json.dumps(locations))
            # Update primary geo if missing
            if not mill['city'] and city_clean:
                updates.append("city=?"); vals.append(city_clean)
            if not mill['state'] and state:
                updates.append("state=?"); vals.append(state)
            if not mill['region'] and region:
                updates.append("region=?"); vals.append(region)
            if mill['lat'] is None and lat is not None:
                updates.append("lat=?"); vals.append(lat)
            if mill['lon'] is None and lon is not None:
                updates.append("lon=?"); vals.append(lon)
            if updates:
                vals.append(mill['id'])
                conn.execute(f"UPDATE mills SET {', '.join(updates)}, updated_at=CURRENT_TIMESTAMP WHERE id=?", vals)
                conn.commit()
                mill = conn.execute("SELECT * FROM mills WHERE id=?", (mill['id'],)).fetchone()
            return dict(mill)

        # Create new company-level mill
        location_str = f"{city_clean}, {state}".strip(', ') if city_clean or state else ''
        locations = []
        if city_clean:
            locations.append({'city': city_clean, 'state': state or '', 'lat': lat, 'lon': lon, 'name': name})

        conn.execute(
            """INSERT INTO mills (name, location, city, state, region, lat, lon, locations, products, notes, trader)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (company, location_str, city_clean, state, region, lat, lon,
             json.dumps(locations), '[]', '', trader)
        )
        conn.commit()
        mill = conn.execute("SELECT * FROM mills WHERE id=?", (conn.execute("SELECT last_insert_rowid()").fetchone()[0],)).fetchone()
        return dict(mill)
    finally:
        conn.close()

def sync_mill_to_mi(crm_mill, mi_conn=None):
    """Ensure a CRM mill exists in the MI mills table (for JOINs). Uses same ID."""
    own_conn = mi_conn is None
    conn = mi_conn or get_mi_db()
    existing = conn.execute("SELECT id FROM mills WHERE id=?", (crm_mill['id'],)).fetchone()
    if not existing:
        conn.execute(
            "INSERT OR REPLACE INTO mills (id, name, city, state, lat, lon, region, locations, products, notes) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (crm_mill['id'], crm_mill['name'], crm_mill.get('city', ''), crm_mill.get('state', ''),
             crm_mill.get('lat'), crm_mill.get('lon'), crm_mill.get('region', ''),
             crm_mill.get('locations', '[]'), crm_mill.get('products', '[]'), crm_mill.get('notes', ''))
        )
    else:
        conn.execute(
            "UPDATE mills SET name=?, city=?, state=?, lat=?, lon=?, region=?, locations=?, products=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (crm_mill['name'], crm_mill.get('city', ''), crm_mill.get('state', ''),
             crm_mill.get('lat'), crm_mill.get('lon'), crm_mill.get('region', ''),
             crm_mill.get('locations', '[]'), crm_mill.get('products', '[]'), crm_mill.get('notes', ''),
             crm_mill['id'])
        )
    if own_conn:
        conn.commit()
        conn.close()

# ===== MILL INTEL DATABASE =====
MI_DB_PATH = os.path.join(os.path.dirname(__file__), 'mill-intel', 'mill_intel.db')

MI_STATE_REGIONS = {
    'TX':'west','LA':'west','AR':'west','OK':'west','NM':'west',
    'MS':'central','AL':'central','TN':'central','KY':'central','MO':'central',
    'GA':'east','FL':'east','SC':'east','NC':'east','VA':'east','WV':'east',
    'OH':'east','IN':'east','IL':'central','WI':'central','MI':'east','MN':'central',
    'IA':'central','PA':'east','NY':'east','NJ':'east','MD':'east','DE':'east',
    'CT':'east','MA':'east','ME':'east','NH':'east','VT':'east','RI':'east'
}

# Canonical mill directory (matches MILL_DIRECTORY in state.js)
MILL_DIRECTORY = {
    'Canfor - DeQuincy': ('DeQuincy', 'LA'), 'Canfor - Urbana': ('Urbana', 'AR'),
    'Canfor - Fulton': ('Fulton', 'AL'), 'Canfor - Axis': ('Axis', 'AL'),
    'Canfor - El Dorado': ('El Dorado', 'AR'), 'Canfor - Thomasville': ('Thomasville', 'GA'),
    'Canfor - Moultrie': ('Moultrie', 'GA'), 'Canfor - DeRidder': ('Deridder', 'LA'),
    'Canfor - Camden SC': ('Camden', 'SC'), 'Canfor - Conway': ('Conway', 'SC'),
    'Canfor - Marion': ('Marion', 'SC'), 'Canfor - Graham': ('Graham', 'NC'),
    'West Fraser - Huttig': ('Huttig', 'AR'), 'West Fraser - Leola': ('Leola', 'AR'),
    'West Fraser - Opelika': ('Opelika', 'AL'), 'West Fraser - Russellville': ('Russellville', 'AR'),
    'West Fraser - Blackshear': ('Blackshear', 'GA'), 'West Fraser - Dudley GA': ('Dudley', 'GA'), 'West Fraser - Dudley': ('Dudley', 'GA'),
    'West Fraser - Fitzgerald': ('Fitzgerald', 'GA'), 'West Fraser - New Boston': ('New Boston', 'TX'),
    'West Fraser - Henderson': ('Henderson', 'TX'), 'West Fraser - Lufkin': ('Lufkin', 'TX'),
    'West Fraser - Joyce': ('Joyce', 'LA'),
    'West Fraser - Maplesville': ('Maplesville', 'AL'), 'West Fraser - Mcdavid': ('Mcdavid', 'FL'),
    'GP - Clarendon': ('Clarendon', 'NC'), 'GP - Camden': ('Camden', 'TX'),
    'GP - Talladega': ('Talladega', 'AL'), 'GP - Frisco City': ('Frisco City', 'AL'),
    'GP - Gurdon': ('Gurdon', 'AR'), 'GP - Albany': ('Albany', 'GA'),
    'GP - Warrenton': ('Warrenton', 'GA'), 'GP - Taylorsville': ('Taylorsville', 'MS'),
    'GP - Dudley NC': ('Dudley', 'NC'), 'GP - Diboll': ('Diboll', 'TX'),
    'GP - Pineland': ('Pineland', 'TX'), 'GP - Prosperity': ('Prosperity', 'SC'),
    'GP - Rome': ('Rome', 'GA'), 'GP - Rocky Creek': ('Frisco City', 'AL'),
    'Weyerhaeuser - Dierks': ('Dierks', 'AR'), 'Weyerhaeuser - Millport': ('Millport', 'AL'),
    'Weyerhaeuser - Dodson': ('Dodson', 'LA'), 'Weyerhaeuser - Holden': ('Holden', 'LA'),
    'Weyerhaeuser - Philadelphia': ('Philadelphia', 'MS'), 'Weyerhaeuser - Bruce': ('Bruce', 'MS'),
    'Weyerhaeuser - Magnolia': ('Magnolia', 'MS'), 'Weyerhaeuser - Grifton': ('Grifton', 'NC'),
    'Weyerhaeuser - Plymouth': ('Plymouth', 'NC'), 'Weyerhaeuser - Idabel': ('Idabel', 'OK'),
    'Interfor - Monticello': ('Monticello', 'AR'), 'Interfor - Georgetown': ('Georgetown', 'SC'),
    'Interfor - Fayette': ('Fayette', 'AL'), 'Interfor - DeQuincy': ('DeQuincy', 'LA'),
    'Interfor - Preston': ('Preston', 'GA'), 'Interfor - Perry': ('Perry', 'GA'),
    'Interfor - Baxley': ('Baxley', 'GA'), 'Interfor - Swainsboro': ('Swainsboro', 'GA'),
    'Interfor - Thomaston': ('Thomaston', 'GA'), 'Interfor - Eatonton': ('Eatonton', 'GA'),
    'PotlatchDeltic - Warren': ('Warren', 'AR'), 'PotlatchDeltic - Ola': ('Ola', 'AR'),
    'PotlatchDeltic - Waldo': ('Waldo', 'AR'),
    'Rex Lumber - Bristol': ('Bristol', 'FL'), 'Rex Lumber - Graceville': ('Graceville', 'FL'),
    'Rex Lumber - Troy': ('Troy', 'AL'), 'Rex Lumber - Brookhaven': ('Brookhaven', 'MS'),
    'Tolko - Leland': ('Leland', 'MS'),
    'Idaho Forest Group - Lumberton': ('Lumberton', 'MS'),
    'Hunt Forest Products - Winnfield': ('Winnfield', 'LA'),
    'Biewer - Newton': ('Newton', 'MS'), 'Biewer - Winona': ('Winona', 'MS'),
    'Anthony Timberlands - Bearden': ('Bearden', 'AR'), 'Anthony Timberlands - Malvern': ('Malvern', 'AR'),
    'T.R. Miller - Brewton': ('Brewton', 'AL'),
    'Lincoln Lumber - Jasper': ('Jasper', 'TX'), 'Lincoln Lumber - Conroe': ('Conroe', 'TX'),
    'Barge Forest Products - Macon': ('Macon', 'MS'),
    'Scotch Lumber - Fulton': ('Fulton', 'AL'),
    'Binderholz - Live Oak': ('Live Oak', 'FL'), 'Binderholz - Enfield': ('Enfield', 'NC'),
    'Hood Industries - Beaumont': ('Beaumont', 'MS'), 'Hood Industries - Waynesboro': ('Waynesboro', 'MS'),
    'Mid-South Lumber - Booneville': ('Booneville', 'MS'),
    'Murray Lumber - Murray': ('Murray', 'KY'),
    'Langdale Forest Products - Valdosta': ('Valdosta', 'GA'),
    'LaSalle Lumber - Urania': ('Urania', 'LA'),
    'Big River Forest Products - Gloster': ('Gloster', 'MS'),
    'Big River Forest Products - Vicksburg': ('Vicksburg', 'MS'),
    'Hankins Lumber - Grenada': ('Grenada', 'MS'),
    'Westervelt Lumber - Moundville': ('Moundville', 'AL'), 'Westervelt Lumber - Tuscaloosa': ('Tuscaloosa', 'AL'),
}

# Company alias mapping (mirrors _MILL_COMPANY_ALIASES in state.js)
MILL_COMPANY_ALIASES = {
    'canfor southern pine': 'Canfor', 'canfor southern pine inc': 'Canfor', 'csp': 'Canfor',
    'west fraser': 'West Fraser', 'wf': 'West Fraser',
    'georgia-pacific': 'GP', 'georgia pacific': 'GP', 'gp': 'GP',
    'weyerhaeuser': 'Weyerhaeuser', 'wey': 'Weyerhaeuser',
    'interfor': 'Interfor', 'interfor pacific': 'Interfor', 'interfor pacific, inc.': 'Interfor',
    'potlatchdeltic': 'PotlatchDeltic', 'potlatch': 'PotlatchDeltic', 'potlatch deltic': 'PotlatchDeltic',
    'potlatchdeltic ola': 'PotlatchDeltic',
    'rex lumber': 'Rex Lumber',
    'tolko': 'Tolko',
    'idaho forest group': 'Idaho Forest Group', 'ifg': 'Idaho Forest Group',
    'hunt forest products': 'Hunt Forest Products',
    'biewer': 'Biewer', 'biewer lumber': 'Biewer',
    'anthony timberlands': 'Anthony Timberlands',
    't.r. miller': 'T.R. Miller', 'tr miller': 'T.R. Miller',
    'lincoln lumber': 'Lincoln Lumber',
    'barge forest products': 'Barge Forest Products',
    'scotch lumber': 'Scotch Lumber',
    'klausner': 'Binderholz', 'klausner lumber': 'Binderholz',
    'hood industries': 'Hood Industries',
    'mid-south lumber': 'Mid-South Lumber', 'mid south lumber': 'Mid-South Lumber',
    'mid south lumber company': 'Mid-South Lumber', 'midsouth': 'Mid-South Lumber',
    'murray lumber': 'Murray Lumber',
    'langdale forest products': 'Langdale Forest Products',
    'lasalle lumber': 'LaSalle Lumber',
    'big river forest products': 'Big River Forest Products',
    'hankins lumber': 'Hankins Lumber',
    'westervelt lumber': 'Westervelt Lumber',
    'beasley forest products': 'Beasley Forest Products',
    'binderholz': 'Binderholz', 'binderholz timber': 'Binderholz', 'binderholz timber llc': 'Binderholz',
    'charles ingram': 'Charles Ingram Lumber', 'charles ingram lumber': 'Charles Ingram Lumber',
    'charles ingram lumber co': 'Charles Ingram Lumber',
    'grayson lumber': 'Grayson Lumber', 'grayson lumber corp': 'Grayson Lumber',
    'great south timber': 'Great South Timber', 'great south timber & lbr': 'Great South Timber',
    'green bay packaging': 'Green Bay Packaging', 'green bay packaging inc.': 'Green Bay Packaging',
    'hardy': 'Idaho Forest Group', 'hardy technologies': 'Idaho Forest Group', 'hardy technologies llc': 'Idaho Forest Group',
    'resolute': 'Resolute FP', 'resolute fp': 'Resolute FP', 'resolute fp us inc': 'Resolute FP',
    'two rivers': 'Two Rivers Lumber', 'two rivers lumber': 'Two Rivers Lumber',
    'two rivers lumber co llc': 'Two Rivers Lumber',
    'vicksburg forest products': 'Vicksburg Forest Products',
    'wm sheppard': 'WM Sheppard Lumber', 'wm sheppard lumber': 'WM Sheppard Lumber',
    'wm sheppard lumber co inc': 'WM Sheppard Lumber', 'wm shepard': 'WM Sheppard Lumber', 'wm shepard lumber': 'WM Sheppard Lumber',
    'beasley': 'Beasley Forest Products', 'beasley forest': 'Beasley Forest Products',
    'dupont pine': 'DuPont Pine Products', 'dupont pine products': 'DuPont Pine Products',
    'grayson': 'Grayson Lumber', 'great south': 'Great South Timber',
    'green bay': 'Green Bay Packaging', 'green bay packaging inc': 'Green Bay Packaging',
    'jordan': 'Jordan Lumber', 'jordan lumber': 'Jordan Lumber',
    'vicksburg': 'Vicksburg Forest Products', 'vicksburg forest': 'Vicksburg Forest Products',
    'harrigan': 'Harrigan Lumber', 'harrigan lumber': 'Harrigan Lumber', 'harrigan lumber co': 'Harrigan Lumber',
    'lumberton': 'Idaho Forest Group', 'lumberton lumber': 'Idaho Forest Group',
    'waldo': 'PotlatchDeltic', 'resolute fp us': 'Resolute FP',
    'idaho forest': 'Idaho Forest Group',
}

def extract_company_name(mill_name):
    """Extract company name from 'Company - City' format or via alias lookup."""
    if not mill_name:
        return mill_name
    name = mill_name.strip()
    # Direct "Company - City" format
    if ' - ' in name:
        return name.split(' - ')[0].strip()
    # Alias lookup (longest-first for greedy match)
    lower = name.lower().replace('_', ' ').replace('-', ' ').strip()
    for alias, canonical in sorted(MILL_COMPANY_ALIASES.items(), key=lambda x: -len(x[0])):
        a = alias.replace('-', ' ')
        if lower == a:
            return canonical
    # Partial prefix match (require word boundary to avoid false positives)
    for alias, canonical in sorted(MILL_COMPANY_ALIASES.items(), key=lambda x: -len(x[0])):
        a = alias.replace('-', ' ')
        if lower.startswith(a + ' ') or lower == a:
            return canonical
    return name

# Customer alias mapping (mirrors _CUSTOMER_ALIASES in state.js)
CUSTOMER_ALIASES = {
    'power truss': 'Power Truss and Lumber', 'power truss and lumber': 'Power Truss and Lumber',
    'power truss & lumber': 'Power Truss and Lumber',
    'protec panel and truss': 'ProTec Panel and Truss', 'protec panel & truss': 'ProTec Panel and Truss',
    'craters and freighters': 'Craters & Freighters', 'craters & freighters': 'Craters & Freighters',
    'craters & freighters (stl custom crating llc)': 'Craters & Freighters',
    'precision truss': 'Precision Truss & Metal', 'precision truss and metal': 'Precision Truss & Metal',
    'precision truss & metal': 'Precision Truss & Metal', 'precision truss & walls': 'Precision Truss & Metal',
    'precision truss and walls': 'Precision Truss & Metal',
    'rehkemper and sons': 'Rehkemper & Sons', 'rehkemper & sons': 'Rehkemper & Sons',
    'rehkemper sons': 'Rehkemper & Sons', 'rehkemper & son inc': 'Rehkemper & Sons',
    'rehkemper & son': 'Rehkemper & Sons', 'rehkemper and son inc': 'Rehkemper & Sons',
    'power truss inc': 'Power Truss and Lumber',
    'atwood forest prods inc': 'Atwood Forest Products Inc', 'atwood forest prods': 'Atwood Forest Products Inc',
    'g proulx bldg products': 'G Proulx Building Products',
    'jefferson home bldrs inc': 'Jefferson Home Builders Inc', 'jefferson home bldrs': 'Jefferson Home Builders Inc',
    'nvr building prdts co': 'NVR Building Products Co', 'nvr building prdts': 'NVR Building Products Co',
    'raymond bldg sy llc uslbm': 'Raymond Building Supply LLC USLBM',
}

# Common corporate suffixes for stripping during matching
_CORP_SUFFIXES_RE = re.compile(
    r'\b(inc\.?|llc\.?|co\.?|corp\.?|corporation|company|enterprises|ltd\.?|limited|'
    r'group|holdings|lumber|timber|forest products|building products|distribution|supply)\s*\.?\s*$',
    re.IGNORECASE
)

def normalize_customer_name(name):
    """Normalize a customer name by stripping common suffixes and matching aliases."""
    if not name:
        return name
    trimmed = name.strip()
    if not trimmed:
        return trimmed

    # 1. Alias dictionary lookup
    lower = re.sub(r'[_\-\u2013\u2014]+', ' ', trimmed.lower()).strip()
    lower = re.sub(r'\s+', ' ', lower)
    for alias, canonical in sorted(CUSTOMER_ALIASES.items(), key=lambda x: -len(x[0])):
        if lower == alias:
            return canonical

    # 2. Check existing customers in DB for suffix-stripped match
    try:
        conn = get_crm_db()
        rows = conn.execute('SELECT DISTINCT name FROM customers').fetchall()
        conn.close()
        stripped = _CORP_SUFFIXES_RE.sub('', lower).strip()
        if stripped:
            for row in rows:
                if row['name']:
                    db_stripped = _CORP_SUFFIXES_RE.sub('', row['name'].lower()).strip()
                    if stripped == db_stripped:
                        return row['name']
    except Exception:
        pass

    # 3. No match - return trimmed original
    return trimmed

def get_mi_db():
    conn = sqlite3.connect(MI_DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_mi_db():
    conn = get_mi_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS mills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            city TEXT,
            state TEXT,
            lat REAL,
            lon REAL,
            region TEXT,
            products TEXT DEFAULT '[]',
            notes TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_mills_name ON mills(name);
        CREATE INDEX IF NOT EXISTS idx_mills_region ON mills(region);

        CREATE TABLE IF NOT EXISTS mill_quotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mill_id INTEGER NOT NULL,
            mill_name TEXT NOT NULL,
            product TEXT NOT NULL,
            price REAL NOT NULL,
            length TEXT DEFAULT 'RL',
            volume REAL DEFAULT 0,
            tls INTEGER DEFAULT 0,
            ship_window TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            date TEXT NOT NULL,
            trader TEXT NOT NULL,
            source TEXT DEFAULT 'manual',
            raw_text TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (mill_id) REFERENCES mills(id)
        );
        CREATE INDEX IF NOT EXISTS idx_mq_mill ON mill_quotes(mill_id);
        CREATE INDEX IF NOT EXISTS idx_mq_product ON mill_quotes(product);
        CREATE INDEX IF NOT EXISTS idx_mq_date ON mill_quotes(date);
        CREATE INDEX IF NOT EXISTS idx_mq_trader ON mill_quotes(trader);
        CREATE INDEX IF NOT EXISTS idx_mq_composite ON mill_quotes(mill_name, product, date);
        CREATE INDEX IF NOT EXISTS idx_mq_matrix ON mill_quotes(mill_name, product, length, id DESC);

        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            destination TEXT,
            lat REAL,
            lon REAL,
            trader TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS rl_prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            product TEXT NOT NULL,
            region TEXT NOT NULL,
            price REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_rl_date ON rl_prices(date);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_rl_unique ON rl_prices(date, product, region);

        CREATE TABLE IF NOT EXISTS lanes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            origin TEXT NOT NULL,
            dest TEXT NOT NULL,
            miles INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(origin, dest)
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    ''')
    # Add locations column if missing (migration)
    try:
        conn.execute("ALTER TABLE mills ADD COLUMN locations TEXT DEFAULT '[]'")
    except:
        pass
    conn.commit()
    conn.close()

init_mi_db()

# Sync CRM mills → MI mills table on startup (keeps JOINs working)
def sync_crm_mills_to_mi():
    crm_conn = get_crm_db()
    crm_mills = crm_conn.execute("SELECT * FROM mills").fetchall()
    crm_conn.close()
    mi_conn = get_mi_db()
    for m in crm_mills:
        md = dict(m)
        existing = mi_conn.execute("SELECT id FROM mills WHERE id=?", (md['id'],)).fetchone()
        existing_name = mi_conn.execute("SELECT id FROM mills WHERE name=? AND id!=?", (md['name'], md['id'])).fetchone() if not existing else None
        if existing_name:
            # Name exists with different ID — delete old entry to avoid UNIQUE conflict
            mi_conn.execute("DELETE FROM mills WHERE id=?", (existing_name['id'],))
        if existing:
            mi_conn.execute(
                "UPDATE mills SET name=?, city=?, state=?, lat=?, lon=?, region=?, locations=?, products=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (md['name'], md.get('city', ''), md.get('state', ''),
                 md.get('lat'), md.get('lon'), md.get('region', ''),
                 md.get('locations', '[]'), md.get('products', '[]'), md.get('notes', ''),
                 md['id'])
            )
        else:
            mi_conn.execute(
                "INSERT INTO mills (id, name, city, state, lat, lon, region, locations, products, notes) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (md['id'], md['name'], md.get('city', ''), md.get('state', ''),
                 md.get('lat'), md.get('lon'), md.get('region', ''),
                 md.get('locations', '[]'), md.get('products', '[]'), md.get('notes', ''))
            )
    mi_conn.commit()
    mi_conn.close()

# Seed CRM mills from MILL_DIRECTORY, grouped by company
def seed_crm_mills():
    conn = get_crm_db()
    existing = {row['name'].upper() for row in conn.execute("SELECT name FROM mills").fetchall()}
    # Group MILL_DIRECTORY by company
    companies = {}
    for full_name, (city, state) in MILL_DIRECTORY.items():
        company = full_name.split(' - ')[0]
        if company not in companies:
            companies[company] = []
        companies[company].append({'city': city, 'state': state, 'name': full_name})
    added = 0
    for company, locs in companies.items():
        if company.upper() not in existing:
            # Use first location as primary
            primary = locs[0]
            region = MI_STATE_REGIONS.get(primary['state'].upper(), 'central')
            location = f"{primary['city']}, {primary['state']}"
            locations_json = json.dumps([
                {'city': l['city'], 'state': l['state'], 'lat': None, 'lon': None, 'name': l['name']}
                for l in locs
            ])
            conn.execute(
                "INSERT INTO mills (name, location, city, state, region, locations, products, notes, trader) VALUES (?,?,?,?,?,?,?,?,?)",
                (company, location, primary['city'], primary['state'], region, locations_json, '[]', '', '')
            )
            added += 1
    if added:
        conn.commit()
        print(f"Seeded {added} company mills from MILL_DIRECTORY into CRM")
    conn.close()

seed_crm_mills()
sync_crm_mills_to_mi()

def mi_extract_state(location):
    if not location:
        return None
    parts = location.strip().rstrip('.').split(',')
    if len(parts) >= 2:
        st = parts[-1].strip().upper()[:2]
        if len(st) == 2 and st.isalpha():
            return st
    return None

def mi_get_region(state_code):
    return MI_STATE_REGIONS.get(state_code, 'central')

def mi_geocode_location(location):
    """Geocode using shared geo_cache, with DB fallback then Nominatim."""
    if not location:
        return None
    cache_key = location.lower().strip()
    if cache_key in geo_cache:
        return geo_cache[cache_key]
    # Check DB for stored coords
    try:
        conn = get_mi_db()
        row = conn.execute("SELECT lat, lon FROM mills WHERE LOWER(city)=? AND lat IS NOT NULL", (cache_key,)).fetchone()
        conn.close()
        if row:
            coords = {'lat': row['lat'], 'lon': row['lon']}
            geo_cache[cache_key] = coords
            return coords
    except:
        pass
    return geocode_location(location)

def mi_get_distance(origin_coords, dest_coords):
    """Delegate to shared get_distance (with caching)."""
    return get_distance(origin_coords, dest_coords)

# Shared geocode + distance caches (populated from CRM mills on startup)
geo_cache = {}
distance_cache = {}

# Matrix response cache (short TTL to handle concurrent requests)
_matrix_cache = {}
_matrix_cache_ttl = 30  # seconds

def get_cached_matrix(cache_key):
    """Get cached matrix response if still valid."""
    if cache_key in _matrix_cache:
        data, timestamp = _matrix_cache[cache_key]
        if time.time() - timestamp < _matrix_cache_ttl:
            return data
        del _matrix_cache[cache_key]
    return None

def set_cached_matrix(cache_key, data):
    """Cache matrix response."""
    _matrix_cache[cache_key] = (data, time.time())
    # Cleanup old entries (keep cache size reasonable)
    if len(_matrix_cache) > 20:
        oldest_key = min(_matrix_cache.keys(), key=lambda k: _matrix_cache[k][1])
        del _matrix_cache[oldest_key]

def invalidate_matrix_cache():
    """Clear matrix cache (call when quotes are added/updated)."""
    global _matrix_cache
    _matrix_cache = {}

def warm_geo_cache():
    """Pre-load geo_cache from CRM mills that have lat/lon stored."""
    try:
        conn = get_crm_db()
        rows = conn.execute("SELECT city, state, location, lat, lon FROM mills WHERE lat IS NOT NULL AND lon IS NOT NULL").fetchall()
        conn.close()
        for r in rows:
            coords = {'lat': r['lat'], 'lon': r['lon']}
            # Cache by "city, state" and by "location" field
            if r['city'] and r['state']:
                geo_cache[f"{r['city']}, {r['state']}".lower().strip()] = coords
            if r['location']:
                geo_cache[r['location'].lower().strip()] = coords
        print(f"Geo cache warmed: {len(geo_cache)} entries from CRM mills")
    except Exception as e:
        print(f"Geo cache warm failed: {e}")

warm_geo_cache()

# Serve main app
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

def geocode_location(location):
    """Convert city, state to coordinates - prefers cities over counties"""
    if not location:
        return None

    # Check cache first
    cache_key = location.lower().strip()
    if cache_key in geo_cache:
        return geo_cache[cache_key]

    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            'q': location,
            'format': 'json',
            'limit': 5,  # Get multiple results to prefer cities over counties
            'countrycodes': 'us'
        }
        headers = {'User-Agent': 'SYP-Analytics/1.0'}

        resp = requests.get(url, params=params, headers=headers, timeout=10)
        results = resp.json()

        if results:
            # Prefer city/town/village over county - counties often have same name as cities
            city_types = ['city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood']
            best = None
            for r in results:
                if r.get('type') in city_types or r.get('addresstype') in city_types:
                    best = r
                    break
            if not best:
                best = results[0]

            coords = {
                'lat': float(best['lat']),
                'lon': float(best['lon'])
            }
            geo_cache[cache_key] = coords
            return coords
        return None
    except Exception as e:
        print(f"Geocode error for {location}: {e}")
        return None

def get_distance(origin_coords, dest_coords):
    """Get driving distance in miles between two coordinate pairs (cached)."""
    # Round coords to 3 decimals for cache key (~100m precision, plenty for cities)
    cache_key = (round(origin_coords['lat'],3), round(origin_coords['lon'],3),
                 round(dest_coords['lat'],3), round(dest_coords['lon'],3))
    if cache_key in distance_cache:
        return distance_cache[cache_key]
    try:
        coords_str = f"{origin_coords['lon']},{origin_coords['lat']};{dest_coords['lon']},{dest_coords['lat']}"
        url = f"https://router.project-osrm.org/route/v1/driving/{coords_str}"
        params = {'overview': 'false'}

        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()

        if data.get('code') == 'Ok' and data.get('routes'):
            meters = data['routes'][0]['distance']
            miles = round(meters / 1609.34)
            distance_cache[cache_key] = miles
            return miles
        return None
    except Exception as e:
        print(f"Distance error: {e}")
        return None

# Single mileage lookup
@app.route('/api/mileage', methods=['POST'])
def mileage_lookup():
    data = request.json
    origin = data.get('origin', '')
    dest = data.get('dest', '')
    
    if not origin or not dest:
        return jsonify({'error': 'Missing origin or dest'}), 400
    
    # Geocode both locations
    origin_coords = geocode_location(origin)
    if not origin_coords:
        return jsonify({'error': f'Could not geocode origin: {origin}'}), 404
    
    time.sleep(0.5)  # Rate limit for Nominatim
    
    dest_coords = geocode_location(dest)
    if not dest_coords:
        return jsonify({'error': f'Could not geocode destination: {dest}'}), 404
    
    # Get distance
    miles = get_distance(origin_coords, dest_coords)
    if miles is None:
        return jsonify({'error': 'Could not calculate route'}), 404
    
    return jsonify({'miles': miles, 'origin': origin, 'dest': dest})

# Bulk mileage lookup
@app.route('/api/mileage/bulk', methods=['POST'])
def mileage_bulk():
    data = request.json
    lanes = data.get('lanes', [])

    if not lanes:
        return jsonify({'error': 'No lanes provided'}), 400

    results = []
    # Pre-geocode shared destination (all lanes in a quote typically share the same dest)
    dest_cache = {}
    need_nominatim = False

    for lane in lanes:
        origin = lane.get('origin', '')
        dest = lane.get('dest', '')

        if not origin or not dest:
            results.append({'origin': origin, 'dest': dest, 'miles': None, 'error': 'Missing data'})
            continue

        # Geocode origin (only hit Nominatim rate limit if not cached)
        origin_cached = origin.lower().strip() in geo_cache
        if need_nominatim and not origin_cached:
            time.sleep(0.3)
        origin_coords = geocode_location(origin)
        if not origin_coords:
            results.append({'origin': origin, 'dest': dest, 'miles': None, 'error': f'Could not geocode: {origin}'})
            continue
        if not origin_cached:
            need_nominatim = True

        # Geocode dest (cache across lanes — usually the same destination)
        if dest not in dest_cache:
            dest_cached = dest.lower().strip() in geo_cache
            if need_nominatim and not dest_cached:
                time.sleep(0.3)
            dest_cache[dest] = geocode_location(dest)
            if not dest_cached:
                need_nominatim = True
        dest_coords = dest_cache[dest]
        if not dest_coords:
            results.append({'origin': origin, 'dest': dest, 'miles': None, 'error': f'Could not geocode: {dest}'})
            continue

        # Get distance (also cached)
        miles = get_distance(origin_coords, dest_coords)
        if miles:
            results.append({'origin': origin, 'dest': dest, 'miles': miles})
        else:
            results.append({'origin': origin, 'dest': dest, 'miles': None, 'error': 'Route not found'})

    return jsonify({'results': results})

# Geocode endpoint (for debugging)
@app.route('/api/geocode', methods=['POST'])
def geocode():
    data = request.json
    location = data.get('location', '')
    
    if not location:
        return jsonify({'error': 'Missing location'}), 400
    
    coords = geocode_location(location)
    if coords:
        return jsonify(coords)
    return jsonify({'error': 'Location not found'}), 404

# ==================== CRM API ENDPOINTS ====================

# List prospects
@app.route('/api/crm/prospects', methods=['GET'])
def list_prospects():
    try:
        conn = get_crm_db()
        status = request.args.get('status')
        trader = request.args.get('trader')
        search = request.args.get('search')

        query = 'SELECT * FROM prospects WHERE 1=1'
        params = []

        if status:
            query += ' AND status = ?'
            params.append(status)
        if trader:
            query += ' AND trader = ?'
            params.append(trader)
        if search:
            query += ' AND (company_name LIKE ? OR contact_name LIKE ? OR phone LIKE ?)'
            params.extend([f'%{search}%'] * 3)

        query += ' ORDER BY updated_at DESC'
        prospects = conn.execute(query, params).fetchall()
        conn.close()
        return jsonify([dict(p) for p in prospects])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Get prospect with touches
@app.route('/api/crm/prospects/<int:id>', methods=['GET'])
def get_prospect(id):
    try:
        conn = get_crm_db()
        prospect = conn.execute('SELECT * FROM prospects WHERE id = ?', (id,)).fetchone()
        if not prospect:
            conn.close()
            return jsonify({'error': 'Prospect not found'}), 404

        touches = conn.execute(
            'SELECT * FROM contact_touches WHERE prospect_id = ? ORDER BY created_at DESC',
            (id,)
        ).fetchall()

        interests = conn.execute(
            'SELECT * FROM prospect_product_interest WHERE prospect_id = ?',
            (id,)
        ).fetchall()

        conn.close()
        result = dict(prospect)
        result['touches'] = [dict(t) for t in touches]
        result['interests'] = [dict(i) for i in interests]
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Create prospect
@app.route('/api/crm/prospects', methods=['POST'])
def create_prospect():
    try:
        data = request.json
        conn = get_crm_db()
        cursor = conn.execute('''
            INSERT INTO prospects (company_name, contact_name, phone, email, address, notes, status, source, trader)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            normalize_customer_name(data.get('company_name')),
            data.get('contact_name'),
            data.get('phone'),
            data.get('email'),
            data.get('address'),
            data.get('notes'),
            data.get('status', 'prospect'),
            data.get('source'),
            data.get('trader')
        ))
        prospect_id = cursor.lastrowid
        conn.commit()

        prospect = conn.execute('SELECT * FROM prospects WHERE id = ?', (prospect_id,)).fetchone()
        conn.close()
        return jsonify(dict(prospect)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Update prospect
@app.route('/api/crm/prospects/<int:id>', methods=['PUT'])
def update_prospect(id):
    try:
        data = request.json
        conn = get_crm_db()
        # Only update fields that are present in the request (partial update support)
        allowed = ['company_name', 'contact_name', 'phone', 'email', 'address', 'notes', 'status', 'source', 'trader']
        fields = [f for f in allowed if f in data]
        if not fields:
            return jsonify({'error': 'No fields to update'}), 400
        set_clause = ', '.join(f'{f} = ?' for f in fields) + ', updated_at = CURRENT_TIMESTAMP'
        values = [data[f] for f in fields] + [id]
        conn.execute(f'UPDATE prospects SET {set_clause} WHERE id = ?', values)
        conn.commit()

        prospect = conn.execute('SELECT * FROM prospects WHERE id = ?', (id,)).fetchone()
        conn.close()
        if not prospect:
            return jsonify({'error': 'Prospect not found'}), 404
        return jsonify(dict(prospect))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Delete prospect
@app.route('/api/crm/prospects/<int:id>', methods=['DELETE'])
def delete_prospect(id):
    try:
        conn = get_crm_db()
        conn.execute('DELETE FROM prospects WHERE id = ?', (id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Prospect deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Create touch
@app.route('/api/crm/touches', methods=['POST'])
def create_touch():
    try:
        data = request.json
        conn = get_crm_db()
        products = json.dumps(data.get('products_discussed')) if data.get('products_discussed') else None

        cursor = conn.execute('''
            INSERT INTO contact_touches (prospect_id, touch_type, notes, products_discussed, follow_up_date)
            VALUES (?, ?, ?, ?, ?)
        ''', (
            data.get('prospect_id'),
            data.get('touch_type'),
            data.get('notes'),
            products,
            data.get('follow_up_date')
        ))
        touch_id = cursor.lastrowid

        # Update prospect's updated_at
        conn.execute('UPDATE prospects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    (data.get('prospect_id'),))
        conn.commit()

        touch = conn.execute('SELECT * FROM contact_touches WHERE id = ?', (touch_id,)).fetchone()
        conn.close()
        return jsonify(dict(touch)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# List touches (with follow-up filter)
@app.route('/api/crm/touches', methods=['GET'])
def list_touches():
    try:
        conn = get_crm_db()
        prospect_id = request.args.get('prospect_id')
        follow_up = request.args.get('follow_up')

        query = '''
            SELECT t.*, p.company_name, p.contact_name
            FROM contact_touches t
            JOIN prospects p ON t.prospect_id = p.id
            WHERE 1=1
        '''
        params = []

        if prospect_id:
            query += ' AND t.prospect_id = ?'
            params.append(prospect_id)
        if follow_up == 'today':
            query += ' AND t.follow_up_date = DATE("now")'
        elif follow_up == 'overdue':
            query += ' AND t.follow_up_date < DATE("now") AND t.follow_up_date IS NOT NULL'
        elif follow_up == 'upcoming':
            query += ' AND t.follow_up_date >= DATE("now")'

        query += ' ORDER BY t.created_at DESC LIMIT 100'
        touches = conn.execute(query, params).fetchall()
        conn.close()
        return jsonify([dict(t) for t in touches])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Add product interest
@app.route('/api/crm/prospects/<int:id>/interests', methods=['POST'])
def add_interest(id):
    try:
        data = request.json
        conn = get_crm_db()

        # Check if interest already exists
        existing = conn.execute(
            'SELECT id FROM prospect_product_interest WHERE prospect_id = ? AND product = ?',
            (id, data.get('product'))
        ).fetchone()

        if existing:
            conn.execute('''
                UPDATE prospect_product_interest SET interest_level = ?, volume_estimate = ?, notes = ?
                WHERE prospect_id = ? AND product = ?
            ''', (data.get('interest_level'), data.get('volume_estimate'), data.get('notes'), id, data.get('product')))
        else:
            conn.execute('''
                INSERT INTO prospect_product_interest (prospect_id, product, interest_level, volume_estimate, notes)
                VALUES (?, ?, ?, ?, ?)
            ''', (id, data.get('product'), data.get('interest_level'), data.get('volume_estimate'), data.get('notes')))

        conn.commit()
        interests = conn.execute('SELECT * FROM prospect_product_interest WHERE prospect_id = ?', (id,)).fetchall()
        conn.close()
        return jsonify([dict(i) for i in interests])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Remove product interest
@app.route('/api/crm/interests/<int:id>', methods=['DELETE'])
def remove_interest(id):
    try:
        conn = get_crm_db()
        conn.execute('DELETE FROM prospect_product_interest WHERE id = ?', (id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Interest removed'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# CRM Dashboard stats with stale prospect tracking
@app.route('/api/crm/dashboard', methods=['GET'])
def crm_dashboard():
    try:
        conn = get_crm_db()
        trader = request.args.get('trader')

        trader_filter = ' AND trader = ?' if trader and trader != 'Admin' else ''
        params = [trader] if trader and trader != 'Admin' else []

        today = datetime.now().strftime('%Y-%m-%d')

        stats = {
            'total_prospects': conn.execute(f'SELECT COUNT(*) FROM prospects WHERE 1=1{trader_filter}', params).fetchone()[0],
            'new_prospects': conn.execute(f"SELECT COUNT(*) FROM prospects WHERE status='prospect'{trader_filter}", params).fetchone()[0],
            'qualified': conn.execute(f"SELECT COUNT(*) FROM prospects WHERE status='qualified'{trader_filter}", params).fetchone()[0],
            'converted': conn.execute(f"SELECT COUNT(*) FROM prospects WHERE status='converted'{trader_filter}", params).fetchone()[0],
            'touches_today': conn.execute(f'''
                SELECT COUNT(*) FROM contact_touches t
                JOIN prospects p ON t.prospect_id = p.id
                WHERE DATE(t.created_at) = DATE('now'){trader_filter.replace('trader', 'p.trader')}
            ''', params).fetchone()[0],
        }

        follow_ups_today = conn.execute(f'''
            SELECT t.*, p.company_name, p.contact_name FROM contact_touches t
            JOIN prospects p ON t.prospect_id = p.id
            WHERE t.follow_up_date = ?{trader_filter.replace('trader', 'p.trader')}
            ORDER BY t.created_at DESC
        ''', [today] + params).fetchall()

        overdue = conn.execute(f'''
            SELECT t.*, p.company_name, p.contact_name FROM contact_touches t
            JOIN prospects p ON t.prospect_id = p.id
            WHERE t.follow_up_date < ? AND t.follow_up_date IS NOT NULL{trader_filter.replace('trader', 'p.trader')}
            ORDER BY t.follow_up_date ASC LIMIT 10
        ''', [today] + params).fetchall()

        recent = conn.execute(f'''
            SELECT t.*, p.company_name, p.contact_name FROM contact_touches t
            JOIN prospects p ON t.prospect_id = p.id
            WHERE 1=1{trader_filter.replace('trader', 'p.trader')}
            ORDER BY t.created_at DESC LIMIT 10
        ''', params).fetchall()

        # Stale prospects - no touch in X days (configurable thresholds)
        # Critical: 14+ days, Warning: 7-13 days, for active prospects only
        stale_critical = conn.execute(f'''
            SELECT p.*,
                   MAX(t.created_at) as last_touch,
                   CAST(julianday('now') - julianday(COALESCE(MAX(t.created_at), p.created_at)) AS INTEGER) as days_since_touch
            FROM prospects p
            LEFT JOIN contact_touches t ON p.id = t.prospect_id
            WHERE p.status IN ('prospect', 'qualified'){trader_filter.replace('trader', 'p.trader')}
            GROUP BY p.id
            HAVING days_since_touch >= 14
            ORDER BY days_since_touch DESC
            LIMIT 10
        ''', params).fetchall()

        stale_warning = conn.execute(f'''
            SELECT p.*,
                   MAX(t.created_at) as last_touch,
                   CAST(julianday('now') - julianday(COALESCE(MAX(t.created_at), p.created_at)) AS INTEGER) as days_since_touch
            FROM prospects p
            LEFT JOIN contact_touches t ON p.id = t.prospect_id
            WHERE p.status IN ('prospect', 'qualified'){trader_filter.replace('trader', 'p.trader')}
            GROUP BY p.id
            HAVING days_since_touch >= 7 AND days_since_touch < 14
            ORDER BY days_since_touch DESC
            LIMIT 10
        ''', params).fetchall()

        # Never contacted - prospects with zero touches
        never_contacted = conn.execute(f'''
            SELECT p.*,
                   CAST(julianday('now') - julianday(p.created_at) AS INTEGER) as days_since_created
            FROM prospects p
            LEFT JOIN contact_touches t ON p.id = t.prospect_id
            WHERE p.status IN ('prospect', 'qualified'){trader_filter.replace('trader', 'p.trader')}
            GROUP BY p.id
            HAVING COUNT(t.id) = 0
            ORDER BY p.created_at ASC
            LIMIT 10
        ''', params).fetchall()

        # Add stale counts to stats
        stats['stale_critical'] = len(stale_critical)
        stats['stale_warning'] = len(stale_warning)
        stats['never_contacted'] = len(never_contacted)

        conn.close()
        return jsonify({
            'stats': stats,
            'follow_ups_today': [dict(f) for f in follow_ups_today],
            'overdue': [dict(o) for o in overdue],
            'recent_touches': [dict(r) for r in recent],
            'stale_critical': [dict(s) for s in stale_critical],
            'stale_warning': [dict(s) for s in stale_warning],
            'never_contacted': [dict(n) for n in never_contacted]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Seed mock data for testing
@app.route('/api/crm/seed-mock', methods=['POST'])
def seed_mock_data():
    try:
        conn = get_crm_db()

        # Clear existing data
        conn.execute('DELETE FROM contact_touches')
        conn.execute('DELETE FROM prospect_product_interest')
        conn.execute('DELETE FROM prospects')

        # Mock prospects with various states
        mock_prospects = [
            # Active prospects needing attention
            ('ABC Lumber Supply', 'John Smith', '555-0101', 'john@abclumber.com', 'Atlanta, GA', 'Large regional distributor', 'prospect', 'Trade show', 'Ian'),
            ('Southeast Building Materials', 'Sarah Johnson', '555-0102', 'sarah@sebm.com', 'Charlotte, NC', 'Interested in bulk orders', 'qualified', 'Referral', 'Ian'),
            ('Delta Construction Co', 'Mike Brown', '555-0103', 'mike@deltacon.com', 'Birmingham, AL', 'New construction focus', 'prospect', 'Cold call', 'Ian'),
            ('Gulf Coast Builders', 'Lisa Davis', '555-0104', 'lisa@gulfcoast.com', 'Mobile, AL', 'Coastal projects', 'qualified', 'Website', 'Ian'),
            ('Tennessee Timber', 'Bob Wilson', '555-0105', 'bob@tntimber.com', 'Nashville, TN', 'Regular buyer potential', 'prospect', 'Trade show', 'Ian'),

            # Stale prospects (will backdate)
            ('Midwest Framing Inc', 'Tom Harris', '555-0106', 'tom@midwestframe.com', 'Memphis, TN', 'High volume potential', 'prospect', 'Referral', 'Ian'),
            ('Southern Pine Distributors', 'Amy Clark', '555-0107', 'amy@southpine.com', 'Jackson, MS', 'Regional focus', 'qualified', 'Cold call', 'Ian'),
            ('Coastal Lumber Yard', 'Dan Miller', '555-0108', 'dan@coastallumber.com', 'Pensacola, FL', 'Retail and wholesale', 'prospect', 'Website', 'Ian'),

            # Never contacted
            ('Texas Wood Works', 'Chris Lee', '555-0109', 'chris@txwood.com', 'Houston, TX', 'Just added, needs first contact', 'prospect', 'Trade show', 'Ian'),
            ('Arkansas Building Supply', 'Pat Moore', '555-0110', 'pat@arkbs.com', 'Little Rock, AR', 'Warm lead from partner', 'prospect', 'Referral', 'Ian'),

            # Converted (success stories)
            ('Premium Lumber Co', 'Steve Taylor', '555-0111', 'steve@premiumlumber.com', 'Dallas, TX', 'Now a regular customer!', 'converted', 'Trade show', 'Ian'),
            ('Quality Builders Supply', 'Nancy White', '555-0112', 'nancy@qbs.com', 'New Orleans, LA', 'Converted after 3 months', 'converted', 'Referral', 'Ian'),
        ]

        prospect_ids = []
        for p in mock_prospects:
            cursor = conn.execute('''
                INSERT INTO prospects (company_name, contact_name, phone, email, address, notes, status, source, trader)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', p)
            prospect_ids.append(cursor.lastrowid)

        # Backdate some prospects to simulate stale ones
        # Prospects 6-8 (index 5-7) - make them stale (created 20 days ago)
        for i in range(5, 8):
            conn.execute('''
                UPDATE prospects SET created_at = datetime('now', '-20 days'), updated_at = datetime('now', '-20 days')
                WHERE id = ?
            ''', (prospect_ids[i],))

        # Never contacted prospects (9-10, index 8-9) - created 5 days ago, no touches
        for i in range(8, 10):
            conn.execute('''
                UPDATE prospects SET created_at = datetime('now', '-5 days'), updated_at = datetime('now', '-5 days')
                WHERE id = ?
            ''', (prospect_ids[i],))

        # Add touches for active prospects
        touches = [
            # Recent touches for prospects 1-5
            (prospect_ids[0], 'call', 'Discussed 2x4 pricing, very interested. Wants quote for 50 MBF.', '["2x4#2","2x6#2"]', 2),
            (prospect_ids[0], 'email', 'Sent pricing sheet and availability.', None, 1),
            (prospect_ids[1], 'meeting', 'Met at their office. Toured facility. Ready to place first order.', '["2x4#2","2x6#2","2x8#2"]', 0),
            (prospect_ids[1], 'call', 'Initial discovery call. Large operation, 200+ MBF/month potential.', None, 7),
            (prospect_ids[2], 'call', 'Left voicemail, will try again.', None, 3),
            (prospect_ids[3], 'email', 'Responded to inquiry. Scheduling call for next week.', '["2x4#2"]', 1),
            (prospect_ids[4], 'call', 'Good conversation. Needs time to review current supplier contract.', '["2x6#2","2x8#2"]', 5),

            # Old touches for stale prospects (these were 15-20 days ago)
            (prospect_ids[5], 'call', 'Initial call went well. Said to follow up in a week.', '["2x4#2"]', 18),
            (prospect_ids[6], 'email', 'Sent intro email with company info.', None, 15),
            (prospect_ids[7], 'call', 'Spoke briefly, was busy. Call back later.', None, 20),

            # Touches for converted prospects
            (prospect_ids[10], 'call', 'Closed the deal! First order: 100 MBF 2x4#2', '["2x4#2","2x6#2"]', 30),
            (prospect_ids[11], 'meeting', 'Signed contract. Great partnership ahead!', '["2x4#2","2x6#2","2x8#2"]', 45),
        ]

        for t in touches:
            days_ago = t[4]
            conn.execute(f'''
                INSERT INTO contact_touches (prospect_id, touch_type, notes, products_discussed, created_at)
                VALUES (?, ?, ?, ?, datetime('now', '-{days_ago} days'))
            ''', (t[0], t[1], t[2], t[3]))

        # Add follow-up dates
        # Overdue follow-ups
        conn.execute('''
            UPDATE contact_touches SET follow_up_date = date('now', '-3 days')
            WHERE prospect_id = ? AND touch_type = 'call'
        ''', (prospect_ids[5],))

        conn.execute('''
            UPDATE contact_touches SET follow_up_date = date('now', '-5 days')
            WHERE prospect_id = ? AND touch_type = 'email'
        ''', (prospect_ids[6],))

        # Today's follow-ups
        conn.execute('''
            UPDATE contact_touches SET follow_up_date = date('now')
            WHERE prospect_id = ? AND touch_type = 'email'
        ''', (prospect_ids[3],))

        # Future follow-ups
        conn.execute('''
            UPDATE contact_touches SET follow_up_date = date('now', '+3 days')
            WHERE prospect_id = ? AND touch_type = 'call'
        ''', (prospect_ids[4],))

        conn.commit()
        conn.close()

        return jsonify({
            'message': 'Mock data seeded successfully',
            'prospects_created': len(mock_prospects),
            'touches_created': len(touches)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Convert prospect to customer (update status)
@app.route('/api/crm/prospects/<int:id>/convert', methods=['POST'])
def convert_prospect(id):
    try:
        conn = get_crm_db()
        prospect = conn.execute('SELECT * FROM prospects WHERE id = ?', (id,)).fetchone()
        if not prospect:
            conn.close()
            return jsonify({'error': 'Prospect not found'}), 404
        conn.execute('''
            UPDATE prospects SET status = 'converted', updated_at = CURRENT_TIMESTAMP WHERE id = ?
        ''', (id,))
        conn.commit()
        prospect = conn.execute('SELECT * FROM prospects WHERE id = ?', (id,)).fetchone()
        conn.close()
        return jsonify(dict(prospect))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Wipe ALL CRM data (prospects, customers, mills)
@app.route('/api/crm/wipe-all', methods=['POST'])
def wipe_all_crm():
    try:
        conn = get_crm_db()
        conn.execute('DELETE FROM contact_touches')
        conn.execute('DELETE FROM prospect_product_interest')
        conn.execute('DELETE FROM prospects')
        conn.execute('DELETE FROM customers')
        conn.execute('DELETE FROM mills')
        conn.commit()
        conn.close()
        return jsonify({'message': 'All CRM data wiped (prospects, customers, mills)', 'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Cleanup endpoint - wipe all CRM data except Ian's
@app.route('/api/crm/cleanup-non-ian', methods=['POST'])
def cleanup_non_ian():
    try:
        conn = get_crm_db()

        # Delete touches for non-Ian prospects first
        conn.execute('''
            DELETE FROM contact_touches
            WHERE prospect_id IN (SELECT id FROM prospects WHERE trader != 'Ian' OR trader IS NULL)
        ''')

        # Delete interests for non-Ian prospects
        conn.execute('''
            DELETE FROM prospect_product_interest
            WHERE prospect_id IN (SELECT id FROM prospects WHERE trader != 'Ian' OR trader IS NULL)
        ''')

        # Delete non-Ian prospects
        result = conn.execute("DELETE FROM prospects WHERE trader != 'Ian' OR trader IS NULL")
        deleted = result.rowcount

        # Get remaining count
        remaining = conn.execute("SELECT COUNT(*) FROM prospects WHERE trader = 'Ian'").fetchone()[0]

        conn.commit()
        conn.close()

        return jsonify({
            'message': f'Deleted {deleted} non-Ian prospects. {remaining} Ian prospects remain.',
            'deleted': deleted,
            'remaining': remaining
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== CUSTOMERS API ====================

@app.route('/api/crm/customers', methods=['GET'])
def list_customers():
    try:
        conn = get_crm_db()
        trader = request.args.get('trader')
        query = 'SELECT * FROM customers WHERE 1=1'
        params = []
        if trader and trader != 'Admin':
            query += ' AND trader = ?'
            params.append(trader)
        query += ' ORDER BY name ASC'
        customers = conn.execute(query, params).fetchall()
        conn.close()
        return jsonify([dict(c) for c in customers])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/crm/customers', methods=['POST'])
def create_customer():
    try:
        data = request.get_json()
        conn = get_crm_db()
        cursor = conn.execute('''
            INSERT INTO customers (name, contact, phone, email, destination, locations, notes, trader)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            normalize_customer_name(data.get('name')),
            data.get('contact'),
            data.get('phone'),
            data.get('email'),
            data.get('destination'),
            json.dumps(data.get('locations')) if data.get('locations') else None,
            data.get('notes'),
            data.get('trader')
        ))
        conn.commit()
        customer = conn.execute('SELECT * FROM customers WHERE id = ?', (cursor.lastrowid,)).fetchone()
        conn.close()
        return jsonify(dict(customer)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/crm/customers/<int:id>', methods=['PUT'])
def update_customer(id):
    try:
        data = request.get_json()
        conn = get_crm_db()
        # Only update fields that are present in the request (partial update support)
        allowed = ['name', 'contact', 'phone', 'email', 'destination', 'locations', 'notes', 'trader']
        fields = [f for f in allowed if f in data]
        if not fields:
            return jsonify({'error': 'No fields to update'}), 400
        set_parts = []
        values = []
        for f in fields:
            set_parts.append(f'{f} = ?')
            if f == 'locations':
                values.append(json.dumps(data[f]) if data[f] else None)
            else:
                values.append(data[f])
        set_clause = ', '.join(set_parts) + ', updated_at = CURRENT_TIMESTAMP'
        values.append(id)
        conn.execute(f'UPDATE customers SET {set_clause} WHERE id = ?', values)
        conn.commit()
        customer = conn.execute('SELECT * FROM customers WHERE id = ?', (id,)).fetchone()
        conn.close()
        if not customer:
            return jsonify({'error': 'Customer not found'}), 404
        return jsonify(dict(customer))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/crm/customers/<int:id>', methods=['DELETE'])
def delete_customer(id):
    try:
        conn = get_crm_db()
        conn.execute('DELETE FROM customers WHERE id = ?', (id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Customer deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== MILLS API ====================

@app.route('/api/crm/mills', methods=['GET'])
def list_mills():
    try:
        conn = get_crm_db()
        trader = request.args.get('trader')
        query = 'SELECT * FROM mills WHERE 1=1'
        params = []
        if trader and trader != 'Admin':
            query += ' AND trader = ?'
            params.append(trader)
        query += ' ORDER BY name ASC'
        mills = conn.execute(query, params).fetchall()
        conn.close()
        # Enrich with last_quoted date from MI quotes
        mill_list = [dict(m) for m in mills]
        try:
            mi_conn = get_mi_db()
            last_dates = mi_conn.execute(
                "SELECT mill_id, MAX(date) as last_date, COUNT(*) as quote_count FROM mill_quotes GROUP BY mill_id"
            ).fetchall()
            mi_conn.close()
            date_map = {r['mill_id']: {'last_quoted': r['last_date'], 'quote_count': r['quote_count']} for r in last_dates}
            for m in mill_list:
                info = date_map.get(m['id'], {})
                m['last_quoted'] = info.get('last_quoted')
                m['quote_count'] = info.get('quote_count', 0)
        except Exception:
            pass  # MI db may not exist yet
        return jsonify(mill_list)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/crm/mills', methods=['POST'])
def create_mill():
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        # Use extract_company_name to canonicalize
        company = extract_company_name(name) if name else name
        conn = get_crm_db()
        # Check if company already exists
        existing = conn.execute("SELECT * FROM mills WHERE UPPER(name)=?", (company.upper(),)).fetchone()
        if existing:
            conn.close()
            return jsonify(dict(existing)), 200  # Already exists
        cursor = conn.execute('''
            INSERT INTO mills (name, contact, phone, email, location, city, state, region, locations, products, notes, trader)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            company,
            data.get('contact'),
            data.get('phone'),
            data.get('email'),
            data.get('location'),
            data.get('city', ''),
            data.get('state', ''),
            data.get('region', 'central'),
            json.dumps(data.get('locations')) if isinstance(data.get('locations'), list) else data.get('locations', '[]'),
            json.dumps(data.get('products')) if isinstance(data.get('products'), list) else data.get('products', '[]'),
            data.get('notes', ''),
            data.get('trader') or ''
        ))
        conn.commit()
        mill = conn.execute('SELECT * FROM mills WHERE id = ?', (cursor.lastrowid,)).fetchone()
        conn.close()
        # Sync to MI
        if mill:
            sync_mill_to_mi(dict(mill))
        return jsonify(dict(mill)), 201
    except Exception as e:
        print(f"[create_mill ERROR] {e} | data={request.get_json()}", flush=True)
        return jsonify({'error': str(e)}), 500

@app.route('/api/crm/mills/<int:id>', methods=['PUT'])
def update_mill(id):
    try:
        data = request.get_json()
        conn = get_crm_db()
        # Only update fields that are present in the request (partial update support)
        allowed = ['name', 'contact', 'phone', 'email', 'location', 'locations', 'city', 'state', 'region', 'products', 'notes', 'trader']
        fields = [f for f in allowed if f in data]
        if not fields:
            return jsonify({'error': 'No fields to update'}), 400
        set_parts = []
        values = []
        for f in fields:
            set_parts.append(f'{f} = ?')
            if f in ('products', 'locations'):
                values.append(json.dumps(data[f]) if isinstance(data[f], list) else data.get(f, '[]'))
            else:
                values.append(data[f])
        set_clause = ', '.join(set_parts) + ', updated_at = CURRENT_TIMESTAMP'
        values.append(id)
        # Get old name before update (for syncing mill_quotes)
        old_row = conn.execute('SELECT name FROM mills WHERE id = ?', (id,)).fetchone()
        old_name = old_row['name'] if old_row else None

        conn.execute(f'UPDATE mills SET {set_clause} WHERE id = ?', values)
        conn.commit()
        mill = conn.execute('SELECT * FROM mills WHERE id = ?', (id,)).fetchone()
        conn.close()
        if not mill:
            return jsonify({'error': 'Mill not found'}), 404

        # Sync to Mill Intel database
        mill_dict = dict(mill)
        sync_mill_to_mi(mill_dict)

        # If name changed, update mill_quotes.mill_name in MI database
        new_name = mill_dict.get('name', '')
        if old_name and new_name and old_name != new_name:
            mi_conn = get_mi_db()
            mi_conn.execute('UPDATE mill_quotes SET mill_name = ? WHERE mill_id = ?', (new_name, id))
            mi_conn.commit()
            mi_conn.close()

        return jsonify(mill_dict)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/crm/mills/<int:id>', methods=['DELETE'])
def delete_mill(id):
    try:
        conn = get_crm_db()
        conn.execute('DELETE FROM mills WHERE id = ?', (id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Mill deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== END CRM API ====================

# ==================== FUTURES DATA PROXY ====================

# CME SYP futures months: F=Jan, H=Mar, K=May, N=Jul, U=Sep, X=Nov
SYP_MONTHS = [
    {'code': 'F', 'label': 'Jan', 'yahoo_code': 'F'},
    {'code': 'H', 'label': 'Mar', 'yahoo_code': 'H'},
    {'code': 'K', 'label': 'May', 'yahoo_code': 'K'},
    {'code': 'N', 'label': 'Jul', 'yahoo_code': 'N'},
    {'code': 'U', 'label': 'Sep', 'yahoo_code': 'U'},
    {'code': 'X', 'label': 'Nov', 'yahoo_code': 'X'},
]

futures_cache = {'data': None, 'timestamp': 0}
FUTURES_CACHE_TTL = 300  # 5 minutes

@app.route('/api/futures/quotes')
def futures_quotes():
    """Fetch delayed SYP futures quotes from Yahoo Finance"""
    now = time.time()
    if futures_cache['data'] and (now - futures_cache['timestamp']) < FUTURES_CACHE_TTL:
        return jsonify(futures_cache['data'])

    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    results = {'contracts': [], 'front': None, 'fetched_at': datetime.now().isoformat()}

    # Determine current and next year for contract symbols
    current_year = datetime.now().year
    years = [current_year % 100, (current_year + 1) % 100]

    # Fetch front-month quote
    try:
        r = requests.get(
            'https://query1.finance.yahoo.com/v8/finance/chart/SYP=F?interval=1d&range=max',
            headers=headers, timeout=10
        )
        if r.status_code == 200:
            data = r.json()
            if data.get('chart', {}).get('result'):
                meta = data['chart']['result'][0]['meta']
                results['front'] = {
                    'price': meta.get('regularMarketPrice'),
                    'previousClose': meta.get('previousClose'),
                    'name': meta.get('shortName', 'SYP Front')
                }
                ts_list = data['chart']['result'][0].get('timestamp', [])
                quote = data['chart']['result'][0].get('indicators', {}).get('quote', [{}])[0]
                closes = quote.get('close', [])
                opens = quote.get('open', [])
                highs = quote.get('high', [])
                lows = quote.get('low', [])
                volumes = quote.get('volume', [])
                results['front']['history'] = [
                    {'timestamp': ts_list[i], 'close': closes[i],
                     'open': opens[i] if i < len(opens) else None,
                     'high': highs[i] if i < len(highs) else None,
                     'low': lows[i] if i < len(lows) else None,
                     'volume': volumes[i] if i < len(volumes) else None}
                    for i in range(len(ts_list)) if i < len(closes) and closes[i] is not None
                ]
    except Exception as e:
        print(f"Front month fetch error: {e}")

    # Fetch individual contract months
    for month in SYP_MONTHS:
        for yr in years:
            symbol = f"SYP{month['yahoo_code']}{yr}.CME"
            try:
                r = requests.get(
                    f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=max',
                    headers=headers, timeout=8
                )
                if r.status_code == 200:
                    data = r.json()
                    if data.get('chart', {}).get('result'):
                        meta = data['chart']['result'][0]['meta']
                        price = meta.get('regularMarketPrice')
                        if price and price > 0:
                            ts_list = data['chart']['result'][0].get('timestamp', [])
                            cquote = data['chart']['result'][0].get('indicators', {}).get('quote', [{}])[0]
                            closes = cquote.get('close', [])
                            opens = cquote.get('open', [])
                            highs = cquote.get('high', [])
                            lows = cquote.get('low', [])
                            volumes = cquote.get('volume', [])
                            history = [
                                {'timestamp': ts_list[i], 'close': closes[i],
                                 'open': opens[i] if i < len(opens) else None,
                                 'high': highs[i] if i < len(highs) else None,
                                 'low': lows[i] if i < len(lows) else None,
                                 'volume': volumes[i] if i < len(volumes) else None}
                                for i in range(len(ts_list)) if i < len(closes) and closes[i] is not None
                            ]
                            results['contracts'].append({
                                'symbol': symbol,
                                'month': month['label'],
                                'code': month['code'],
                                'year': 2000 + yr,
                                'price': price,
                                'previousClose': meta.get('previousClose'),
                                'history': history
                            })
            except Exception as e:
                print(f"Contract fetch error {symbol}: {e}")
            time.sleep(0.2)  # Rate limit

    # Sort contracts by year then month order
    month_order = {'F': 0, 'H': 1, 'K': 2, 'N': 3, 'U': 4, 'X': 5}
    results['contracts'].sort(key=lambda c: (c['year'], month_order.get(c['code'], 99)))

    futures_cache['data'] = results
    futures_cache['timestamp'] = now
    return jsonify(results)

# Excel file parser for mill pricing intake
@app.route('/api/parse-excel', methods=['GET', 'POST'])
def parse_excel():
    try:
        import openpyxl
    except ImportError:
        return jsonify({'error': 'openpyxl not installed. Run: pip install openpyxl'}), 500

    if request.method == 'GET':
        return jsonify({'error': 'POST a .xlsx file as multipart form data'}), 400

    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'Empty filename'}), 400

    try:
        wb = openpyxl.load_workbook(file, data_only=True)
        all_rows = []
        sheet_count = len(wb.sheetnames)
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            sheet_rows = []
            for row in ws.iter_rows(values_only=True):
                row_data = [str(cell) if cell is not None else '' for cell in row]
                # Skip completely empty rows
                if any(c.strip() for c in row_data):
                    sheet_rows.append(row_data)
            if sheet_rows:
                # Add sheet marker so AI can distinguish locations/tabs
                if sheet_count > 1:
                    all_rows.append([f'=== SHEET: {sheet_name} ==='])
                all_rows.extend(sheet_rows)
        wb.close()
        return jsonify({'rows': all_rows, 'count': len(all_rows), 'sheet_count': sheet_count})
    except Exception as e:
        return jsonify({'error': f'Failed to parse Excel: {str(e)}'}), 400

# PDF file parser for mill pricing intake
@app.route('/api/parse-pdf', methods=['GET', 'POST'])
def parse_pdf():
    try:
        import pdfplumber
    except ImportError:
        return jsonify({'error': 'pdfplumber not installed. Run: pip install pdfplumber'}), 500

    if request.method == 'GET':
        return jsonify({'error': 'POST a .pdf file as multipart form data'}), 400

    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'Empty filename'}), 400

    tmp_path = None
    try:
        import tempfile
        # Save to temp file since pdfplumber needs a file path
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
            tmp_path = tmp.name
            file.save(tmp_path)

        pages_text = []
        tables = []
        with pdfplumber.open(tmp_path) as pdf:
            for i, page in enumerate(pdf.pages):
                # Extract text
                text = page.extract_text() or ''
                if text.strip():
                    pages_text.append(text)

                # Extract tables (pdfplumber is excellent at this)
                page_tables = page.extract_tables()
                for table in page_tables:
                    # Convert to list of lists of strings
                    cleaned = []
                    for row in table:
                        cleaned.append([str(cell).strip() if cell else '' for cell in row])
                    if cleaned:
                        tables.append({'page': i + 1, 'rows': cleaned})

        # If no text/tables found, it's likely a scanned PDF — convert pages to images
        page_images = []
        if not pages_text and not tables:
            import io, base64
            with pdfplumber.open(tmp_path) as pdf:
                for i, page in enumerate(pdf.pages):
                    try:
                        img = page.to_image(resolution=200)
                        buf = io.BytesIO()
                        img.original.save(buf, format='PNG')
                        b64 = base64.b64encode(buf.getvalue()).decode()
                        page_images.append({'page': i + 1, 'data': b64, 'media_type': 'image/png'})
                    except Exception:
                        pass

        # Clean up temp file
        os.unlink(tmp_path)

        return jsonify({
            'text': '\n\n'.join(pages_text),
            'tables': tables,
            'pages': len(pages_text),
            'table_count': len(tables),
            'images': page_images
        })
    except Exception as e:
        # Clean up temp file on error
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except:
                pass
        return jsonify({'error': f'Failed to parse PDF: {str(e)}'}), 400

# Health check for Railway
@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'cache_size': len(geo_cache)})

# ==========================================
# PRICING MATRIX — standalone read-only view
# ==========================================

PRICING_PASSWORD = os.environ.get('PRICING_PASSWORD', '2026')

@app.route('/pricing')
def pricing_page():
    return send_from_directory('.', 'pricing.html')

@app.route('/api/pricing/auth', methods=['POST'])
def pricing_auth():
    data = request.json or {}
    if data.get('password') == PRICING_PASSWORD:
        return jsonify({'ok': True})
    return jsonify({'ok': False, 'error': 'Invalid password'}), 401

@app.route('/api/pricing/customers', methods=['GET'])
def pricing_customers():
    """Merged customer list for portal quote builder (CRM + MI, deduplicated)."""
    seen = {}
    # CRM customers (have destination field)
    try:
        conn = get_crm_db()
        rows = conn.execute("SELECT name, destination, locations FROM customers ORDER BY name").fetchall()
        conn.close()
        for r in rows:
            name = r['name']
            dest = r['destination'] or ''
            if not dest and r['locations']:
                try:
                    locs = json.loads(r['locations']) if isinstance(r['locations'], str) else r['locations']
                    if locs and isinstance(locs, list) and len(locs) > 0:
                        loc = locs[0]
                        if isinstance(loc, dict):
                            dest = (loc.get('city', '') + ', ' + loc.get('state', '')).strip(', ')
                        elif isinstance(loc, str):
                            dest = loc
                except: pass
            key = name.lower().strip()
            if key not in seen:
                seen[key] = {'name': name, 'destination': dest}
    except: pass
    # MI customers
    try:
        conn = get_mi_db()
        rows = conn.execute("SELECT name, destination FROM customers ORDER BY name").fetchall()
        conn.close()
        for r in rows:
            key = r['name'].lower().strip()
            if key not in seen:
                seen[key] = {'name': r['name'], 'destination': r['destination'] or ''}
    except: pass
    return jsonify(sorted(seen.values(), key=lambda x: x['name'].lower()))

# Server-side matrix cutoff (shared between in-app and portal)
_matrix_cutoff = {'since': ''}

@app.route('/api/pricing/cutoff', methods=['GET'])
def get_matrix_cutoff():
    return jsonify({'since': _matrix_cutoff['since']})

@app.route('/api/pricing/cutoff', methods=['POST'])
def set_matrix_cutoff():
    data = request.json or {}
    _matrix_cutoff['since'] = data.get('since', '')
    return jsonify({'since': _matrix_cutoff['since']})

# ==========================================
# MILL INTEL ROUTES — /api/mi/*
# ==========================================

# ----- MI: MILLS -----

@app.route('/api/mi/mills', methods=['GET'])
def mi_list_mills():
    """List all mills from CRM (single source of truth)."""
    conn = get_crm_db()
    rows = conn.execute("SELECT * FROM mills ORDER BY name").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/mi/mills', methods=['POST'])
def mi_create_mill():
    data = request.json
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Mill name required'}), 400
    city = data.get('city', '')
    state = data.get('state', '') or mi_extract_state(city) or ''
    region = data.get('region', '') or mi_get_region(state)
    lat = data.get('lat')
    lon = data.get('lon')
    if city and (lat is None or lon is None):
        coords = mi_geocode_location(city)
        if coords:
            lat, lon = coords['lat'], coords['lon']
    # Create in CRM and sync to MI
    crm_mill = find_or_create_crm_mill(name, city, state, region, lat, lon, data.get('trader', ''))
    sync_mill_to_mi(crm_mill)
    return jsonify(crm_mill), 201

@app.route('/api/mi/mills/<int:mill_id>', methods=['GET'])
def mi_get_mill(mill_id):
    conn = get_crm_db()
    mill = conn.execute("SELECT * FROM mills WHERE id=?", (mill_id,)).fetchone()
    conn.close()
    if not mill:
        return jsonify({'error': 'Not found'}), 404
    mi_conn = get_mi_db()
    quotes = mi_conn.execute("SELECT * FROM mill_quotes WHERE mill_id=? ORDER BY date DESC LIMIT 100", (mill_id,)).fetchall()
    mi_conn.close()
    result = dict(mill)
    result['quotes'] = [dict(q) for q in quotes]
    return jsonify(result)

@app.route('/api/mi/mills/<int:mill_id>', methods=['PUT'])
def mi_update_mill(mill_id):
    data = request.json
    # Update CRM mill
    conn = get_crm_db()
    fields = []
    vals = []
    for k in ['name', 'city', 'state', 'lat', 'lon', 'region', 'notes', 'contact', 'phone', 'email', 'trader']:
        if k in data:
            fields.append(f"{k}=?")
            vals.append(data[k])
    if 'location' not in data and ('city' in data or 'state' in data):
        # Auto-update location from city/state
        city = data.get('city', '')
        state = data.get('state', '')
        if city or state:
            fields.append("location=?")
            vals.append(f"{city}, {state}".strip(', '))
    if 'products' in data:
        fields.append("products=?")
        vals.append(json.dumps(data['products']))
    if fields:
        fields.append("updated_at=CURRENT_TIMESTAMP")
        vals.append(mill_id)
        conn.execute(f"UPDATE mills SET {','.join(fields)} WHERE id=?", vals)
        conn.commit()
    mill = conn.execute("SELECT * FROM mills WHERE id=?", (mill_id,)).fetchone()
    conn.close()
    if not mill:
        return jsonify({'error': 'Not found'}), 404
    # Sync to MI
    sync_mill_to_mi(dict(mill))
    return jsonify(dict(mill))

@app.route('/api/mi/mills/geocode', methods=['POST'])
def mi_geocode_mill():
    data = request.json
    location = data.get('location', '')
    if not location:
        return jsonify({'error': 'Location required'}), 400
    coords = mi_geocode_location(location)
    if coords:
        return jsonify(coords)
    return jsonify({'error': f'Could not geocode: {location}'}), 404

@app.route('/api/admin/consolidate-mills', methods=['POST'])
def consolidate_mills():
    """One-time migration: consolidate per-location mill entries into per-company entries."""
    conn = get_crm_db()
    all_mills = [dict(m) for m in conn.execute("SELECT * FROM mills ORDER BY id").fetchall()]

    # Group by company name
    groups = {}
    for m in all_mills:
        company = extract_company_name(m['name'])
        if company not in groups:
            groups[company] = []
        groups[company].append(m)

    changes = []
    for company, entries in groups.items():
        if len(entries) <= 1 and entries[0]['name'] == company:
            continue  # Already consolidated

        # Pick survivor: prefer the one already named as company, else lowest ID
        survivor = next((e for e in entries if e['name'] == company), entries[0])
        others = [e for e in entries if e['id'] != survivor['id']]

        if not others and survivor['name'] == company:
            continue  # Single entry already correct

        # Build merged locations array
        existing_locs = json.loads(survivor.get('locations') or '[]')
        seen_cities = {(l.get('city', '').lower(), l.get('state', '').upper()) for l in existing_locs}

        for e in entries:
            city = e.get('city', '') or ''
            state = e.get('state', '') or ''
            key = (city.lower(), state.upper())
            if city and key not in seen_cities:
                existing_locs.append({
                    'city': city, 'state': state,
                    'lat': e.get('lat'), 'lon': e.get('lon'),
                    'name': e['name']
                })
                seen_cities.add(key)

        # Merge products
        all_products = set()
        for e in entries:
            try:
                prods = json.loads(e.get('products') or '[]')
                all_products.update(prods)
            except:
                pass

        # Update survivor
        conn.execute(
            "UPDATE mills SET name=?, locations=?, products=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (company, json.dumps(existing_locs), json.dumps(sorted(all_products)), survivor['id'])
        )

        # Reassign mill_quotes in MI DB
        if others:
            mi_conn = get_mi_db()
            old_ids = [e['id'] for e in others]
            placeholders = ','.join('?' * len(old_ids))
            mi_conn.execute(
                f"UPDATE mill_quotes SET mill_id=? WHERE mill_id IN ({placeholders})",
                [survivor['id']] + old_ids
            )
            mi_conn.commit()
            mi_conn.close()

            # Delete non-survivor CRM entries
            conn.execute(f"DELETE FROM mills WHERE id IN ({placeholders})", old_ids)

        changes.append({
            'company': company,
            'survivor_id': survivor['id'],
            'merged': len(others),
            'locations': len(existing_locs)
        })

    conn.commit()
    conn.close()

    # Re-sync to MI
    sync_crm_mills_to_mi()

    return jsonify({
        'consolidated': len([c for c in changes if c['merged'] > 0]),
        'total_companies': len(groups),
        'changes': changes
    })

# ----- MI: MILL QUOTES -----

@app.route('/api/mi/quotes', methods=['GET'])
def mi_list_quotes():
    conn = get_mi_db()
    conditions = ["1=1"]
    params = []
    for k, col in [('mill', 'mill_name'), ('product', 'product'), ('trader', 'trader')]:
        v = request.args.get(k)
        if v:
            conditions.append(f"{col}=?")
            params.append(v)
    since = request.args.get('since')
    if since:
        conditions.append("date>=?")
        params.append(since)
    until = request.args.get('until')
    if until:
        conditions.append("date<=?")
        params.append(until)
    try:
        limit = int(request.args.get('limit', 500))
    except (ValueError, TypeError):
        limit = 500
    sql = f"SELECT * FROM mill_quotes WHERE {' AND '.join(conditions)} ORDER BY date DESC, created_at DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/mi/quotes', methods=['POST'])
def mi_submit_quotes():
    data = request.json
    quotes = data if isinstance(data, list) else [data]
    conn = get_mi_db()
    created = []

    # Auto-replace: For each mill+product+length combo being uploaded, delete existing quotes
    # This ensures uploaded quotes always show as "today" even if price unchanged
    today_date = datetime.now().strftime('%Y-%m-%d')
    cleared_combos = set()
    for q in quotes:
        mill_name = q.get('mill', '').strip()
        product = q.get('product', '').strip()
        length = q.get('length', 'RL').strip()
        if mill_name and product:
            key = (mill_name.upper(), product.upper(), length.upper())
            if key not in cleared_combos:
                cleared_combos.add(key)
                deleted = conn.execute(
                    "DELETE FROM mill_quotes WHERE UPPER(mill_name)=? AND UPPER(product)=? AND UPPER(COALESCE(length,'RL'))=?",
                    (mill_name.upper(), product.upper(), length.upper() if length else 'RL')
                ).rowcount
                if deleted:
                    app.logger.info(f"Replaced existing quote for {mill_name} {product} {length}")

    for q in quotes:
        mill_name = q.get('mill', '').strip()
        if not mill_name or not q.get('product') or not q.get('price'):
            continue
        try:
            price_val = float(q['price'])
            if price_val <= 0:
                continue
        except (ValueError, TypeError):
            continue

        # Find or create mill in CRM (single source of truth)
        city = q.get('city', '')
        state = mi_extract_state(city) if city else ''
        region = mi_get_region(state) if state else 'central'
        lat, lon = None, None
        if city:
            coords = mi_geocode_location(city)
            if coords:
                lat, lon = coords['lat'], coords['lon']
        crm_mill = find_or_create_crm_mill(mill_name, city, state, region, lat, lon,
                                            q.get('trader', 'Unknown'))
        # Sync to MI mills table for JOIN queries (pass existing conn to avoid lock)
        sync_mill_to_mi(crm_mill, mi_conn=conn)

        mill_id = crm_mill['id']
        product = q['product']

        # Update products list on CRM mill
        existing_products = json.loads(crm_mill.get('products') or '[]')
        if product not in existing_products:
            existing_products.append(product)
            crm_conn = get_crm_db()
            crm_conn.execute("UPDATE mills SET products=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                             (json.dumps(existing_products), mill_id))
            crm_conn.commit()
            crm_conn.close()
            # Also update MI mirror
            conn.execute("UPDATE mills SET products=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                         (json.dumps(existing_products), mill_id))

        conn.execute(
            """INSERT INTO mill_quotes (mill_id, mill_name, product, price, length, volume, tls,
               ship_window, notes, date, trader, source, raw_text)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (mill_id, mill_name, product, price_val,
             q.get('length', 'RL'), float(q.get('volume', 0)), int(q.get('tls', 0)),
             q.get('shipWindow', q.get('ship_window', '')) or 'Prompt', q.get('notes', ''),
             today_date,  # Always use today's date for uploads
             q.get('trader', 'Unknown'), q.get('source', 'manual'), q.get('raw_text', ''))
        )
        created.append(q)
    conn.commit()
    conn.close()
    invalidate_matrix_cache()  # Clear cached matrix data
    return jsonify({'created': len(created), 'quotes': created}), 201

@app.route('/api/mi/quotes/<int:quote_id>', methods=['DELETE'])
def mi_delete_quote(quote_id):
    conn = get_mi_db()
    conn.execute("DELETE FROM mill_quotes WHERE id=?", (quote_id,))
    conn.commit()
    conn.close()
    invalidate_matrix_cache()  # Clear cached matrix data
    return jsonify({'deleted': quote_id})

@app.route('/api/mi/quotes/rename-mill', methods=['POST'])
def mi_rename_mill_quotes():
    """Bulk rename mill_name in quotes (admin utility)."""
    data = request.json
    old_name = data.get('old_name', '').strip()
    new_name = data.get('new_name', '').strip()
    if not old_name or not new_name:
        return jsonify({'error': 'old_name and new_name required'}), 400
    conn = get_mi_db()
    cur = conn.execute("UPDATE mill_quotes SET mill_name=? WHERE mill_name=?", (new_name, old_name))
    conn.commit()
    conn.close()
    return jsonify({'updated': cur.rowcount, 'old_name': old_name, 'new_name': new_name})

@app.route('/api/mi/quotes/latest', methods=['GET'])
def mi_latest_quotes():
    conn = get_mi_db()
    product = request.args.get('product')
    region = request.args.get('region')
    since = request.args.get('since')
    sql = """
        SELECT mq.*, m.lat, m.lon, m.region, m.city, m.state
        FROM mill_quotes mq
        LEFT JOIN mills m ON mq.mill_id = m.id
        WHERE mq.id IN (
            SELECT id FROM mill_quotes mq2
            WHERE mq2.mill_name = mq.mill_name AND mq2.product = mq.product
            ORDER BY mq2.date DESC, mq2.created_at DESC
            LIMIT 1
        )
    """
    params = []
    if product:
        sql += " AND mq.product=?"
        params.append(product)
    if region:
        sql += " AND m.region=?"
        params.append(region)
    if since:
        sql += " AND mq.date>=?"
        params.append(since)
    sql += " ORDER BY mq.product, mq.price"
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/mi/quotes/matrix', methods=['GET'])
def mi_quote_matrix():
    detail = request.args.get('detail', '')
    filter_product = request.args.get('product', '')
    filter_since = request.args.get('since', '')

    # Check cache first (30s TTL to handle concurrent users)
    cache_key = f"matrix:{detail}:{filter_product}:{filter_since}"
    cached = get_cached_matrix(cache_key)
    if cached:
        return jsonify(cached)

    conn = get_mi_db()

    if detail == 'length':
        sql = """
            SELECT mq.mill_name, mq.product, mq.length, mq.price, mq.date, mq.volume,
                   mq.ship_window, mq.tls, mq.trader,
                   m.lat, m.lon, m.region, m.city, m.state
            FROM mill_quotes mq
            LEFT JOIN mills m ON mq.mill_id = m.id
            WHERE mq.id IN (
                SELECT MAX(id) FROM mill_quotes GROUP BY mill_name, product, length
            )
        """
        params = []
        if filter_product:
            sql += " AND mq.product = ?"
            params.append(filter_product)
        if filter_since:
            sql += " AND mq.date >= ?"
            params.append(filter_since)
        sql += " ORDER BY mq.mill_name, mq.product, mq.length"
        rows = conn.execute(sql, params).fetchall()
        conn.close()

        matrix = {}
        mills = set()
        columns = set()
        best_by_col = {}

        def length_sort_key(l):
            if not l or l == 'RL':
                return 999
            try:
                return float(str(l).replace("'", "").split('-')[0])
            except:
                return 998

        for r in rows:
            r = dict(r)
            mill = r['mill_name']
            prod = r['product']
            length = r['length'] or 'RL'
            col_key = f"{prod} {length}'" if length != 'RL' else f"{prod} RL"
            mills.add(mill)
            columns.add(col_key)
            if mill not in matrix:
                matrix[mill] = {}
            # Use MILL_DIRECTORY for accurate city/state (CRM parent record may differ)
            dir_city, dir_state = MILL_DIRECTORY.get(mill, (r['city'], r['state']))
            matrix[mill][col_key] = {
                'price': r['price'], 'date': r['date'], 'volume': r['volume'],
                'ship_window': r['ship_window'], 'tls': r['tls'], 'trader': r['trader'],
                'product': prod, 'length': length,
                'lat': r['lat'], 'lon': r['lon'], 'region': r['region'],
                'city': dir_city, 'state': dir_state
            }
            if col_key not in best_by_col or r['price'] < best_by_col[col_key]:
                best_by_col[col_key] = r['price']

        def col_sort(c):
            parts = c.rsplit(' ', 1)
            prod = parts[0]
            length = parts[1].replace("'", "") if len(parts) > 1 else 'RL'
            return (prod, length_sort_key(length))

        sorted_cols = sorted(columns, key=col_sort)
        unique_products = sorted(set(c.rsplit(' ', 1)[0] for c in columns))

        result = {
            'matrix': matrix,
            'mills': sorted(mills),
            'columns': sorted_cols,
            'products': unique_products,
            'best_by_col': best_by_col,
            'detail': 'length'
        }
        set_cached_matrix(cache_key, result)
        return jsonify(result)
    else:
        sql = """
            SELECT mq.mill_name, mq.product, mq.price, mq.date, mq.volume, mq.ship_window,
                   mq.tls, mq.trader, m.lat, m.lon, m.region, m.city, m.state
            FROM mill_quotes mq
            LEFT JOIN mills m ON mq.mill_id = m.id
            WHERE mq.id IN (
                SELECT MAX(id) FROM mill_quotes GROUP BY mill_name, product
            )
        """
        params = []
        if filter_since:
            sql += " AND mq.date >= ?"
            params.append(filter_since)
        sql += " ORDER BY mq.mill_name, mq.product"
        rows = conn.execute(sql, params).fetchall()
        conn.close()

        matrix = {}
        mills = set()
        products = set()
        best_by_product = {}

        for r in rows:
            r = dict(r)
            mill = r['mill_name']
            prod = r['product']
            mills.add(mill)
            products.add(prod)
            if mill not in matrix:
                matrix[mill] = {}
            dir_city, dir_state = MILL_DIRECTORY.get(mill, (r['city'], r['state']))
            matrix[mill][prod] = {
                'price': r['price'], 'date': r['date'], 'volume': r['volume'],
                'ship_window': r['ship_window'], 'tls': r['tls'], 'trader': r['trader'],
                'lat': r['lat'], 'lon': r['lon'], 'region': r['region'],
                'city': dir_city, 'state': dir_state
            }
            if prod not in best_by_product or r['price'] < best_by_product[prod]:
                best_by_product[prod] = r['price']

        result = {
            'matrix': matrix,
            'mills': sorted(mills),
            'products': sorted(products),
            'best_by_product': best_by_product
        }
        set_cached_matrix(cache_key, result)
        return jsonify(result)

@app.route('/api/mi/quotes/history', methods=['GET'])
def mi_quote_history():
    mill = request.args.get('mill')
    product = request.args.get('product')
    try:
        days = int(request.args.get('days', 90))
    except (ValueError, TypeError):
        days = 90
    cutoff = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
    conn = get_mi_db()
    conditions = ["date >= ?"]
    params = [cutoff]
    if mill:
        conditions.append("mill_name=?")
        params.append(mill)
    if product:
        conditions.append("product=?")
        params.append(product)
    rows = conn.execute(
        f"SELECT * FROM mill_quotes WHERE {' AND '.join(conditions)} ORDER BY date ASC, created_at ASC",
        params
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# ----- MI: INTELLIGENCE ENGINE -----

@app.route('/api/mi/intel/signals', methods=['GET'])
def mi_intel_signals():
    product_filter = request.args.get('product')
    conn = get_mi_db()
    now = datetime.now()
    d7 = (now - timedelta(days=7)).strftime('%Y-%m-%d')
    d14 = (now - timedelta(days=14)).strftime('%Y-%m-%d')
    d30 = (now - timedelta(days=30)).strftime('%Y-%m-%d')

    if product_filter:
        products = [product_filter]
    else:
        products = [r['product'] for r in conn.execute("SELECT DISTINCT product FROM mill_quotes").fetchall()]

    all_signals = {}
    for product in products:
        signals = []

        # 1. Supply Pressure
        mills_7d = conn.execute(
            "SELECT COUNT(DISTINCT mill_name) as cnt, SUM(volume) as vol FROM mill_quotes WHERE product=? AND date>=?",
            (product, d7)
        ).fetchone()
        mills_30d = conn.execute(
            "SELECT COUNT(DISTINCT mill_name) as cnt, SUM(volume) as vol, COUNT(*) as quotes FROM mill_quotes WHERE product=? AND date>=?",
            (product, d30)
        ).fetchone()
        m7 = mills_7d['cnt'] or 0
        v7 = mills_7d['vol'] or 0
        m30 = mills_30d['cnt'] or 0
        v30 = mills_30d['vol'] or 0
        avg_weekly_mills = m30 / 4.3 if m30 else 0
        avg_weekly_vol = v30 / 4.3 if v30 else 0

        if avg_weekly_mills > 0:
            mill_ratio = m7 / avg_weekly_mills
            vol_ratio = v7 / avg_weekly_vol if avg_weekly_vol > 0 else 1
            if mill_ratio > 1.2 or vol_ratio > 1.3:
                direction = 'bearish'
                strength = 'strong' if mill_ratio > 1.5 or vol_ratio > 1.5 else 'moderate'
            elif mill_ratio < 0.8 or vol_ratio < 0.7:
                direction = 'bullish'
                strength = 'strong' if mill_ratio < 0.5 else 'moderate'
            else:
                direction = 'neutral'
                strength = 'weak'
            signals.append({
                'signal': 'supply_pressure',
                'mills_offering_7d': m7, 'volume_7d': round(v7, 1),
                'mills_avg_weekly': round(avg_weekly_mills, 1), 'volume_avg_weekly': round(avg_weekly_vol, 1),
                'direction': direction, 'strength': strength,
                'explanation': f"{m7} mills offering {product} this week ({round(v7)} MBF), vs {round(avg_weekly_mills,1)} mills avg. {'More supply = potential to short.' if direction=='bearish' else 'Tighter supply = consider buying.' if direction=='bullish' else 'Supply steady.'}"
            })

        # 2. Price Momentum
        prices_14d = conn.execute(
            "SELECT date, AVG(price) as avg_price FROM mill_quotes WHERE product=? AND date>=? GROUP BY date ORDER BY date",
            (product, d14)
        ).fetchall()
        prices_30d = conn.execute(
            "SELECT date, AVG(price) as avg_price FROM mill_quotes WHERE product=? AND date>=? GROUP BY date ORDER BY date",
            (product, d30)
        ).fetchall()

        def calc_slope(prices):
            if len(prices) < 2:
                return 0
            n = len(prices)
            x_sum = n * (n - 1) / 2
            x2_sum = n * (n - 1) * (2 * n - 1) / 6
            y_sum = sum(p['avg_price'] for p in prices)
            xy_sum = sum(i * p['avg_price'] for i, p in enumerate(prices))
            denom = n * x2_sum - x_sum * x_sum
            if denom == 0:
                return 0
            return (n * xy_sum - x_sum * y_sum) / denom

        slope_14d = calc_slope(prices_14d)
        slope_30d = calc_slope(prices_30d)
        current_avg = prices_14d[-1]['avg_price'] if prices_14d else 0

        if abs(slope_14d) > 0.5:
            direction = 'bullish' if slope_14d > 0 else 'bearish'
            strength = 'strong' if abs(slope_14d) > 2 else 'moderate'
        else:
            direction = 'neutral'
            strength = 'weak'
        signals.append({
            'signal': 'price_momentum',
            'current_avg': round(current_avg, 2), 'slope_14d': round(slope_14d, 2), 'slope_30d': round(slope_30d, 2),
            'direction': direction, 'strength': strength,
            'explanation': f"{product} avg ${round(current_avg)}. Price {'rising' if slope_14d > 0 else 'falling'} ~${abs(round(slope_14d, 1))}/day over 14d. {'Buy before prices climb higher.' if direction=='bullish' else 'Prices softening — wait or short.' if direction=='bearish' else 'Prices stable.'}"
        })

        # 3. Print vs Street
        latest_rl = conn.execute(
            "SELECT price FROM rl_prices WHERE product=? ORDER BY date DESC LIMIT 1",
            (product,)
        ).fetchone()
        if latest_rl and current_avg > 0:
            rl_price = latest_rl['price']
            gap = rl_price - current_avg
            if gap > 10:
                direction = 'bearish'
                explanation = f"Mills offering {product} ${round(gap)} below RL print (${round(rl_price)}). Street is cheaper than print."
            elif gap < -10:
                direction = 'bullish'
                explanation = f"Mills charging ${round(abs(gap))} above RL print (${round(rl_price)}). Genuine tightness."
            else:
                direction = 'neutral'
                explanation = f"Mill prices tracking close to RL print (${round(rl_price)} vs ${round(current_avg)} street)."
            signals.append({
                'signal': 'print_vs_street',
                'rl_price': round(rl_price, 2), 'avg_street': round(current_avg, 2), 'gap': round(gap, 2),
                'direction': direction,
                'strength': 'strong' if abs(gap) > 20 else 'moderate' if abs(gap) > 10 else 'weak',
                'explanation': explanation
            })

        # 4. Regional Arbitrage
        regional_prices = conn.execute("""
            SELECT m.region, MIN(mq.price) as best_price, mq.mill_name
            FROM mill_quotes mq LEFT JOIN mills m ON mq.mill_id = m.id
            WHERE mq.product=? AND mq.date>=?
            GROUP BY m.region
        """, (product, d7)).fetchall()
        if len(regional_prices) >= 2:
            rp = {r['region']: {'price': r['best_price'], 'mill': r['mill_name']} for r in regional_prices}
            opps = []
            regions = list(rp.keys())
            for i in range(len(regions)):
                for j in range(i+1, len(regions)):
                    spread = abs(rp[regions[i]]['price'] - rp[regions[j]]['price'])
                    if spread > 10:
                        cheaper = regions[i] if rp[regions[i]]['price'] < rp[regions[j]]['price'] else regions[j]
                        opps.append({
                            'from_region': cheaper,
                            'to_region': regions[j] if cheaper == regions[i] else regions[i],
                            'spread': round(spread, 2),
                            'cheaper_mill': rp[cheaper]['mill'],
                            'cheaper_price': rp[cheaper]['price']
                        })
            if opps:
                signals.append({
                    'signal': 'regional_arbitrage',
                    'opportunities': opps,
                    'direction': 'opportunity',
                    'strength': 'strong' if any(o['spread'] > 25 for o in opps) else 'moderate',
                    'explanation': f"Regional spread on {product}: " + ', '.join(
                        f"${o['spread']} between {o['from_region']} and {o['to_region']} ({o['cheaper_mill']} at ${o['cheaper_price']})"
                        for o in opps[:3]
                    )
                })

        # 5. Offering Velocity
        daily_counts = conn.execute(
            "SELECT date, COUNT(*) as cnt FROM mill_quotes WHERE product=? AND date>=? GROUP BY date",
            (product, d30)
        ).fetchall()
        if daily_counts:
            avg_daily = sum(r['cnt'] for r in daily_counts) / max(len(daily_counts), 1)
            recent_daily = [r['cnt'] for r in daily_counts if r['date'] >= d7]
            recent_avg = sum(recent_daily) / max(len(recent_daily), 1) if recent_daily else 0
            vel_ratio = recent_avg / avg_daily if avg_daily > 0 else 1
            if vel_ratio > 1.3:
                direction = 'bearish'
                explanation = f"Above-average quoting on {product} ({round(recent_avg,1)} vs {round(avg_daily,1)} daily avg). Mills pushing inventory."
            elif vel_ratio < 0.7:
                direction = 'bullish'
                explanation = f"Below-average activity on {product}. Quiet market suggests tightening."
            else:
                direction = 'neutral'
                explanation = f"Normal quoting velocity on {product}."
            signals.append({
                'signal': 'offering_velocity',
                'recent_avg_daily': round(recent_avg, 1), 'avg_daily_30d': round(avg_daily, 1),
                'velocity_ratio': round(vel_ratio, 2),
                'direction': direction,
                'strength': 'strong' if abs(vel_ratio - 1) > 0.5 else 'moderate' if abs(vel_ratio - 1) > 0.3 else 'weak',
                'explanation': explanation
            })

        # 6. Volume Trend
        weekly_vol = conn.execute("""
            SELECT strftime('%%W', date) as week, SUM(volume) as vol
            FROM mill_quotes WHERE product=? AND date>=? AND volume > 0
            GROUP BY week ORDER BY week
        """, (product, d30)).fetchall()
        if len(weekly_vol) >= 2:
            vols = [r['vol'] for r in weekly_vol]
            avg_vol = sum(vols) / len(vols)
            latest_vol = vols[-1]
            change = ((latest_vol - avg_vol) / avg_vol * 100) if avg_vol > 0 else 0
            if change > 15:
                direction = 'bearish'
            elif change < -15:
                direction = 'bullish'
            else:
                direction = 'neutral'
            signals.append({
                'signal': 'volume_trend',
                'latest_week_mbf': round(latest_vol, 1), 'avg_week_mbf': round(avg_vol, 1),
                'change_pct': round(change, 1),
                'direction': direction,
                'strength': 'strong' if abs(change) > 30 else 'moderate' if abs(change) > 15 else 'weak',
                'explanation': f"{product} volume {'up' if change > 0 else 'down'} {round(abs(change))}% vs avg ({round(latest_vol)} MBF this week vs {round(avg_vol)} avg)."
            })

        all_signals[product] = signals

    conn.close()
    return jsonify(all_signals)

@app.route('/api/mi/intel/recommendations', methods=['GET'])
def mi_intel_recommendations():
    product_filter = request.args.get('product')
    conn = get_mi_db()
    if product_filter:
        products = [product_filter]
    else:
        products = [r['product'] for r in conn.execute("SELECT DISTINCT product FROM mill_quotes").fetchall()]

    import json as json_mod
    with app.test_request_context(f'/api/mi/intel/signals{"?product=" + product_filter if product_filter else ""}'):
        sig_response = mi_intel_signals()
        all_signals = json_mod.loads(sig_response.get_data())

    recommendations = []
    for product in products:
        signals = all_signals.get(product, [])
        score = 0
        reasons = []

        weights = {
            'supply_pressure': 2, 'price_momentum': 3, 'print_vs_street': 1.5,
            'offering_velocity': 1, 'volume_trend': 1.5, 'regional_arbitrage': 0
        }

        for sig in signals:
            w = weights.get(sig['signal'], 1)
            if sig['direction'] == 'bullish':
                score += w * (2 if sig['strength'] == 'strong' else 1)
            elif sig['direction'] == 'bearish':
                score -= w * (2 if sig['strength'] == 'strong' else 1)
            if sig.get('explanation'):
                reasons.append(sig['explanation'])

        if score >= 4: action = 'BUY NOW'
        elif score >= 2: action = 'LEAN BUY'
        elif score <= -4: action = 'SHORT / SELL'
        elif score <= -2: action = 'LEAN SHORT'
        else: action = 'HOLD / NEUTRAL'

        if score >= 4: margin_range = [35, 50]
        elif score >= 2: margin_range = [28, 40]
        elif score <= -4: margin_range = [15, 22]
        elif score <= -2: margin_range = [18, 28]
        else: margin_range = [22, 35]

        best = conn.execute("""
            SELECT mq.mill_name, mq.price, m.city, m.region
            FROM mill_quotes mq LEFT JOIN mills m ON mq.mill_id = m.id
            WHERE mq.product=? AND mq.date >= ?
            ORDER BY mq.price ASC LIMIT 1
        """, (product, (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d'))).fetchone()

        recommendations.append({
            'product': product, 'action': action, 'score': round(score, 1),
            'confidence': min(abs(score) / 8, 1.0), 'margin_range': margin_range,
            'best_source': dict(best) if best else None, 'reasons': reasons,
            'signal_count': len(signals)
        })

    conn.close()
    return jsonify(sorted(recommendations, key=lambda r: abs(r['score']), reverse=True))

@app.route('/api/mi/intel/trends', methods=['GET'])
def mi_intel_trends():
    product_filter = request.args.get('product')
    try:
        days = int(request.args.get('days', 90))
    except (ValueError, TypeError):
        days = 90
    conn = get_mi_db()
    since = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')

    sql = """
        SELECT date, product,
               ROUND(AVG(price),1) as avg_price,
               ROUND(MIN(price),1) as min_price,
               ROUND(MAX(price),1) as max_price,
               COUNT(DISTINCT mill_name) as mill_count,
               ROUND(SUM(COALESCE(volume,0)),1) as total_volume,
               COUNT(*) as quote_count
        FROM mill_quotes
        WHERE date >= ?
    """
    params = [since]
    if product_filter:
        sql += " AND product = ?"
        params.append(product_filter)
    sql += " GROUP BY date, product ORDER BY date"

    rows = conn.execute(sql, params).fetchall()
    conn.close()

    trends = {}
    for r in rows:
        p = r['product']
        if p not in trends:
            trends[p] = []
        trends[p].append({
            'date': r['date'], 'avg_price': r['avg_price'],
            'min_price': r['min_price'], 'max_price': r['max_price'],
            'mill_count': r['mill_count'], 'volume': r['total_volume'],
            'quotes': r['quote_count']
        })

    return jsonify(trends)

# ----- MI: CUSTOMERS -----

@app.route('/api/mi/customers', methods=['GET'])
def mi_list_customers():
    conn = get_mi_db()
    rows = conn.execute("SELECT * FROM customers ORDER BY name").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/mi/customers', methods=['POST'])
def mi_create_customer():
    data = request.json
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Name required'}), 400
    dest = data.get('destination', '')
    lat, lon = data.get('lat'), data.get('lon')
    if dest and (lat is None or lon is None):
        coords = mi_geocode_location(dest)
        if coords:
            lat, lon = coords['lat'], coords['lon']
    conn = get_mi_db()
    conn.execute("INSERT INTO customers (name, destination, lat, lon, trader) VALUES (?,?,?,?,?)",
                 (name, dest, lat, lon, data.get('trader', '')))
    conn.commit()
    cust = conn.execute("SELECT * FROM customers WHERE id=last_insert_rowid()").fetchone()
    conn.close()
    return jsonify(dict(cust)), 201

# ----- MI: RL PRICES -----

@app.route('/api/mi/rl', methods=['GET'])
def mi_list_rl():
    conn = get_mi_db()
    rows = conn.execute("SELECT * FROM rl_prices ORDER BY date DESC LIMIT 200").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/mi/rl', methods=['POST'])
def mi_add_rl():
    data = request.json
    entries = data if isinstance(data, list) else [data]
    rows = []
    for e in entries:
        if not e.get('date') or not e.get('product') or not e.get('region'):
            continue
        try:
            price = float(e['price'])
            if price <= 0:
                continue
        except (ValueError, TypeError):
            continue
        rows.append((e['date'], e['product'], e['region'], price))
    if rows:
        for attempt in range(3):
            try:
                conn = get_mi_db()
                conn.executemany(
                    "INSERT OR REPLACE INTO rl_prices (date, product, region, price) VALUES (?,?,?,?)",
                    rows
                )
                conn.commit()
                conn.close()
                return jsonify({'created': len(rows)}), 201
            except sqlite3.OperationalError as e:
                if 'locked' in str(e) and attempt < 2:
                    try: conn.close()
                    except: pass
                    import time; time.sleep(1)
                    continue
                raise
    return jsonify({'created': 0}), 201

# ----- MI: LANES -----

@app.route('/api/mi/lanes', methods=['GET'])
def mi_list_lanes():
    conn = get_mi_db()
    rows = conn.execute("SELECT * FROM lanes ORDER BY origin").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/mi/lanes', methods=['POST'])
def mi_add_lane():
    data = request.json or {}
    origin = data.get('origin', '')
    dest = data.get('dest', '')
    miles = data.get('miles', 0)
    if not origin or not dest:
        return jsonify({'error': 'origin and dest are required'}), 400
    try:
        conn = get_mi_db()
        conn.execute("INSERT OR REPLACE INTO lanes (origin, dest, miles) VALUES (?,?,?)",
                     (origin, dest, miles))
        conn.commit()
        conn.close()
        return jsonify({'ok': True}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ----- MI: MILEAGE -----

@app.route('/api/mi/mileage', methods=['POST'])
def mi_mileage_lookup():
    data = request.json
    origin = data.get('origin', '')
    dest = data.get('dest', '')
    if not origin or not dest:
        return jsonify({'error': 'Missing origin or dest'}), 400
    conn = get_mi_db()
    lane = conn.execute("SELECT miles FROM lanes WHERE origin=? AND dest=?", (origin, dest)).fetchone()
    if lane:
        conn.close()
        return jsonify({'miles': lane['miles'], 'origin': origin, 'dest': dest})
    conn.close()
    origin_coords = mi_geocode_location(origin)
    if not origin_coords:
        return jsonify({'error': f'Could not geocode origin: {origin}'}), 404
    time.sleep(0.5)
    dest_coords = mi_geocode_location(dest)
    if not dest_coords:
        return jsonify({'error': f'Could not geocode destination: {dest}'}), 404
    miles = mi_get_distance(origin_coords, dest_coords)
    if miles is None:
        return jsonify({'error': 'Could not calculate route'}), 404
    conn = get_mi_db()
    conn.execute("INSERT OR IGNORE INTO lanes (origin, dest, miles) VALUES (?,?,?)", (origin, dest, miles))
    conn.commit()
    conn.close()
    return jsonify({'miles': miles, 'origin': origin, 'dest': dest})

# ----- MI: SETTINGS -----

@app.route('/api/mi/settings', methods=['GET'])
def mi_get_settings():
    conn = get_mi_db()
    rows = conn.execute("SELECT * FROM settings").fetchall()
    conn.close()
    return jsonify({r['key']: r['value'] for r in rows})

@app.route('/api/mi/settings', methods=['PUT'])
def mi_update_settings():
    data = request.json
    conn = get_mi_db()
    for k, v in data.items():
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)", (k, str(v)))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
