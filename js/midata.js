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

  // Auto-replace: remove old quotes for same mill + same date from S.millQuotes
  const clearKeys = new Set();
  quotes.forEach(q => {
    const mill = (q.mill || '').toUpperCase();
    const date = q.date || today();
    if (mill) clearKeys.add(`${mill}|${date}`);
  });
  if (clearKeys.size) {
    S.millQuotes = S.millQuotes.filter(mq => {
      const key = `${(mq.mill || '').toUpperCase()}|${mq.date || ''}`;
      return !clearKeys.has(key);
    });
  }

  // Now push the new quotes
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

  const systemPrompt = `You are an expert lumber industry data parser. Your job is to extract mill pricing quotes with PERFECT ACCURACY.

CRITICAL: Every price, product, length, and mill location MUST be correctly identified. Errors cost real money.

═══════════════════════════════════════════════════════════════════════════════
REFERENCE DATA
═══════════════════════════════════════════════════════════════════════════════
KNOWN MILLS: ${knownMills.join(', ')}
KNOWN PRODUCTS: ${MI_PRODUCTS.join(', ')}
PIECES PER UNIT (PPU): ${ppuInfo}
MBF PER UNIT (at RL 14' avg): ${mbfPerUnit}
MILL CITIES: ${cityRef}

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT — JSON ARRAY ONLY
═══════════════════════════════════════════════════════════════════════════════
[{
  "mill": "Company Name - City",
  "product": "2x4#2",
  "price": 450,
  "length": "RL",
  "volume": 23.5,
  "tls": 0,
  "shipWindow": "",
  "notes": "",
  "city": "City, ST"
}]

═══════════════════════════════════════════════════════════════════════════════
⚠️ CRITICAL: MILL IDENTIFICATION ⚠️
═══════════════════════════════════════════════════════════════════════════════
Multi-location companies MUST use "Company - City" format:
• "GP" or "Georgia Pacific" alone is WRONG — need "Georgia-Pacific - Gurdon" etc.
• "Canfor" alone is WRONG — need "Canfor - DeQuincy" or "Canfor - Urbana" etc.
• "West Fraser" alone is WRONG — need "West Fraser - Huttig" etc.

WHERE TO FIND THE CITY:
1. Sheet name: "=== SHEET: Graceville ===" → city is Graceville
2. File header/title: "GP Gurdon Price List" → city is Gurdon
3. Column headers with city names: "Graceville | Bristol" → two separate mills
4. Letterhead/logo area: Often shows full address
5. Email signature: "John Smith, Georgia-Pacific Gurdon"

NEVER leave city empty. If truly unknown, use the company HQ or first known location.

═══════════════════════════════════════════════════════════════════════════════
⚠️ CRITICAL: MULTI-LOCATION SPREADSHEETS ⚠️
═══════════════════════════════════════════════════════════════════════════════

PATTERN 1 — SEPARATE SHEETS:
"=== SHEET: Graceville ===" and "=== SHEET: Bristol ===" are DIFFERENT mills.
Create entries with appropriate mill name for each sheet.

PATTERN 2 — CITY COLUMNS (most common, most error-prone):
Header: "Product | Length | Price | Graceville | Bristol | Monroeville"
Data:   "2x4#2  | 10'    | 445   | 48         | 22      |            "

This means:
• 48 units of 2x4#2 10' @ $445 at Graceville mill
• 22 units of 2x4#2 10' @ $445 at Bristol mill
• Monroeville has NO availability (empty cell)

Create SEPARATE quote objects for Graceville AND Bristol. Do NOT create one for Monroeville (no volume).

PATTERN 3 — SIDE-BY-SIDE PRODUCTS:
Some sheets show TWO products per row with a blank column separator:

Header: "2x4 #2 PRIME |     | Graceville | Bristol | | 2x6 #2 PRIME |     | Graceville | Bristol"
Data:   "10'          | 445 | 48         |         | | 10'          | 460 | 18         |         "

Parse as:
• 2x4#2 10' $445 with 48 units at Graceville (Bristol empty = skip)
• 2x6#2 10' $460 with 18 units at Graceville (Bristol empty = skip)

The blank column(s) "| |" separate the two product sections.

PATTERN 4 — STACKED ROWS BY LOCATION:
Row 1: "Graceville"
Row 2: "2x4#2 | 10' | 445 | 48"
Row 3: "2x4#2 | 12' | 450 | 22"
Row 4: "Bristol"
Row 5: "2x4#2 | 10' | 442 | 35"

The location applies to all rows until the next location header.

═══════════════════════════════════════════════════════════════════════════════
⚠️ CRITICAL: PRICE COLUMN IDENTIFICATION ⚠️
═══════════════════════════════════════════════════════════════════════════════
Prices are in $/MBF. Look for columns labeled:
• "Price", "FOB", "$/MBF", "MBF Price", "Cost"
• Numbers in $300-$700 range for standard SYP

DO NOT confuse with:
• Units/availability (smaller numbers like 5, 22, 48)
• Pieces per unit (208, 128, 96, etc.)
• Dates (1/15, 2/28)

PRICE SANITY CHECK:
• $300-$700/MBF is normal for SYP
• < $100 is probably units, not price
• > $1000 might be per-unit pricing (divide by MBF-per-unit to convert)

═══════════════════════════════════════════════════════════════════════════════
VOLUME CALCULATIONS — ALWAYS IN MBF
═══════════════════════════════════════════════════════════════════════════════
Quantity columns show UNITS unless labeled "TL", "Loads", or "Trucks".

FORMULA: volume = units × MBF_per_unit × (actual_length / 14)

EXAMPLES:
• 48 units of 2x4 at 10' → 48 × 1.94 × (10/14) = 66.5 MBF
• 22 units of 2x4 at 12' → 22 × 1.94 × (12/14) = 36.6 MBF
• 60 units of 2x6 at 14' → 60 × 1.79 × (14/14) = 107.4 MBF
• 50 units of 2x8 at 16' → 50 × 1.79 × (16/14) = 102.3 MBF
• 3 units of 2x4 RL → 3 × 1.94 = 5.82 MBF (RL = 14' average)

TRUCKLOADS: If column says "TL"/"Loads"/"Trucks": tls=N, volume=N×23

NO QUANTITY: If no availability column exists, set volume=0, tls=0

═══════════════════════════════════════════════════════════════════════════════
LENGTH HANDLING
═══════════════════════════════════════════════════════════════════════════════
• "10", "10'", "10ft" → length="10"
• "Random", "RL", "Tally", "Mixed" → length="RL"
• No length column → length="RL"
• "8-16" (range) → Create separate entries OR use "RL" if mixed truck

═══════════════════════════════════════════════════════════════════════════════
PRODUCT NORMALIZATION
═══════════════════════════════════════════════════════════════════════════════
• "#2 PRIME", "#2 Prime", "#2 PR", "No. 2" → "#2"
• "#3 GM", "#3 Green", "Std/Btr" → "#3"
• "MSR 2400", "2400f MSR" → "MSR"
• Format: "2x4#2", "2x6#3", "2x8 MSR"

═══════════════════════════════════════════════════════════════════════════════
COMPLETENESS REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════
• Extract EVERY line item that has a price
• Skip rows with no price (header rows, subtotals, etc.)
• Skip location columns with empty/zero availability
• Include notes for special conditions (e.g., "Weekly production", "Spot only")

Return ONLY the JSON array, no markdown, no explanation.`;

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

