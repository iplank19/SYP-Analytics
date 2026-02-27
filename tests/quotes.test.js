/**
 * Tests for Quote Engine functions:
 *   parseProductString, calcFreightPerMBF, getLaneMiles, getRLPrice
 */
const { getSource, resetState } = require('./setup');

// Load dependencies in order
eval(getSource('js/state.js'));
eval(getSource('js/utils.js'));
eval(getSource('js/quotes.js'));

describe('parseProductString', () => {
  test('parses basic "2x4 #2" product', () => {
    const r = parseProductString('2x4 #2');
    expect(r.base).toBe('2x4#2');
    expect(r.size).toBe('2x4');
    expect(r.grade).toBe('#2');
  });

  test('parses "2x6#3" without space', () => {
    const r = parseProductString('2x6#3');
    expect(r.base).toBe('2x6#3');
    expect(r.grade).toBe('#3');
  });

  test('parses MSR product', () => {
    const r = parseProductString('2x4 MSR');
    expect(r.base).toBe('2x4 MSR');
    expect(r.grade).toBe('MSR');
  });

  test('parses 2400f as MSR', () => {
    const r = parseProductString('2x6 2400f');
    expect(r.grade).toBe('MSR');
  });

  test('parses length from foot mark', () => {
    const r = parseProductString("2x4 #2 16'");
    expect(r.length).toBe('16');
  });

  test('parses RL length', () => {
    const r = parseProductString('2x4 #2 RL');
    expect(r.length).toBe('RL');
  });

  test('parses random as RL', () => {
    const r = parseProductString('2x4 #2 random');
    expect(r.length).toBe('RL');
  });

  test('defaults grade to #2 when not specified', () => {
    const r = parseProductString('2x8');
    expect(r.grade).toBe('#2');
    expect(r.base).toBe('2x8#2');
  });

  test('handles #1 grade', () => {
    const r = parseProductString('2x10 #1');
    expect(r.grade).toBe('#1');
    expect(r.base).toBe('2x10#1');
  });

  test('handles null/empty input', () => {
    const r = parseProductString(null);
    expect(r.base).toBe('2x4#2'); // defaults
    const r2 = parseProductString('');
    expect(r2.base).toBe('2x4#2');
  });

  test('handles "ft" length format', () => {
    const r = parseProductString('2x4 #2 12ft');
    expect(r.length).toBe('12');
  });

  test('handles larger sizes', () => {
    expect(parseProductString('2x12 #2').size).toBe('2x12');
    expect(parseProductString('2x10 #3').size).toBe('2x10');
  });
});

describe('calcFreightPerMBF', () => {
  beforeEach(() => {
    resetState();
    S.freightBase = 450;
    S.quoteMBFperTL = 23;
    S.shortHaulFloor = 0;
    S.stateRates = { AR: 2.25, TX: 2.50, LA: 2.25 };
  });

  test('returns null for null/0 miles', () => {
    expect(calcFreightPerMBF(null, 'Warren, AR')).toBeNull();
    expect(calcFreightPerMBF(0, 'Warren, AR')).toBeNull();
  });

  test('calculates freight for standard product', () => {
    // (450 + 500 * 2.25) / 23 = (450 + 1125) / 23 = 1575 / 23 ≈ 68
    const result = calcFreightPerMBF(500, 'Warren, AR');
    expect(result).toBe(Math.round((450 + 500 * 2.25) / 23));
  });

  test('uses MSR MBF per TL (20) for MSR products', () => {
    const result = calcFreightPerMBF(500, 'Warren, AR', true);
    expect(result).toBe(Math.round((450 + 500 * 2.25) / 20));
  });

  test('applies short haul floor', () => {
    S.shortHaulFloor = 100;
    // Short distance: (450 + 50 * 2.25) / 23 = 562.5 / 23 ≈ 24, but floor = 100
    const result = calcFreightPerMBF(50, 'Warren, AR');
    expect(result).toBe(100);
  });

  test('uses default rate for unknown state', () => {
    // Unknown state defaults to 2.25
    const result = calcFreightPerMBF(500, 'Unknown City');
    expect(result).toBe(Math.round((450 + 500 * 2.25) / 23));
  });

  test('uses state-specific rate', () => {
    const result = calcFreightPerMBF(500, 'Dallas, TX');
    expect(result).toBe(Math.round((450 + 500 * 2.50) / 23));
  });
});

describe('getLaneMiles', () => {
  beforeEach(() => {
    resetState();
    S.lanes = [
      { origin: 'Warren, AR', dest: 'Cincinnati, OH', miles: 650 },
      { origin: 'Gurdon, AR', dest: 'Nashville, TN', miles: 480 }
    ];
  });

  test('returns null for missing origin or dest', () => {
    expect(getLaneMiles(null, 'Cincinnati, OH')).toBeNull();
    expect(getLaneMiles('Warren, AR', null)).toBeNull();
    expect(getLaneMiles('', '')).toBeNull();
  });

  test('finds exact match', () => {
    expect(getLaneMiles('Warren, AR', 'Cincinnati, OH')).toBe(650);
  });

  test('case insensitive match', () => {
    expect(getLaneMiles('WARREN, AR', 'CINCINNATI, OH')).toBe(650);
  });

  test('partial city match', () => {
    expect(getLaneMiles('Warren', 'Cincinnati')).toBe(650);
  });

  test('returns null for unknown lane', () => {
    expect(getLaneMiles('Dallas, TX', 'New York, NY')).toBeNull();
  });
});

describe('getRLPrice', () => {
  const rl = {
    west: { '2x4#2': 420, '2x6#2': 450 },
    central: { '2x4#2': 410, '2x6#2': 440 },
    east: { '2x4#2': 430, '2x6#2': 460 },
    specified_lengths: {
      west: {
        '2x4#2': { '10': 415, '12': 425, '16': 440 }
      }
    }
  };

  test('returns composite price for RL length', () => {
    expect(getRLPrice(rl, '2x4#2', 'RL', 'west')).toBe(420);
    expect(getRLPrice(rl, '2x4#2', null, 'west')).toBe(420);
  });

  test('returns specified length price when available', () => {
    expect(getRLPrice(rl, '2x4#2', '16', 'west')).toBe(440);
    expect(getRLPrice(rl, '2x4#2', '10', 'west')).toBe(415);
  });

  test('falls back to composite if specified length not found', () => {
    expect(getRLPrice(rl, '2x4#2', '20', 'west')).toBe(420);
  });

  test('returns null for null rl data', () => {
    expect(getRLPrice(null, '2x4#2', 'RL', 'west')).toBeNull();
  });

  test('handles different regions', () => {
    expect(getRLPrice(rl, '2x4#2', 'RL', 'central')).toBe(410);
    expect(getRLPrice(rl, '2x4#2', 'RL', 'east')).toBe(430);
  });
});
