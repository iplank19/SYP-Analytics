// SYP Analytics - Mill Intel Utilities
// Functions unique to Mill Intel (not already in SYP utils)

const MI_MILL_CITIES = {
  'gordo':'AL','fulton':'AL','axis':'AL','nauvoo':'AL','carrollton':'AL','salem':'AL',
  'lafayette':'AL','spanish fort':'AL','eufaula':'AL','talladega':'AL','frisco city':'AL',
  'monroeville':'AL','selma':'AL','fayette':'AL','silas':'AL','york':'AL','mcshan':'AL',
  'haleyville':'AL','greenville':'AL','brewton':'AL','maplesville':'AL','demopolis':'AL',
  'opelika':'AL','cottonton':'AL','millport':'AL','troy':'AL','chapman':'AL',
  'malvern':'AR','bearden':'AR','urbana':'AR','el dorado':'AR','gurdon':'AR','leola':'AR',
  'monticello':'AR','ola':'AR','waldo':'AR','warren':'AR','sparkman':'AR','glenwood':'AR',
  'russellville':'AR','dierks':'AR','huttig':'AR','nashville':'AR','fordyce':'AR','camden':'AR',
  'lake city':'FL','marianna':'FL','pensacola':'FL','graceville':'FL','bristol':'FL',
  'cross city':'FL','jasper':'FL','perry':'FL','live oak':'FL',
  'thomasville':'GA','moultrie':'GA','gibson':'GA','rome':'GA','warrenton':'GA','albany':'GA',
  'preston':'GA','perry':'GA','baxley':'GA','swainsboro':'GA','thomaston':'GA','eatonton':'GA',
  'barnesville':'GA','union point':'GA','hoboken':'GA','dalton':'GA','blackshear':'GA',
  'dudley':'GA','fitzgerald':'GA','waycross':'GA','jesup':'GA','lumber city':'GA',
  'deridder':'LA','winnfield':'LA','dequincy':'LA','olla':'LA','leesville':'LA','simsboro':'LA',
  'joyce':'LA','dodson':'LA','holden':'LA','bogalusa':'LA','oakdale':'LA','alexandria':'LA','monroe':'LA',
  'macon':'MS','newton':'MS','winona':'MS','vicksburg':'MS','gloster':'MS','mccomb':'MS',
  'taylorsville':'MS','ripley':'MS','grenada':'MS','lumberton':'MS','forest':'MS','magnolia':'MS',
  'corinth':'MS','collins':'MS','purvis':'MS','shuqualak':'MS','ackerman':'MS','new albany':'MS',
  'philadelphia':'MS','bruce':'MS','brookhaven':'MS','leland':'MS','hattiesburg':'MS',
  'meridian':'MS','laurel':'MS',
  'enfield':'NC','graham':'NC','siler city':'NC','creedmoor':'NC','climax':'NC','ramseur':'NC','smithfield':'NC',
  'mt. gilead':'NC','denton':'NC','rutherfordton':'NC','mount pleasant':'NC','weldon':'NC',
  'louisburg':'NC','cove city':'NC','grifton':'NC','plymouth':'NC','clarendon':'NC',
  'camden':'SC','conway':'SC','effingham':'SC','prosperity':'SC','georgetown':'SC',
  'williams':'SC','marion':'SC','andrews':'SC',
  'nacogdoches':'TX','pollok':'TX','diboll':'TX','pineland':'TX','gilmer':'TX','jasper':'TX',
  'conroe':'TX','timpson':'TX','marshall':'TX','bon wier':'TX','huntsville':'TX',
  'new boston':'TX','henderson':'TX','lufkin':'TX','livingston':'TX','corrigan':'TX',
  'chester':'TX','woodville':'TX',
  'amelia court house':'VA','blackstone':'VA','millers tavern':'VA','saluda':'VA',
  'sutherlin':'VA','rocky mount':'VA','franklin':'VA','madison':'VA','red oak':'VA',
  'warsaw':'VA','crozet':'VA',
};

