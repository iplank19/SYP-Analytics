"""
SYP Analytics - Flask Server
Handles mileage API proxy and static file serving
"""
from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
import requests
import os
import time

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

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

# Health check for Railway
@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'cache_size': len(geo_cache)})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