// Vision-based parsing for scanned PDFs — sends page images to Claude vision API
async function miAiParseImages(images) {
  if (!S.apiKey) {
    showToast('Set your Claude API key in Settings first', 'warn');
    return [];
  }

  const knownMills = [...MILLS];
  try {
    const dbMills = await miLoadMills();
    dbMills.forEach(m => { if (!knownMills.includes(m.name)) knownMills.push(m.name); });
  } catch (e) {}

  const ppuInfo = Object.entries(MI_PPU).map(([k,v]) => `${k}: ${v} pcs/unit`).join(', ');
  const mbfPerUnit = Object.entries(MI_PPU).map(([dim,ppu]) => {
    const parts = dim.match(/(\d+)x(\d+)/);
    if (!parts) return null;
    const thick = parseInt(parts[1]), wide = parseInt(parts[2]);
    const bfPerPc = (thick * wide * 14) / 12;
    const mbf = (ppu * bfPerPc / 1000).toFixed(2);
    return `${dim}: ${mbf} MBF/unit`;
  }).filter(Boolean).join(', ');
  const cityRef = Object.entries(MI_MILL_CITIES).map(([c,s]) => `${c.replace(/\b\w/g,l=>l.toUpperCase())}=${s}`).join(', ');

  const systemPrompt = `You are an expert lumber industry data parser. Extract mill pricing quotes from scanned price list images with PERFECT ACCURACY.

CRITICAL: Every price, product, length, and mill location MUST be correctly identified. Errors cost real money.

═══════════════════════════════════════════════════════════════════════════════
REFERENCE DATA
═══════════════════════════════════════════════════════════════════════════════
KNOWN MILLS: ${knownMills.join(', ')}
KNOWN PRODUCTS: ${MI_PRODUCTS.join(', ')}
PIECES PER UNIT (PPU): ${ppuInfo}
MBF PER UNIT (at RL 14' avg): ${mbfPerUnit}
MILL CITIES: ${cityRef}

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT — JSON ARRAY ONLY
═══════════════════════════════════════════════════════════════════════════════
[{
  "mill": "Company Name - City",
  "product": "2x4#2",
  "price": 450,
  "length": "RL",
  "volume": 0,
  "tls": 0,
  "shipWindow": "",
  "notes": "",
  "city": "City, ST"
}]

═══════════════════════════════════════════════════════════════════════════════
⚠️ CRITICAL: MILL IDENTIFICATION FROM IMAGE ⚠️
═══════════════════════════════════════════════════════════════════════════════
1. READ THE LETTERHEAD/LOGO: Company name is usually at top of price sheet
2. LOOK FOR ADDRESS/LOCATION: City name often appears below company name
3. Multi-location companies MUST use "Company - City" format:
   • "GP" → "Georgia-Pacific - [City from letterhead]"
   • "Canfor" → "Canfor - [City from letterhead]"
   • "West Fraser" → "West Fraser - [City from letterhead]"
4. If multiple locations shown in columns, create SEPARATE entries for each

═══════════════════════════════════════════════════════════════════════════════
⚠️ CRITICAL: TABLE STRUCTURE RECOGNITION ⚠️
═══════════════════════════════════════════════════════════════════════════════
TYPICAL PRICE SHEET LAYOUTS:

LAYOUT 1 — Products as rows, lengths as columns:
         | 8'  | 10' | 12' | 14' | 16' |
2x4 #2   | 440 | 445 | 450 | 455 | 460 |
2x6 #2   | 445 | 450 | 455 | 460 | 465 |

LAYOUT 2 — Products as rows, single "RL" price:
Product    | Price | Pcs/Pack
2x4 #2 RL  | 450   | 208
2x6 #2 RL  | 455   | 128

LAYOUT 3 — Length as rows within product sections:
2x4 #2 PRIME
  10'  | 445
  12'  | 450
  14'  | 455
2x6 #2 PRIME
  10'  | 450
  ...

LAYOUT 4 — Multi-location columns:
Product | Length | Price | Graceville | Bristol |
2x4 #2  | 10'    | 445   | 48 units   | 22 units|

═══════════════════════════════════════════════════════════════════════════════
PRICE IDENTIFICATION
═══════════════════════════════════════════════════════════════════════════════
• Prices are in $/MBF, typically $300-$700 for SYP
• Look for columns labeled "Price", "FOB", "$/MBF"
• DO NOT confuse with Pcs/Pack (208, 128, 96, etc.)
• DO NOT confuse with unit counts (small numbers like 5, 22, 48)

═══════════════════════════════════════════════════════════════════════════════
PRODUCT NORMALIZATION
═══════════════════════════════════════════════════════════════════════════════
• "#2 PRIME", "#2 Prime", "#2 PR", "No. 2" → "#2"
• "#3 GM", "#3 Green", "Std/Btr" → "#3"
• "MSR 2400", "2400f MSR" → "MSR"
• Format as: "2x4#2", "2x6#3", "2x8 MSR"

═══════════════════════════════════════════════════════════════════════════════
LENGTH HANDLING
═══════════════════════════════════════════════════════════════════════════════
• Read lengths from column headers OR row labels
• "10", "10'", "10 ft" → length="10"
• "Random", "RL", "Tally" → length="RL"
• No length specified → length="RL"

═══════════════════════════════════════════════════════════════════════════════
VOLUME (for price-only sheets, usually 0)
═══════════════════════════════════════════════════════════════════════════════
• Most scanned price sheets are PRICE-ONLY (no availability)
• Set volume=0, tls=0 unless availability column clearly exists
• If availability shown: convert units to MBF using formula above

═══════════════════════════════════════════════════════════════════════════════
COMPLETENESS
═══════════════════════════════════════════════════════════════════════════════
• Extract EVERY product × length combination with a price
• Create SEPARATE entries for each (don't combine)
• Include notes for special conditions visible on sheet

Return ONLY the JSON array, no markdown, no explanation.`;

  // Build vision content: image blocks + text prompt
  const content = [];
  for (const img of images) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.media_type, data: img.data }
    });
  }
  content.push({
    type: 'text',
    text: 'Parse this scanned mill price list into structured quotes. Extract every product/grade/length with a price.'
  });

  const statusEl = document.getElementById('mi-parse-status');

  let res = await fetch('https://api.anthropic.com/v1/messages', {
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
      messages: [{ role: 'user', content }]
    })
  });

  // Retry on rate limit
  for (let attempt = 1; attempt <= 3 && res.status === 429; attempt++) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '0');
    const waitMs = Math.max((retryAfter || attempt * 15) * 1000, attempt * 15000);
    if (statusEl) statusEl.textContent = `Rate limited — waiting ${Math.round(waitMs/1000)}s before retry ${attempt}/3...`;
    await new Promise(r => setTimeout(r, waitMs));
    res = await fetch('https://api.anthropic.com/v1/messages', {
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
        messages: [{ role: 'user', content }]
      })
    });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${res.status}`);
  }

  const data = await res.json();
  const reply = data.content?.[0]?.text || '';

  // Parse JSON from response (same logic as text parser)
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
  return quotes.map(q => ({...q, source: 'ai-vision', date: today(), trader: S.trader}));
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