function miNormalizeMillName(raw) {
  if (!raw) return '';
  const s = raw.trim().toLowerCase();

  // 1. Direct location alias match
  if (_MILL_LOCATION_ALIASES[s]) return _MILL_LOCATION_ALIASES[s];

  // 2. Normalize dashes/periods/extra spaces for flexible matching
  const norm = s.replace(/[–—]/g, '-').replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim();
  if (_MILL_LOCATION_ALIASES[norm]) return _MILL_LOCATION_ALIASES[norm];

  // 3. Direct company alias match
  if (_MILL_COMPANY_ALIASES[s]) return _MILL_COMPANY_ALIASES[s];
  if (_MILL_COMPANY_ALIASES[norm]) return _MILL_COMPANY_ALIASES[norm];

  // 4. Exact match against MILLS array
  for (const mill of MILLS) {
    if (mill.toLowerCase() === s || mill.toLowerCase() === norm) return mill;
  }

  // 5. Exact match against MILL_DIRECTORY keys
  if (typeof MILL_DIRECTORY !== 'undefined') {
    for (const dirKey of Object.keys(MILL_DIRECTORY)) {
      if (dirKey.toLowerCase() === s || dirKey.toLowerCase() === norm) return dirKey;
    }
  }

  // 6. Fuzzy: extract company + city parts, try to reconstruct canonical name
  //    Handles "JORDAN - MT. GILEAD" → "Jordan Lumber - Mt. Gilead"
  //    Handles "Georgia Pacific Gurdon" → "GP - Gurdon"
  const dashMatch = raw.trim().match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    const rawCompany = dashMatch[1].trim();
    const rawCity = dashMatch[2].trim();
    const company = _miFuzzyCompanyMatch(rawCompany);
    if (company) {
      const canonical = _miFuzzyLocationMatch(company, rawCity);
      if (canonical) return canonical;
      // Company matched but city not in directory — return "Company - City" format
      const capCity = rawCity.replace(/\b\w/g, c => c.toUpperCase());
      return `${company} - ${capCity}`;
    }
  }

  // 7. No dash — try company alias on full string, then look for city words
  const company = _miFuzzyCompanyMatch(raw.trim());
  if (company) {
    // Try to find a city in the remaining text after removing the company part
    const remaining = s.replace(company.toLowerCase(), '').replace(/[,\-–—]/g, ' ').trim();
    if (remaining) {
      const canonical = _miFuzzyLocationMatch(company, remaining);
      if (canonical) return canonical;
    }
    return company;
  }

  // 8. City-substring match against MILLS (original fallback)
  for (const mill of MILLS) {
    const cityPart = mill.split(' - ')[1]?.toLowerCase();
    if (cityPart && s.includes(cityPart)) return mill;
  }

  return raw.trim();
}

// Helper: fuzzy match a raw company name to canonical company
function _miFuzzyCompanyMatch(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/[_\-–—.]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Direct alias match
  if (_MILL_COMPANY_ALIASES[lower]) return _MILL_COMPANY_ALIASES[lower];

  // Longest-prefix alias match (sorted longest first)
  const sorted = Object.entries(_MILL_COMPANY_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, canonical] of sorted) {
    if (lower === alias || lower.startsWith(alias + ' ')) return canonical;
  }

  // Try without common suffixes: "lumber", "forest products", "industries", etc.
  const stripped = lower
    .replace(/\b(lumber|forest products|industries|timber|timberlands|inc\.?|llc|co\.?|company)\b/gi, '')
    .replace(/\s+/g, ' ').trim();
  if (stripped && _MILL_COMPANY_ALIASES[stripped]) return _MILL_COMPANY_ALIASES[stripped];

  return null;
}

// Helper: given a canonical company and a raw city, find the matching MILL_DIRECTORY entry
function _miFuzzyLocationMatch(company, rawCity) {
  if (!company || !rawCity) return null;
  const cityLower = rawCity.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();

  // Normalize common abbreviations: "mt." → "mt", "st." → "st", "ft." → "ft"
  const cityNorm = cityLower.replace(/\bmt\.?\b/g, 'mt').replace(/\bst\.?\b/g, 'st').replace(/\bft\.?\b/g, 'ft');

  // Build list of candidate mills for this company from MILL_DIRECTORY + MILLS
  const candidates = [];
  if (typeof MILL_DIRECTORY !== 'undefined') {
    for (const [key, val] of Object.entries(MILL_DIRECTORY)) {
      const keyCompany = key.split(' - ')[0];
      if (keyCompany === company) candidates.push({ key, city: (key.split(' - ')[1] || '').toLowerCase() });
    }
  }
  for (const mill of MILLS) {
    const millCompany = mill.split(' - ')[0];
    if (millCompany === company && !candidates.find(c => c.key === mill)) {
      candidates.push({ key: mill, city: (mill.split(' - ')[1] || '').toLowerCase() });
    }
  }

  // Try matching city
  for (const cand of candidates) {
    const candNorm = cand.city.replace(/[.,]/g, '').replace(/\bmt\.?\b/g, 'mt').replace(/\bst\.?\b/g, 'st').replace(/\bft\.?\b/g, 'ft');
    // Exact match
    if (candNorm === cityNorm) return cand.key;
    // One contains the other (e.g., "gilead" matches "mt gilead")
    if (candNorm.includes(cityNorm) || cityNorm.includes(candNorm)) return cand.key;
    // Remove state suffix from input (e.g., "Mt. Gilead, NC" → "mt gilead")
    const cityNoState = cityNorm.replace(/,?\s*[a-z]{2}$/, '').trim();
    if (cityNoState && (candNorm === cityNoState || candNorm.includes(cityNoState) || cityNoState.includes(candNorm))) return cand.key;
  }

  return null;
}

