// SYP Analytics - Mill Intel Data Layer (REST API)
// All paths prefixed with /api/mi/

const MI_API = '';

async function miApiGet(path) {
  const res = await fetch(MI_API + path);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function miApiPost(path, data) {
  const res = await fetch(MI_API + path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

async function miApiPut(path, data) {
  const res = await fetch(MI_API + path, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function miApiDelete(path) {
  const res = await fetch(MI_API + path, {method: 'DELETE'});
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function miApiUpload(path, file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(MI_API + path, {method: 'POST', body: formData});
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Upload error: ${res.status}`);
  }
  return res.json();
}

// Convenience wrappers

async function miLoadMills() { return miApiGet('/api/mi/mills'); }

async function miLoadLatestQuotes(filters = {}) {
  const params = new URLSearchParams();
  if (filters.product) params.set('product', filters.product);
  if (filters.region) params.set('region', filters.region);
  if (filters.since) params.set('since', filters.since);
  else if (typeof _miMatrixCutoff !== 'undefined' && _miMatrixCutoff) params.set('since', _miMatrixCutoff);
  return miApiGet('/api/mi/quotes/latest?' + params);
}

async function miLoadQuoteMatrix(detail = '') {
  const params = new URLSearchParams();
  if (detail) params.set('detail', detail);
  if (typeof _miMatrixCutoff !== 'undefined' && _miMatrixCutoff) params.set('since', _miMatrixCutoff);
  return miApiGet('/api/mi/quotes/matrix?' + params);
}

async function miLoadQuoteHistory(mill, product, days = 90) {
  const params = new URLSearchParams();
  if (mill) params.set('mill', mill);
  if (product) params.set('product', product);
  params.set('days', days);
  return miApiGet('/api/mi/quotes/history?' + params);
}

async function miLoadAllQuotes(filters = {}) {
  const params = new URLSearchParams();
  if (filters.mill) params.set('mill', filters.mill);
  if (filters.product) params.set('product', filters.product);
  if (filters.trader) params.set('trader', filters.trader);
  if (filters.since) params.set('since', filters.since);
  if (filters.limit) params.set('limit', filters.limit);
  return miApiGet('/api/mi/quotes?' + params);
}

async function miSubmitQuotes(quotes) {
  // Normalize mill names and fill in city/state before submission
  if (typeof normalizeMillName === 'function') {
    quotes.forEach(q => {
      const result = normalizeMillName(q.mill, q.city);
      q.mill = result.name;
      if (result.city && !q.city) q.city = result.city;
      if (!q.shipWindow && !q.ship_window) q.shipWindow = 'Prompt';
    });
  }
  const result = await miApiPost('/api/mi/quotes', quotes);
  // Also push into S.millQuotes so they sync to Supabase cloud
  quotes.forEach(q => {
    S.millQuotes.push({
      id: q.id || genId(),
      mill: q.mill,
      product: q.product,
      price: q.price,
      length: q.length || 'RL',
      volume: q.volume || 0,
      tls: q.tls || 0,
      shipWindow: q.shipWindow || q.ship_window || 'Prompt',
      city: q.city || '',
      date: q.date || today(),
      enteredBy: q.enteredBy || S.trader,
      createdAt: new Date().toISOString(),
      source: q.source || 'mi-intake'
    });
  });
  saveAllLocal();
  return result;
}

async function miLoadSignals(product) {
  const params = product ? `?product=${product}` : '';
  return miApiGet('/api/mi/intel/signals' + params);
}

async function miLoadRecommendations(product) {
  const params = product ? `?product=${product}` : '';
  return miApiGet('/api/mi/intel/recommendations' + params);
}

async function miLoadIntelTrends(product, days = 90) {
  const params = new URLSearchParams({days});
  if (product) params.set('product', product);
  return miApiGet('/api/mi/intel/trends?' + params);
}

async function miLoadCustomers() { return miApiGet('/api/mi/customers'); }

async function miLoadLanes() { return miApiGet('/api/mi/lanes'); }

async function miGetMileage(origin, dest) {
  return miApiPost('/api/mi/mileage', {origin, dest});
}

// AI parsing (client-side call to Claude API)
async function miAiParseMillPriceList(text) {
  if (!S.apiKey) {
    showToast('Set your Claude API key in Settings first', 'warn');
    return [];
  }

  const knownMills = [...MILLS];// Keep location-level names for AI parsing (Company - City format)
  try {
    const dbMills = await miLoadMills();
    dbMills.forEach(m => { if (!knownMills.includes(m.name)) knownMills.push(m.name); });
  } catch (e) {}

  const ppuInfo = Object.entries(MI_PPU).map(([k,v]) => `${k}: ${v} pcs/unit`).join(', ');
  // Precompute MBF per unit at RL (14' avg) so AI just multiplies
  const mbfPerUnit = Object.entries(MI_PPU).map(([dim,ppu]) => {
    const parts = dim.match(/(\d+)x(\d+)/);
    if (!parts) return null;
    const thick = parseInt(parts[1]), wide = parseInt(parts[2]);
    const bfPerPc = (thick * wide * 14) / 12;
    const mbf = (ppu * bfPerPc / 1000).toFixed(2);
    return `${dim}: ${mbf} MBF/unit`;
  }).filter(Boolean).join(', ');
  const cityRef = Object.entries(MI_MILL_CITIES).map(([c,s]) => `${c.replace(/\b\w/g,l=>l.toUpperCase())}=${s}`).join(', ');

  const systemPrompt = `You are a lumber industry data parser. Extract mill pricing quotes from the provided text.

KNOWN MILLS: ${knownMills.join(', ')}
KNOWN PRODUCTS: ${MI_PRODUCTS.join(', ')}
PIECES PER UNIT: ${ppuInfo}
MBF PER UNIT (at RL 14' avg): ${mbfPerUnit}

Return a JSON array of quote objects. Each object MUST have:
{
  "mill": "Mill Name - Location",
  "product": "e.g. 2x4#2, 2x6#3",
  "price": 450,
  "length": "RL or specific like 16",
  "volume": 23.5,
  "tls": 0,
  "shipWindow": "",
  "notes": "",
  "city": "City, ST"
}

CRITICAL PARSING RULES:

1. MILL ORIGIN / CITY DETECTION:
   - ALWAYS determine where the mill is located
   - Known SYP mill cities: ${cityRef}
   - Key multi-location companies use "Company - City" format
   - NEVER leave city empty

2. MULTI-LOCATION SPREADSHEETS:
   - Separate sheets (=== SHEET: name ===) are separate mill locations
   - Within a sheet, column headers like "Graceville" and "Bristol" mean separate mill locations
   - Create SEPARATE quote entries for each location that has units available
   - SIDE-BY-SIDE LAYOUT: Some sheets have TWO products on the same row separated by blank columns.
     Example: header row "2x4 #2 PRIME | FULL PACKS | Graceville | Bristol | | 2x6 #2 PRIME | | Graceville | Bristol"
     Data row: "10' | 445 | 48 | | | 10' | 460 | 18 | "
     This means: 2x4#2 at 10' $445 with 48 units at Graceville, AND 2x6#2 at 10' $460 with 18 units at Graceville
     The numbers after the price are UNITS at each location (Graceville column, then Bristol column)

3. RANDOM LENGTHS / TALLIES:
   - No length column → length="RL"
   - "Random" or "RL" or "Tally" → length="RL"

4. VOLUME & AVAILABILITY — DEFAULT IS UNITS:
   Quantity columns (Avail, Qty, Units, etc.) are in UNITS unless explicitly labeled otherwise.

   CONVERT UNITS TO MBF using the precomputed MBF-PER-UNIT table above:
     volume = number_of_units × MBF_per_unit_for_that_product

   For specific lengths (not RL), scale: volume = units × MBF_per_unit × (actual_length / 14)

   Examples (MBF/unit values are at RL=14' avg, scale for specific lengths):
     48 units of 2x4 at 10' → 48 × 1.94 × (10/14) = 66.6 MBF
     22 units of 2x4 at 12' → 22 × 1.94 × (12/14) = 36.6 MBF
     60 units of 2x6 at 14' → 60 × 1.79 × (14/14) = 107.4 MBF
     50 units of 2x8 at 12' → 50 × 1.79 × (12/14) = 76.7 MBF
     3 units of 2x4 RL      → 3 × 1.94 = 5.82 MBF (small units = small volume, that's correct)

   ONLY if header explicitly says "TL", "Loads", or "Trucks": tls=N, volume=N*23
   If NO quantity column exists: set volume=0, tls=0 (price-only list)

5. PRICES: FOB mill in $/MBF. Typical SYP prices range $300-$700/MBF. Do NOT convert.

6. PRODUCTS: #2 PRIME=#2, #3 GM=#3, MSR 2400=MSR

7. MILL NAMING: "Company - Location" for multi-mill companies

8. COMPLETENESS: Extract EVERY line item with a price

Return ONLY the JSON array, no explanation.`;

  const sheetChunks = miSplitIntoSheets(text);
  let allQuotes = [];

  for (let i = 0; i < sheetChunks.length; i++) {
    const chunk = sheetChunks[i];
    if (chunk.text.trim().length < 20) continue;

    const statusEl = document.getElementById('mi-parse-status');
    if (statusEl && sheetChunks.length > 1) {
      statusEl.textContent = `Parsing sheet ${i+1}/${sheetChunks.length}${chunk.name ? ' (' + chunk.name + ')' : ''}...`;
    }

    if (i > 0) await new Promise(r => setTimeout(r, 5000));

    try {
      const chunkQuotes = await miCallClaudeForParsing(systemPrompt, chunk.text);
      allQuotes = allQuotes.concat(chunkQuotes);
    } catch (e) {
      console.warn(`MI: Failed to parse chunk ${i+1} (${chunk.name}):`, e.message);
      showToast(`Warning: Sheet "${chunk.name || i+1}" parse failed`, 'warn');
    }
  }

  return allQuotes.map(q => ({...q, source: 'ai', date: today(), trader: S.trader}));
}

function miSplitIntoSheets(text) {
  const sheetMarker = /^=== SHEET:\s*(.+?)\s*===$/gm;
  const markers = [];
  let m;
  while ((m = sheetMarker.exec(text)) !== null) {
    markers.push({name: m[1], index: m.index});
  }
  if (markers.length <= 1) {
    return [{name: '', text: text}];
  }
  const chunks = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index;
    const end = i + 1 < markers.length ? markers[i+1].index : text.length;
    chunks.push({name: markers[i].name, text: text.slice(start, end)});
  }
  return chunks;
}

async function miCallClaudeForParsing(systemPrompt, text, retries = 3) {
  const makeRequest = async () => {
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': S.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{role: 'user', content: `Parse the following mill price list into structured quotes:\n\n${text}`}]
      })
    });
  };

  let res = await makeRequest();

  for (let attempt = 1; attempt <= retries && res.status === 429; attempt++) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '0');
    const waitMs = Math.max((retryAfter || attempt * 15) * 1000, attempt * 15000);
    const statusEl = document.getElementById('mi-parse-status');
    if (statusEl) statusEl.textContent = `Rate limited — waiting ${Math.round(waitMs/1000)}s before retry ${attempt}/${retries}...`;
    await new Promise(r => setTimeout(r, waitMs));
    res = await makeRequest();
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${res.status}`);
  }

  const data = await res.json();
  const reply = data.content?.[0]?.text || '';
  let jsonStr = reply;
  const jsonMatch = reply.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  } else {
    const openMatch = reply.match(/```(?:json)?\s*\n?([\s\S]*)/);
    if (openMatch) jsonStr = openMatch[1];
  }
  jsonStr = jsonStr.trim().replace(/,\s*$/, '');

  let quotes;
  try {
    quotes = JSON.parse(jsonStr);
  } catch (e) {
    const lastComplete = jsonStr.lastIndexOf('}');
    if (lastComplete > 0) {
      for (let pos = lastComplete; pos > 0; pos = jsonStr.lastIndexOf('}', pos - 1)) {
        try {
          quotes = JSON.parse(jsonStr.slice(0, pos + 1) + ']');
          break;
        } catch (e2) {}
      }
    }
    if (!quotes) return [];
  }

  if (!Array.isArray(quotes)) return [];
  return quotes;
}
