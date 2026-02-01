// SYP Mill Intelligence - Interactive Map
// Leaflet.js map with mill/customer markers, popups, filters

let _mapInstance = null;
let _mapMillMarkers = null;
let _mapCustMarkers = null;

async function renderMap() {
  const c = document.getElementById('content');
  c.innerHTML = `
    <div class="card" style="height:calc(100vh - 120px);display:flex;flex-direction:column">
      <div class="card-header" style="flex-wrap:wrap;gap:8px">
        <span class="card-title">MILL MAP</span>
        <div class="map-controls">
          <select id="map-product-filter" onchange="S.mapProduct=this.value;updateMapMarkers()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
            <option value="">All Products</option>
            ${PRODUCTS.map(p => `<option value="${p}"${S.mapProduct===p?' selected':''}>${p}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-default" onclick="resetMapView()">Reset View</button>
          <span id="map-stats" style="color:var(--muted);font-size:11px"></span>
        </div>
      </div>
      <div style="flex:1;position:relative">
        <div id="mill-map"></div>
      </div>
    </div>
  `;

  setTimeout(initMap, 50);
}

function initMap() {
  const container = document.getElementById('mill-map');
  if (!container) return;

  // Destroy previous
  if (_mapInstance) {
    _mapInstance.remove();
    _mapInstance = null;
  }

  _mapInstance = L.map('mill-map', {
    center: [33.5, -90],
    zoom: 5,
    zoomControl: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 18
  }).addTo(_mapInstance);

  _mapMillMarkers = L.layerGroup().addTo(_mapInstance);
  _mapCustMarkers = L.layerGroup().addTo(_mapInstance);

  updateMapMarkers();
}

async function updateMapMarkers() {
  if (!_mapInstance || !_mapMillMarkers) return;
  _mapMillMarkers.clearLayers();
  _mapCustMarkers.clearLayers();

  try {
    const [mills, quotes, customers] = await Promise.all([
      loadMills(),
      loadLatestQuotes({product: S.mapProduct || undefined}),
      loadCustomers()
    ]);

    // Group quotes by mill
    const quotesByMill = {};
    quotes.forEach(q => {
      if (!quotesByMill[q.mill_name]) quotesByMill[q.mill_name] = [];
      quotesByMill[q.mill_name].push(q);
    });

    // Region colors
    const regionColors = {west: '#5b8af5', central: '#e8734a', east: '#4a9e6e'};

    let millCount = 0;
    mills.forEach(mill => {
      if (!mill.lat || !mill.lon) return;
      const mq = quotesByMill[mill.name] || [];
      if (S.mapProduct && !mq.length) return; // Filter: only show mills with this product

      // Calculate marker size based on volume
      const totalVol = mq.reduce((s, q) => s + (q.volume || 0), 0);
      const totalTls = mq.reduce((s, q) => s + (q.tls || 0), 0);
      const radius = Math.max(8, Math.min(25, 8 + Math.sqrt(totalVol || totalTls * 23) / 2));

      const color = regionColors[mill.region] || '#6e9ecf';

      const marker = L.circleMarker([mill.lat, mill.lon], {
        radius: radius,
        fillColor: color,
        color: '#fff',
        weight: 1,
        fillOpacity: 0.8
      });

      // Build popup
      let popupHtml = `<div style="min-width:200px">
        <strong style="font-size:13px">${mill.name}</strong><br>
        <span style="color:#666">${mill.city || ''} | ${(mill.region||'').toUpperCase()}</span>
        <hr style="margin:6px 0;border-color:#eee">`;

      if (mq.length) {
        popupHtml += '<table style="width:100%;font-size:11px;border-collapse:collapse">';
        popupHtml += '<tr style="color:#888"><th style="text-align:left;padding:2px 4px">Product</th><th style="text-align:right;padding:2px 4px">FOB</th><th style="text-align:right;padding:2px 4px">Vol</th><th style="padding:2px 4px">Ship</th></tr>';
        mq.forEach(q => {
          popupHtml += `<tr>
            <td style="padding:2px 4px;font-weight:500">${q.product}</td>
            <td style="text-align:right;padding:2px 4px;font-family:monospace">$${q.price}</td>
            <td style="text-align:right;padding:2px 4px">${q.volume || '-'}</td>
            <td style="padding:2px 4px;color:#888">${q.ship_window || '-'}</td>
          </tr>`;
        });
        popupHtml += '</table>';
        popupHtml += `<div style="margin-top:4px;color:#888;font-size:10px">Last updated: ${ageLabel(mq[0]?.date)} by ${mq[0]?.trader || '-'}</div>`;
      } else {
        popupHtml += '<div style="color:#888;font-size:11px">No current quotes</div>';
      }
      popupHtml += '</div>';

      marker.bindPopup(popupHtml, {maxWidth: 300});
      marker.addTo(_mapMillMarkers);
      millCount++;
    });

    // Customer markers
    let custCount = 0;
    customers.forEach(cust => {
      if (!cust.lat || !cust.lon) return;
      const marker = L.marker([cust.lat, cust.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:12px;height:12px;background:#c084fc;border:2px solid #fff;border-radius:2px;transform:rotate(45deg)"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        })
      });
      marker.bindPopup(`<strong>${cust.name}</strong><br><span style="color:#666">${cust.destination || ''}</span>`);
      marker.addTo(_mapCustMarkers);
      custCount++;
    });

    const statsEl = document.getElementById('map-stats');
    if (statsEl) statsEl.textContent = `${millCount} mills | ${custCount} customers${S.mapProduct ? ` | Filtered: ${S.mapProduct}` : ''}`;

  } catch (e) {
    showToast('Map error: ' + e.message, 'warn');
  }
}

function resetMapView() {
  if (_mapInstance) {
    _mapInstance.setView([33.5, -90], 5);
  }
}
