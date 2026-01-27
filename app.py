"""
SYP Analytics - Flask Server
Handles mileage API proxy, CRM, and static file serving
"""
from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
import requests
import os
import time
import sqlite3
import json
from datetime import datetime

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# CRM Database Setup
CRM_DB_PATH = os.path.join(os.path.dirname(__file__), 'crm.db')

def get_crm_db():
    conn = sqlite3.connect(CRM_DB_PATH)
    conn.row_factory = sqlite3.Row
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

        -- Mills table (cloud-based)
        CREATE TABLE IF NOT EXISTS mills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            contact TEXT,
            phone TEXT,
            email TEXT,
            location TEXT,
            products TEXT,
            notes TEXT,
            trader TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_customers_trader ON customers(trader);
        CREATE INDEX IF NOT EXISTS idx_mills_trader ON mills(trader);
    ''')
    conn.commit()
    conn.close()

# Initialize CRM database on startup
init_crm_db()

# Cache for geocoded locations
geo_cache = {}

# Serve main app
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

def geocode_location(location):
    """Convert city, state to coordinates"""
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
            'limit': 1,
            'countrycodes': 'us'
        }
        headers = {'User-Agent': 'SYP-Analytics/1.0'}
        
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        results = resp.json()
        
        if results:
            coords = {
                'lat': float(results[0]['lat']),
                'lon': float(results[0]['lon'])
            }
            geo_cache[cache_key] = coords
            return coords
        return None
    except Exception as e:
        print(f"Geocode error for {location}: {e}")
        return None

def get_distance(origin_coords, dest_coords):
    """Get driving distance in miles between two coordinate pairs"""
    try:
        # OSRM format: lon,lat;lon,lat
        coords_str = f"{origin_coords['lon']},{origin_coords['lat']};{dest_coords['lon']},{dest_coords['lat']}"
        url = f"https://router.project-osrm.org/route/v1/driving/{coords_str}"
        params = {'overview': 'false'}
        
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()
        
        if data.get('code') == 'Ok' and data.get('routes'):
            meters = data['routes'][0]['distance']
            miles = round(meters / 1609.34)
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
    for lane in lanes:
        origin = lane.get('origin', '')
        dest = lane.get('dest', '')
        
        if not origin or not dest:
            results.append({'origin': origin, 'dest': dest, 'miles': None, 'error': 'Missing data'})
            continue
        
        # Geocode origin
        origin_coords = geocode_location(origin)
        if not origin_coords:
            results.append({'origin': origin, 'dest': dest, 'miles': None, 'error': f'Could not geocode: {origin}'})
            continue
        
        time.sleep(0.3)  # Rate limit
        
        # Geocode dest
        dest_coords = geocode_location(dest)
        if not dest_coords:
            results.append({'origin': origin, 'dest': dest, 'miles': None, 'error': f'Could not geocode: {dest}'})
            continue
        
        time.sleep(0.3)  # Rate limit
        
        # Get distance
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
            data.get('company_name'),
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
            data.get('name'),
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
        return jsonify([dict(m) for m in mills])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/crm/mills', methods=['POST'])
def create_mill():
    try:
        data = request.get_json()
        conn = get_crm_db()
        cursor = conn.execute('''
            INSERT INTO mills (name, contact, phone, email, location, products, notes, trader)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data.get('name'),
            data.get('contact'),
            data.get('phone'),
            data.get('email'),
            data.get('location'),
            json.dumps(data.get('products')) if data.get('products') else None,
            data.get('notes'),
            data.get('trader')
        ))
        conn.commit()
        mill = conn.execute('SELECT * FROM mills WHERE id = ?', (cursor.lastrowid,)).fetchone()
        conn.close()
        return jsonify(dict(mill)), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/crm/mills/<int:id>', methods=['PUT'])
def update_mill(id):
    try:
        data = request.get_json()
        conn = get_crm_db()
        # Only update fields that are present in the request (partial update support)
        allowed = ['name', 'contact', 'phone', 'email', 'location', 'products', 'notes', 'trader']
        fields = [f for f in allowed if f in data]
        if not fields:
            return jsonify({'error': 'No fields to update'}), 400
        set_parts = []
        values = []
        for f in fields:
            set_parts.append(f'{f} = ?')
            if f == 'products':
                values.append(json.dumps(data[f]) if data[f] else None)
            else:
                values.append(data[f])
        set_clause = ', '.join(set_parts) + ', updated_at = CURRENT_TIMESTAMP'
        values.append(id)
        conn.execute(f'UPDATE mills SET {set_clause} WHERE id = ?', values)
        conn.commit()
        mill = conn.execute('SELECT * FROM mills WHERE id = ?', (id,)).fetchone()
        conn.close()
        return jsonify(dict(mill))
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

# Health check for Railway
@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'cache_size': len(geo_cache)})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