function miInferMillCity(millName) {
  if (!millName || typeof millName !== 'string') return '';

  // First check MILL_DIRECTORY for authoritative location
  if (typeof MILL_DIRECTORY !== 'undefined' && MILL_DIRECTORY[millName]) {
    const entry = MILL_DIRECTORY[millName];
    return `${entry.city}, ${entry.state}`;
  }

  // Check if mill name has "Company - Location" format and try directory lookup
  const dashParts = millName.split(' - ');
  if (dashParts.length >= 2) {
    const loc = dashParts[dashParts.length - 1].trim().toLowerCase();
    if (MI_MILL_CITIES[loc]) {
      const capCity = loc.replace(/\b\w/g, c => c.toUpperCase());
      return `${capCity}, ${MI_MILL_CITIES[loc]}`;
    }
  }

  // Fallback to searching for city names in the mill name
  const lower = millName.toLowerCase();
  for (const [city, st] of Object.entries(MI_MILL_CITIES)) {
    if (lower.includes(city)) {
      const capCity = city.replace(/\b\w/g, c => c.toUpperCase());
      return `${capCity}, ${st}`;
    }
  }

  return '';
}

function miAgeLabel(dateStr) {
  if (!dateStr) return '—';
  const age = Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  if (age === 0) return 'Today';
  if (age === 1) return 'Yesterday';
  return age + 'd ago';
}

function miAgeColor(dateStr) {
  if (!dateStr) return 'var(--muted)';
  const age = Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  if (age === 0) return 'var(--positive)';
  if (age <= 2) return 'var(--text)';
  if (age <= 5) return 'var(--warn)';
  return 'var(--muted)';
}

function miExtractState(location) {
  if (!location) return '';
  const parts = location.trim().split(',');
  if (parts.length >= 2) {
    const st = parts[parts.length - 1].trim().toUpperCase().slice(0, 2);
    if (st.length === 2 && US_STATES.includes(st)) return st;
  }
  return '';
}

function miGetRegionFromState(st) {
  return getRegionFromState(st);
}

const MI_PPU={'2x4':208,'2x6':128,'2x8':96,'2x10':80,'2x12':64,'2x3':294,'2x14':52,'1x4':416,'1x6':256,'1x8':192,'1x10':160,'1x12':128,'4x4':64,'4x6':42,'6x6':24};

const MI_STATE_RATES={AR:2.25,LA:2.25,TX:2.50,MS:2.25,AL:2.50,FL:2.75,GA:2.50,SC:2.50,NC:2.50,TN:2.25,KY:2.25,VA:2.50,OH:2.50,IN:2.50,IL:2.50,MO:2.25,WI:2.50,MI:2.50,MN:2.50,IA:2.50};

// Format product label: "2x4#2" + "16" → "2x4 16' #2"
function formatProductLabel(product, length) {
  if (!product) return '';
  const p = product.trim();
  let dimension, grade;
  // Parse "2x4#2" → dimension="2x4", grade="#2"
  const hashMatch = p.match(/^(\d+x\d+)(#\d+)$/i);
  if (hashMatch) {
    dimension = hashMatch[1];
    grade = hashMatch[2];
  } else {
    // Parse "2x4 MSR" → dimension="2x4", grade="MSR"
    const spaceMatch = p.match(/^(\d+x\d+)\s+(.+)$/i);
    if (spaceMatch) {
      dimension = spaceMatch[1];
      grade = spaceMatch[2];
    } else {
      // Can't parse - return basic concatenation
      return length && length !== 'RL' ? `${p} ${length}'` : (length === 'RL' ? `${p} RL` : p);
    }
  }
  const lengthPart = (!length || length === 'RL') ? 'RL' : length + "'";
  return `${dimension} ${lengthPart} ${grade}`;
}

// Format product header for matrix rows: "2x4#2" → "2x4 #2"
function formatProductHeader(product) {
  if (!product) return '';
  const p = product.trim();
  const hashMatch = p.match(/^(\d+x\d+)(#\d+)$/i);
  if (hashMatch) return `${hashMatch[1]} ${hashMatch[2]}`;
  return p; // "2x4 MSR" already has a space
}

// Age badge background color
function miAgeBadgeBg(dateStr) {
  if (!dateStr) return 'transparent';
  const age = Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  if (age === 0) return 'rgba(166,227,161,0.15)';   // positive bg
  if (age === 1) return 'rgba(249,226,175,0.2)';    // warn bg
  return 'rgba(243,139,168,0.15)';                   // negative bg
}

// Age badge text color
function miAgeBadgeColor(dateStr) {
  if (!dateStr) return 'var(--muted)';
  const age = Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  if (age === 0) return 'var(--positive)';
  if (age === 1) return 'var(--warn)';
  return 'var(--negative)';
}
