"""
SYP Analytics - Flask Server
Handles mileage API proxy and static file serving
"""
from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
import requests
import os

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# Serve main app
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

# Mileage lookup proxy (avoids CORS issues)
@app.route('/api/mileage', methods=['POST'])
def mileage_lookup():
    data = request.json
    origin = data.get('origin', '')
    dest = data.get('dest', '')
    
    if not origin or not dest:
        return jsonify({'error': 'Missing origin or dest'}), 400
    
    try:
        # Use free distance API
        url = f"https://router.project-osrm.org/route/v1/driving/{origin};{dest}"
        params = {'overview': 'false'}
        
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()
        
        if data.get('code') == 'Ok' and data.get('routes'):
            # Convert meters to miles
            meters = data['routes'][0]['distance']
            miles = round(meters / 1609.34)
            return jsonify({'miles': miles})
        else:
            return jsonify({'error': 'Route not found'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Geocode helper (converts city,state to coordinates)
@app.route('/api/geocode', methods=['POST'])
def geocode():
    data = request.json
    location = data.get('location', '')
    
    if not location:
        return jsonify({'error': 'Missing location'}), 400
    
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
            return jsonify({
                'lat': float(results[0]['lat']),
                'lon': float(results[0]['lon'])
            })
        else:
            return jsonify({'error': 'Location not found'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Health check for Railway
@app.route('/health')
def health():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
