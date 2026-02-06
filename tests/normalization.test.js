/**
 * Tests for data normalization functions in utils.js
 */
const { getSource, resetState } = require('./setup');

// Load dependencies in order
eval(getSource('js/state.js'));
eval(getSource('js/utils.js'));

describe('normalizePrice', () => {
  test('parses plain numbers', () => {
    expect(normalizePrice(123.456)).toBe(123.46);
    expect(normalizePrice(0)).toBe(0);
    expect(normalizePrice(100)).toBe(100);
  });

  test('parses dollar strings', () => {
    expect(normalizePrice('$1,234.56')).toBe(1234.56);
    expect(normalizePrice('$500')).toBe(500);
  });

  test('parses comma-formatted strings', () => {
    expect(normalizePrice('1,234.56')).toBe(1234.56);
  });

  test('returns 0 for null/undefined/empty', () => {
    expect(normalizePrice(null)).toBe(0);
    expect(normalizePrice(undefined)).toBe(0);
    expect(normalizePrice('')).toBe(0);
  });

  test('returns 0 for non-numeric strings', () => {
    expect(normalizePrice('abc')).toBe(0);
    expect(normalizePrice('N/A')).toBe(0);
  });

  test('handles string numbers', () => {
    expect(normalizePrice('42.5')).toBe(42.5);
  });

  test('rounds to 2 decimal places', () => {
    expect(normalizePrice(10.999)).toBe(11);
    expect(normalizePrice(10.005)).toBe(10.01);
    expect(normalizePrice(10.004)).toBe(10);
  });
});

describe('normalizeVolume', () => {
  test('parses numbers', () => {
    expect(normalizeVolume(23)).toBe(23);
    expect(normalizeVolume(23.456)).toBe(23.46);
  });

  test('parses string numbers', () => {
    expect(normalizeVolume('23')).toBe(23);
    expect(normalizeVolume('23.5')).toBe(23.5);
  });

  test('returns 0 for null/undefined/empty', () => {
    expect(normalizeVolume(null)).toBe(0);
    expect(normalizeVolume(undefined)).toBe(0);
    expect(normalizeVolume('')).toBe(0);
  });

  test('returns 0 for non-numeric', () => {
    expect(normalizeVolume('abc')).toBe(0);
  });
});

describe('normalizeRegion', () => {
  test('returns valid regions as-is (lowercased)', () => {
    expect(normalizeRegion('west')).toBe('west');
    expect(normalizeRegion('central')).toBe('central');
    expect(normalizeRegion('east')).toBe('east');
  });

  test('handles uppercase/mixed case', () => {
    expect(normalizeRegion('WEST')).toBe('west');
    expect(normalizeRegion('Central')).toBe('central');
    expect(normalizeRegion('East')).toBe('east');
  });

  test('defaults to central for invalid/missing', () => {
    expect(normalizeRegion(null)).toBe('central');
    expect(normalizeRegion('')).toBe('central');
    expect(normalizeRegion('north')).toBe('central');
    expect(normalizeRegion(undefined)).toBe('central');
  });

  test('trims whitespace', () => {
    expect(normalizeRegion(' west ')).toBe('west');
  });
});

describe('normalizeProduct', () => {
  test('returns known products unchanged', () => {
    expect(normalizeProduct('2x4#2')).toBe('2x4#2');
    expect(normalizeProduct('2x4 MSR')).toBe('2x4 MSR');
  });

  test('fixes uppercase X', () => {
    expect(normalizeProduct('2X4#2')).toBe('2x4#2');
    expect(normalizeProduct('2X12#1')).toBe('2x12#1');
  });

  test('normalizes MSR spacing', () => {
    expect(normalizeProduct('2x4MSR')).toBe('2x4 MSR');
    expect(normalizeProduct('2x4  MSR')).toBe('2x4 MSR');
  });

  test('removes space before grade #', () => {
    expect(normalizeProduct('2x4 #2')).toBe('2x4#2');
    expect(normalizeProduct('2x10 #3')).toBe('2x10#3');
  });

  test('handles null/undefined', () => {
    expect(normalizeProduct(null)).toBe(null);
    expect(normalizeProduct(undefined)).toBe(undefined);
  });
});

describe('normalizeDate', () => {
  test('returns YYYY-MM-DD for valid dates', () => {
    expect(normalizeDate('2025-01-15')).toBe('2025-01-15');
  });

  test('handles ISO strings', () => {
    const result = normalizeDate('2025-06-15T12:00:00Z');
    expect(result).toBe('2025-06-15');
  });

  test('returns today for null/undefined/empty', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    expect(normalizeDate(null)).toBe(todayStr);
    expect(normalizeDate('')).toBe(todayStr);
    expect(normalizeDate(undefined)).toBe(todayStr);
  });

  test('returns today for invalid dates', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    expect(normalizeDate('not-a-date')).toBe(todayStr);
  });
});

describe('normalizeLength', () => {
  test('strips trailing quotes', () => {
    expect(normalizeLength("12'")).toBe('12');
    expect(normalizeLength('12"')).toBe('12');
  });

  test('normalizes RL variants', () => {
    expect(normalizeLength('rl')).toBe('RL');
    expect(normalizeLength('RL')).toBe('RL');
    expect(normalizeLength('random')).toBe('RL');
    expect(normalizeLength('Random')).toBe('RL');
  });

  test('parses integer lengths', () => {
    expect(normalizeLength('8')).toBe('8');
    expect(normalizeLength('16')).toBe('16');
    expect(normalizeLength(20)).toBe('20');
  });

  test('handles empty/null', () => {
    expect(normalizeLength('')).toBe('');
    expect(normalizeLength(null)).toBe('');
    expect(normalizeLength(undefined)).toBe('');
  });
});

describe('normalizeShipWindow', () => {
  test('normalizes prompt variants', () => {
    expect(normalizeShipWindow('prompt')).toBe('Prompt');
    expect(normalizeShipWindow('immediate')).toBe('Prompt');
    expect(normalizeShipWindow('spot')).toBe('Prompt');
    expect(normalizeShipWindow('now')).toBe('Prompt');
    expect(normalizeShipWindow('asap')).toBe('Prompt');
  });

  test('defaults to 1-2 Weeks', () => {
    expect(normalizeShipWindow(null)).toBe('1-2 Weeks');
    expect(normalizeShipWindow('')).toBe('1-2 Weeks');
    expect(normalizeShipWindow('2 weeks')).toBe('1-2 Weeks');
  });
});
