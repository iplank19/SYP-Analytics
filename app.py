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
        conn.execute('''
            UPDATE prospects SET
                company_name = ?, contact_name = ?, phone = ?, email = ?,
                address = ?, notes = ?, status = ?, source = ?, trader = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (
            data.get('company_name'),
            data.get('contact_name'),
            data.get('phone'),
            data.get('email'),
            data.get('address'),
            data.get('notes'),
            data.get('status'),
            data.get('source'),
            data.get('trader'),
            id
        ))
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

# CRM Dashboard stats
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

        conn.close()
        return jsonify({
            'stats': stats,
            'follow_ups_today': [dict(f) for f in follow_ups_today],
            'overdue': [dict(o) for o in overdue],
            'recent_touches': [dict(r) for r in recent]
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

# ==================== END CRM API ====================

# Health check for Railway
@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'cache_size': len(geo_cache)})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
