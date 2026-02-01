// SYP Mill Intelligence - Data Layer (REST API)

const API = '';  // Same origin

async function apiGet(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function apiPost(path, data) {
  const res = await fetch(API + path, {
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

async function apiPut(path, data) {
  const res = await fetch(API + path, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(API + path, {method: 'DELETE'});
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Upload file via FormData
async function apiUpload(path, file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(API + path, {method: 'POST', body: formData});
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Upload error: ${res.status}`);
  }
  return res.json();
}

// ----- Convenience wrappers -----

async function loadMills() {
  return apiGet('/api/mills');
}

async function loadLatestQuotes(filters = {}) {
  const params = new URLSearchParams();
  if (filters.product) params.set('product', filters.product);
  if (filters.region) params.set('region', filters.region);
  return apiGet('/api/quotes/latest?' + params);
}

async function loadQuoteMatrix() {
  return apiGet('/api/quotes/matrix');
}

async function loadQuoteHistory(mill, product, days = 90) {
  const params = new URLSearchParams();
  if (mill) params.set('mill', mill);
  if (product) params.set('product', product);
  params.set('days', days);
  return apiGet('/api/quotes/history?' + params);
}

async function loadAllQuotes(filters = {}) {
  const params = new URLSearchParams();
  if (filters.mill) params.set('mill', filters.mill);
  if (filters.product) params.set('product', filters.product);
  if (filters.trader) params.set('trader', filters.trader);
  if (filters.since) params.set('since', filters.since);
  if (filters.limit) params.set('limit', filters.limit);
  return apiGet('/api/quotes?' + params);
}

async function submitQuotes(quotes) {
  return apiPost('/api/quotes', quotes);
}

async function loadSignals(product) {
  const params = product ? `?product=${product}` : '';
  return apiGet('/api/intel/signals' + params);
}

async function loadRecommendations(product) {
  const params = product ? `?product=${product}` : '';
  return apiGet('/api/intel/recommendations' + params);
}

async function loadIntelTrends(product, days = 90) {
  const params = new URLSearchParams({days});
  if (product) params.set('product', product);
  return apiGet('/api/intel/trends?' + params);
}

async function loadCustomers() {
  return apiGet('/api/customers');
}

async function loadLanes() {
  return apiGet('/api/lanes');
}

async function getMileage(origin, dest) {
  return apiPost('/api/mileage', {origin, dest});
}

// AI parsing (client-side call to Claude API)
async function aiParseMillPriceList(text) {
  if (!S.apiKey) {
    showToast('Set your Claude API key in Settings first', 'warn');
    return [];
  }

  const knownMills = [...MILLS];
  try {
    const dbMills = await loadMills();
    dbMills.forEach(m => { if (!knownMills.includes(m.name)) knownMills.push(m.name); });
  } catch (e) {}

  const ppuInfo = Object.entries(PPU).map(([k,v]) => `${k}: ${v} pcs/unit`).join(', ');

  // Build city reference from MILL_CITIES for AI prompt
  const cityRef = Object.entries(MILL_CITIES).map(([c,s]) => `${c.replace(/\b\w/g,l=>l.toUpperCase())}=${s}`).join(', ');

  const systemPrompt = `You are a lumber industry data parser. Extract mill pricing quotes from the provided text.

KNOWN MILLS: ${knownMills.join(', ')}
KNOWN PRODUCTS: ${PRODUCTS.join(', ')}
PIECES PER UNIT (pcs per bundle/unit): ${ppuInfo}

Return a JSON array of quote objects. Each object MUST have:
{
  "mill": "Mill Name - Location (e.g. Rex Lumber - Graceville, Lumberton Lumber)",
  "product": "e.g. 2x4#2, 2x6#3, 2x4 MSR",
  "price": 450,
  "length": "RL or specific like 16",
  "volume": 23.5,
  "tls": 0,
  "shipWindow": "",
  "notes": "grade detail if relevant",
  "city": "City, ST (e.g. Lumberton, MS or Troy, AL)"
}

CRITICAL PARSING RULES:

1. MILL ORIGIN / CITY DETECTION:
   - ALWAYS determine where the mill is located. Look for city/state clues EVERYWHERE:
     * The mill name itself (e.g. "Lumberton Lumber" → Lumberton, MS; "Hattiesburg Lumber" → Hattiesburg, MS)
     * Email headers, subject lines, company names, letterheads, addresses
     * Sheet names, section headers, footer text
     * Phone area codes (e.g. 601=MS, 334=AL, 850=FL, 870=AR, 337=LA, 903=TX)
     * Any mention of city, state, zip code anywhere in the text
   - Known SYP mill cities (from SPIB Buyers Guide): ${cityRef}
   - Key multi-location companies (use "Company - City" format):
     * Canfor Southern Pine: Fulton AL, Axis AL, Urbana AR, El Dorado AR, DeRidder LA, Thomasville GA, Moultrie GA, Graham NC, Camden SC, Conway SC
     * Georgia-Pacific (GP): Talladega AL, Frisco City AL, Gurdon AR, Albany GA, Warrenton GA, Taylorsville MS, Dudley NC, Prosperity SC, Camden TX, Diboll TX, Pineland TX
     * Interfor: Fayette AL, Monticello AR, DeQuincy LA, Georgetown SC, Preston GA, Perry GA, Baxley GA, Swainsboro GA, Thomaston GA, Eatonton GA
     * West Fraser: Opelika AL, Russellville AR, Huttig AR, Leola AR, Joyce LA, Lufkin TX, Henderson TX, New Boston TX, Blackshear GA, Dudley GA, Fitzgerald GA
     * Weyerhaeuser: Dierks AR, Millport AL, Dodson LA, Holden LA, Philadelphia MS, Bruce MS, Magnolia MS, Grifton NC, Plymouth NC
     * Rex Lumber: Graceville FL, Bristol FL, Troy AL, Brookhaven MS
     * PotlatchDeltic: Ola AR, Waldo AR, Warren AR
     * Idaho Forest Group (IFG): Lumberton MS
   - If the city is in the mill name, USE IT (e.g. "Lumberton" → "Lumberton, MS")
   - If you cannot find any city info, check the mill name for a city match from the list above
   - NEVER leave city empty — make your best inference from available context

2. MULTI-LOCATION SPREADSHEETS:
   - Sheets/sections are often organized BY MILL LOCATION (e.g. "FLORIDA MILLS", "TROY, AL", "BROOKHAVEN, MS")
   - Column headers like "Graceville" and "Bristol" mean separate mill locations
   - If a row shows: length | price | qty_location1 | qty_location2, create SEPARATE entries for each location
   - Example: "10' | 445 | 48 | " with headers "Graceville | Bristol" → one entry for Rex Lumber - Graceville at $445 with 48 units
   - Example: "12' | 445 | 22 | 14" → TWO entries: Graceville=22 units, Bristol=14 units, same price $445

3. RANDOM LENGTHS / TALLIES:
   - Mill lists often show a product + price WITHOUT specifying individual lengths
   - This means "RANDOM LENGTHS" (RL) — a mix of 8' through 20' lengths
   - Examples of random tally formats:
     * "2x4#2 — $445" with no length column → length="RL"
     * A table with just product/price/volume and no length → length="RL"
     * "Random" or "RL" or "Tally" or "Mixed" or "Assorted" → length="RL"
     * A single price for a product without length breakdown → length="RL"
   - When length is "RL", calculate volume using 14' as the average length
   - If a list has BOTH specific lengths AND a tally/total row, capture both:
     * Individual lengths as their specific length
     * The tally/total row as "RL" (but don't double-count — only if it's clearly a separate offering)
   - If a product shows ONLY a price and trucks/units with NO length specified at all, it is definitely RL
   - Some lists are entirely random tallies — every product is just product + price + volume

4. VOLUME CONVERSION (UNITS → MBF):
   - Numbers next to prices are often UNITS (bundles/packs), NOT MBF
   - However, some mills quote in TRUCKS (TL). Look for context clues:
     * "trucks", "TL", "loads" → these are truckloads, set tls field, volume ≈ tls × 23 MBF
     * "units", "packs", "bundles", or just numbers → these are units, convert to MBF
     * Very small numbers (1-10) next to large prices are likely TRUCKS
     * Large numbers (20+) are likely UNITS
   - Convert units to MBF: volume_mbf = units × pcs_per_unit × board_footage_per_piece / 1000
   - Board footage per piece = (thickness_inches × width_inches × length_feet) / 12
   - PPU reference: 2x4=208, 2x6=128, 2x8=96, 2x10=80, 2x12=64
   - If length is "RL" (random lengths), use 14' as average for MBF calculation
   - Round volume to 1 decimal place

5. PRICES:
   - Prices are FOB mill in $/MBF (this is standard — do NOT convert)
   - "PTS +30" or similar means "priced to sell, add $30 to base" — set price=0 and put "PTS +30" in notes
   - Ignore rows where price is 0 or non-numeric UNLESS they have volume (still capture with notes)

6. PRODUCTS:
   - "#2 PRIME" or "#2P" = #2 (premium grade 2, still grade 2)
   - "#2C" = #2 (common grade 2, still grade 2)
   - "#1 Common" or "#1C" = #1
   - "#3 GM" = #3
   - "#4" = #3 (lump with grade 3 for our purposes)
   - "MSR 2400" = MSR
   - "#1P" = #1
   - "#2S" (studs) = #2 with stud length noted
   - "DSS" = MSR variant, note as MSR
   - Products: 2x4#2, 2x6#2, 2x8#2, 2x10#2, 2x12#2, 2x4#3, 2x6#3, 2x8#3
   - Also capture: 2x4#1, 2x6#1, 2x8#1, 2x10#1, 2x12#1, 2x4 MSR, 2x6 MSR, 4x4, etc.

7. MILL NAMING:
   - Use "Company - Location" format whenever the company has multiple mills
   - If the mill only has one location, just use the company name (e.g. "Lumberton Lumber")
   - Match to known mills when possible
   - EVERY entry must have a specific mill name, never generic

8. COMPLETENESS:
   - Extract EVERY line item with a price, even if volume is 0
   - Create separate entries for each length of each product at each location
   - Do NOT skip any sheets or sections
   - Do NOT aggregate or combine entries — one row per length per product per location

Return ONLY the JSON array, no explanation.`;

  // Split text into chunks by sheet markers to avoid token limits
  // Sheets are separated by "=== SHEET: name ===" markers from the Excel parser
  const sheetChunks = splitIntoSheets(text);

  let allQuotes = [];
  for (let i = 0; i < sheetChunks.length; i++) {
    const chunk = sheetChunks[i];
    if (chunk.text.trim().length < 20) continue; // skip empty chunks

    const statusEl = document.getElementById('parse-status');
    if (statusEl && sheetChunks.length > 1) {
      statusEl.textContent = `Parsing sheet ${i+1}/${sheetChunks.length}${chunk.name ? ' (' + chunk.name + ')' : ''}...`;
    }

    // Add delay between chunks to avoid API rate limits (8k output tokens/min limit)
    if (i > 0) await new Promise(r => setTimeout(r, 5000));

    try {
      const chunkQuotes = await callClaudeForParsing(systemPrompt, chunk.text);
      allQuotes = allQuotes.concat(chunkQuotes);
    } catch (e) {
      console.warn(`Failed to parse chunk ${i+1} (${chunk.name}):`, e.message);
      showToast(`Warning: Sheet "${chunk.name || i+1}" parse failed — continuing with others`, 'warn');
    }
  }

  return allQuotes.map(q => ({...q, source: 'ai', date: today(), trader: S.trader}));
}

// Split text into per-sheet chunks for separate API calls
function splitIntoSheets(text) {
  const sheetMarker = /^=== SHEET:\s*(.+?)\s*===$/gm;
  const markers = [];
  let m;
  while ((m = sheetMarker.exec(text)) !== null) {
    markers.push({name: m[1], index: m.index});
  }
  if (markers.length <= 1) {
    // No sheet markers or just one — send as single chunk
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

// Single Claude API call for parsing a chunk of text (with retry for rate limits)
async function callClaudeForParsing(systemPrompt, text, retries = 3) {
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

  // Retry on rate limit (429) with exponential backoff
  for (let attempt = 1; attempt <= retries && res.status === 429; attempt++) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '0');
    const waitMs = Math.max((retryAfter || attempt * 15) * 1000, attempt * 15000);
    const statusEl = document.getElementById('parse-status');
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
  const wasTruncated = data.stop_reason === 'max_tokens';
  if (wasTruncated) console.log('Note: AI response was truncated (max_tokens reached). Will attempt repair.');
  let jsonStr = reply;
  // Try complete code block first, then truncated (no closing ```)
  const jsonMatch = reply.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  } else {
    // Truncated code block — strip opening ```json
    const openMatch = reply.match(/```(?:json)?\s*\n?([\s\S]*)/);
    if (openMatch) jsonStr = openMatch[1];
  }
  jsonStr = jsonStr.trim();

  // Remove trailing commas before ] (common in truncated JSON)
  jsonStr = jsonStr.replace(/,\s*$/, '');

  let quotes;
  try {
    quotes = JSON.parse(jsonStr);
  } catch (e) {
    // Try to repair truncated JSON — find the last complete object
    const lastComplete = jsonStr.lastIndexOf('}');
    if (lastComplete > 0) {
      // Try progressively shorter slices
      for (let pos = lastComplete; pos > 0; pos = jsonStr.lastIndexOf('}', pos - 1)) {
        try {
          quotes = JSON.parse(jsonStr.slice(0, pos + 1) + ']');
          break;
        } catch (e2) {}
      }
    }
    if (!quotes) {
      console.warn('AI returned invalid JSON for chunk. Raw:', reply.slice(0, 300));
      return []; // Skip this chunk rather than failing entirely
    }
  }

  if (!Array.isArray(quotes)) return [];
  return quotes;
}
