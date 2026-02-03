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
    'lumberton lumber': 'Idaho Forest Group - Lumberton', 'lumberton': 'Idaho Forest Group - Lumberton',
    'idaho forest group': 'Idaho Forest Group - Lumberton', 'ifg': 'Idaho Forest Group - Lumberton',
    'ifg lumberton': 'Idaho Forest Group - Lumberton', 'idaho forest group - lumberton': 'Idaho Forest Group - Lumberton',
    'binderholz': 'Binderholz', 'binderholz timber': 'Binderholz',
    'binderholz live oak': 'Binderholz - Live Oak', 'binderholz - live oak': 'Binderholz - Live Oak',
    'binderholz enfield': 'Binderholz - Enfield', 'binderholz - enfield': 'Binderholz - Enfield',
    'klausner': 'Binderholz', 'klausner lumber': 'Binderholz',
    'hunt forest': 'Hunt Forest Products - Winnfield', 'hunt forest products': 'Hunt Forest Products - Winnfield',
    'potlatchdeltic': 'PotlatchDeltic', 'potlatch': 'PotlatchDeltic',
    'biewer newton': 'Biewer - Newton', 'biewer - newton': 'Biewer - Newton',
    'biewer winona': 'Biewer - Winona', 'biewer - winona': 'Biewer - Winona',
    'anthony timberlands': 'Anthony Timberlands'
  };
  if (aliases[s]) return aliases[s];
  for (const mill of MILLS) {
    if (mill.toLowerCase() === s) return mill;
    if (s.includes(mill.toLowerCase().split(' - ')[1]?.toLowerCase() || '___')) return mill;
  }
  return raw.trim();
}

function miInferMillCity(millName) {
  if (!millName || typeof millName !== 'string') return '';
  const lower = millName.toLowerCase();
  for (const [city, st] of Object.entries(MI_MILL_CITIES)) {
    if (lower.includes(city)) {
      const capCity = city.replace(/\b\w/g, c => c.toUpperCase());
      return `${capCity}, ${st}`;
    }
  }
  const dashParts = millName.split(' - ');
  if (dashParts.length >= 2) {
    const loc = dashParts[dashParts.length - 1].trim().toLowerCase();
    if (MI_MILL_CITIES[loc]) {
      const capCity = loc.replace(/\b\w/g, c => c.toUpperCase());
      return `${capCity}, ${MI_MILL_CITIES[loc]}`;
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
    if (st.length === 2 && /^[A-Z]+$/.test(st)) return st;
  }
  return '';
}

function miGetRegionFromState(st) {
  const map = {TX:'west',LA:'west',AR:'west',OK:'west',MS:'central',AL:'central',TN:'central',KY:'central',MO:'central',GA:'east',FL:'east',SC:'east',NC:'east',VA:'east'};
  return map[st] || 'central';
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
