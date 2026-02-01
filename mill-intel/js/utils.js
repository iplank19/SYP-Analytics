// SYP Mill Intelligence - Utilities

function showToast(msg, type='info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function normalizeMillProduct(raw) {
  if (!raw) return '';
  const s = raw.trim().toUpperCase();
  const lower = s.toLowerCase();
  if (PRODUCTS.includes(lower)) return lower;
  const m = s.match(/(\d+)\s*[xX×]\s*(\d+)/);
  if (!m) return raw.trim();
  const dim = m[1] + 'x' + m[2];
  let grade = '#2';
  if (/#1|#\s*1|grade\s*1|no\.?\s*1/i.test(s)) grade = '#1';
  else if (/#3|#\s*3|grade\s*3|no\.?\s*3|utility/i.test(s)) grade = '#3';
  else if (/msr|machine|stress/i.test(s)) grade = ' MSR';
  else if (/#2|#\s*2|grade\s*2|no\.?\s*2|std|standard|stud/i.test(s)) grade = '#2';
  return dim + (grade === ' MSR' ? ' MSR' : grade);
}

// Map of mill city names to their state abbreviations — sourced from SPIB Buyers Guide Dec 2025
const MILL_CITIES = {
  // Alabama
  'gordo':'AL','fulton':'AL','axis':'AL','nauvoo':'AL','carrollton':'AL','salem':'AL',
  'lafayette':'AL','spanish fort':'AL','eufaula':'AL','talladega':'AL','frisco city':'AL',
  'monroeville':'AL','selma':'AL','fayette':'AL','silas':'AL','york':'AL','mcshan':'AL',
  'haleyville':'AL','greenville':'AL','brewton':'AL','maplesville':'AL','demopolis':'AL',
  'opelika':'AL','cottonton':'AL','millport':'AL','troy':'AL','chapman':'AL',
  // Arkansas
  'malvern':'AR','bearden':'AR','urbana':'AR','el dorado':'AR','gurdon':'AR','leola':'AR',
  'monticello':'AR','ola':'AR','waldo':'AR','warren':'AR','sparkman':'AR','glenwood':'AR',
  'russellville':'AR','dierks':'AR','huttig':'AR','nashville':'AR','fordyce':'AR','camden':'AR',
  // Florida
  'lake city':'FL','marianna':'FL','pensacola':'FL','graceville':'FL','bristol':'FL',
  'cross city':'FL','jasper':'FL','perry':'FL',
  // Georgia
  'thomasville':'GA','moultrie':'GA','gibson':'GA','rome':'GA','warrenton':'GA','albany':'GA',
  'preston':'GA','perry':'GA','baxley':'GA','swainsboro':'GA','thomaston':'GA','eatonton':'GA',
  'barnesville':'GA','union point':'GA','hoboken':'GA','dalton':'GA','blackshear':'GA',
  'dudley':'GA','fitzgerald':'GA','waycross':'GA','jesup':'GA','lumber city':'GA',
  // Louisiana
  'deridder':'LA','winnfield':'LA','dequincy':'LA','olla':'LA','leesville':'LA','simsboro':'LA',
  'joyce':'LA','dodson':'LA','holden':'LA','bogalusa':'LA','oakdale':'LA','alexandria':'LA','monroe':'LA',
  // Mississippi
  'macon':'MS','newton':'MS','winona':'MS','vicksburg':'MS','gloster':'MS','mccomb':'MS',
  'taylorsville':'MS','ripley':'MS','grenada':'MS','lumberton':'MS','forest':'MS','magnolia':'MS',
  'corinth':'MS','collins':'MS','purvis':'MS','shuqualak':'MS','ackerman':'MS','new albany':'MS',
  'philadelphia':'MS','bruce':'MS','brookhaven':'MS','leland':'MS','hattiesburg':'MS',
  'meridian':'MS','laurel':'MS',
  // North Carolina
  'graham':'NC','siler city':'NC','creedmoor':'NC','climax':'NC','ramseur':'NC','smithfield':'NC',
  'mt. gilead':'NC','denton':'NC','rutherfordton':'NC','mount pleasant':'NC','weldon':'NC',
  'louisburg':'NC','cove city':'NC','grifton':'NC','plymouth':'NC','clarendon':'NC',
  // South Carolina
  'camden':'SC','conway':'SC','effingham':'SC','prosperity':'SC','georgetown':'SC',
  'williams':'SC','marion':'SC','andrews':'SC',
  // Texas
  'nacogdoches':'TX','pollok':'TX','diboll':'TX','pineland':'TX','gilmer':'TX','jasper':'TX',
  'conroe':'TX','timpson':'TX','marshall':'TX','bon wier':'TX','huntsville':'TX',
  'new boston':'TX','henderson':'TX','lufkin':'TX','livingston':'TX','corrigan':'TX',
  'chester':'TX','woodville':'TX',
  // Virginia
  'amelia court house':'VA','blackstone':'VA','millers tavern':'VA','saluda':'VA',
  'sutherlin':'VA','rocky mount':'VA','franklin':'VA','madison':'VA','red oak':'VA',
  'warsaw':'VA','crozet':'VA',
};

function normalizeMillName(raw) {
  if (!raw) return '';
  const s = raw.trim().toLowerCase();
  const aliases = {
    'canfor dq': 'Canfor - DeQuincy', 'canfor dequincy': 'Canfor - DeQuincy', 'canfor - dequincy': 'Canfor - DeQuincy',
    'canfor urbana': 'Canfor - Urbana', 'canfor - urbana': 'Canfor - Urbana',
    'wf huttig': 'West Fraser - Huttig', 'west fraser huttig': 'West Fraser - Huttig', 'west fraser - huttig': 'West Fraser - Huttig',
    'wf leola': 'West Fraser - Leola', 'west fraser leola': 'West Fraser - Leola', 'west fraser - leola': 'West Fraser - Leola',
    'interfor monticello': 'Interfor - Monticello', 'interfor - monticello': 'Interfor - Monticello',
    'interfor georgetown': 'Interfor - Georgetown', 'interfor - georgetown': 'Interfor - Georgetown',
    'gp clarendon': 'GP - Clarendon', 'gp - clarendon': 'GP - Clarendon',
    'gp camden': 'GP - Camden', 'gp - camden': 'GP - Camden',
    'rex lumber bristol': 'Rex Lumber - Bristol', 'rex lumber - bristol': 'Rex Lumber - Bristol',
    'rex lumber graceville': 'Rex Lumber - Graceville', 'rex lumber - graceville': 'Rex Lumber - Graceville',
    'rex lumber troy': 'Rex Lumber - Troy', 'rex lumber - troy': 'Rex Lumber - Troy',
    'rex lumber brookhaven': 'Rex Lumber - Brookhaven', 'rex lumber - brookhaven': 'Rex Lumber - Brookhaven',
    'weyerhaeuser dierks': 'Weyerhaeuser - Dierks', 'weyerhaeuser - dierks': 'Weyerhaeuser - Dierks',
    'tolko leland': 'Tolko - Leland', 'tolko - leland': 'Tolko - Leland',
    'lumberton lumber': 'Lumberton Lumber', 'lumberton': 'Lumberton Lumber',
    // Idaho Forest Group (SPIB: MS22) is in Lumberton, MS
    'idaho forest group': 'Idaho Forest Group - Lumberton', 'ifg': 'Idaho Forest Group - Lumberton',
    'ifg lumberton': 'Idaho Forest Group - Lumberton', 'idaho forest group - lumberton': 'Idaho Forest Group - Lumberton',
    // Hunt Forest Products
    'hunt forest': 'Hunt Forest Products - Winnfield', 'hunt forest products': 'Hunt Forest Products - Winnfield',
    // PotlatchDeltic
    'potlatchdeltic': 'PotlatchDeltic', 'potlatch': 'PotlatchDeltic',
    // Biewer
    'biewer newton': 'Biewer - Newton', 'biewer - newton': 'Biewer - Newton',
    'biewer winona': 'Biewer - Winona', 'biewer - winona': 'Biewer - Winona',
    // Anthony Timberlands
    'anthony timberlands': 'Anthony Timberlands'
  };
  if (aliases[s]) return aliases[s];
  // Try partial match
  for (const mill of MILLS) {
    if (mill.toLowerCase() === s) return mill;
    if (s.includes(mill.toLowerCase().split(' - ')[1]?.toLowerCase() || '___')) return mill;
  }
  return raw.trim();
}

// Infer city,state for a mill name if city field is empty
function inferMillCity(millName) {
  if (!millName || typeof millName !== 'string') return '';
  const lower = millName.toLowerCase();
  // Check if mill name contains a known city
  for (const [city, st] of Object.entries(MILL_CITIES)) {
    if (lower.includes(city)) {
      // Capitalize city properly
      const capCity = city.replace(/\b\w/g, c => c.toUpperCase());
      return `${capCity}, ${st}`;
    }
  }
  // Check after " - " separator (e.g. "Rex Lumber - Troy")
  const dashParts = millName.split(' - ');
  if (dashParts.length >= 2) {
    const loc = dashParts[dashParts.length - 1].trim().toLowerCase();
    if (MILL_CITIES[loc]) {
      const capCity = loc.replace(/\b\w/g, c => c.toUpperCase());
      return `${capCity}, ${MILL_CITIES[loc]}`;
    }
  }
  return '';
}

function ageLabel(dateStr) {
  if (!dateStr) return '—';
  const age = Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  if (age === 0) return 'Today';
  if (age === 1) return 'Yesterday';
  return age + 'd ago';
}

function ageColor(dateStr) {
  if (!dateStr) return 'var(--muted)';
  const age = Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  if (age === 0) return 'var(--positive)';
  if (age <= 2) return 'var(--text)';
  if (age <= 5) return 'var(--warn)';
  return 'var(--muted)';
}

function extractState(location) {
  if (!location) return '';
  const parts = location.trim().split(',');
  if (parts.length >= 2) {
    const st = parts[parts.length - 1].trim().toUpperCase().slice(0, 2);
    if (st.length === 2 && /^[A-Z]+$/.test(st)) return st;
  }
  return '';
}

function getRegionFromState(st) {
  const map = {TX:'west',LA:'west',AR:'west',OK:'west',MS:'central',AL:'central',TN:'central',KY:'central',MO:'central',GA:'east',FL:'east',SC:'east',NC:'east',VA:'east'};
  return map[st] || 'central';
}

// Chart management
window._charts = {};
function destroyChart(name) {
  if (window._charts[name]) {
    window._charts[name].destroy();
    delete window._charts[name];
  }
}
