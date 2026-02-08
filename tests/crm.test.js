/**
 * Tests for CRM functions:
 *   normalizeCustomerName, normalizeMillCompany, normalizeProductForMatch,
 *   calcMatchScore, getVolumeAlreadySold, getAvailableVolume
 */
const { getSource, resetState } = require('./setup');

// Load dependencies in order
eval(getSource('js/state.js'));
eval(getSource('js/utils.js'));
eval(getSource('js/trades.js'));

describe('normalizeCustomerName', () => {
  beforeEach(() => {
    resetState();
    S.customers = [
      { name: 'ABC Lumber' },
      { name: 'Smith Building Supply' }
    ];
  });

  test('returns null/empty for null/empty', () => {
    expect(normalizeCustomerName(null)).toBeNull();
    expect(normalizeCustomerName('')).toBe('');
    expect(normalizeCustomerName('  ')).toBe('');
  });

  test('trims whitespace', () => {
    expect(normalizeCustomerName('  ABC Lumber  ')).toBe('ABC Lumber');
  });

  test('matches existing customer case-insensitively', () => {
    expect(normalizeCustomerName('abc lumber')).toBe('ABC Lumber');
    expect(normalizeCustomerName('ABC LUMBER')).toBe('ABC Lumber');
  });

  test('preserves casing for new customer names', () => {
    const result = normalizeCustomerName('new customer inc');
    expect(result).toBe('new customer inc');
  });

  test('preserves existing customer exact casing', () => {
    expect(normalizeCustomerName('Smith Building Supply')).toBe('Smith Building Supply');
  });
});

describe('normalizeMillCompany', () => {
  beforeEach(() => {
    resetState();
  });

  test('returns null for null', () => {
    expect(normalizeMillCompany(null)).toBeNull();
  });

  test('returns empty for empty/whitespace', () => {
    expect(normalizeMillCompany('')).toBe('');
    expect(normalizeMillCompany('  ')).toBe('');
  });

  test('trims whitespace', () => {
    const result = normalizeMillCompany('  Some Mill  ');
    expect(typeof result).toBe('string');
    expect(result.trim()).toBe(result);
  });
});

describe('normalizeProductForMatch', () => {
  test('handles null/empty', () => {
    expect(normalizeProductForMatch(null)).toBe('');
    expect(normalizeProductForMatch('')).toBe('');
  });

  test('lowercases and strips whitespace', () => {
    expect(normalizeProductForMatch('2x4 #2')).toBe('2x42');
  });

  test('strips hash signs', () => {
    expect(normalizeProductForMatch('2x4#2')).toBe('2x42');
    expect(normalizeProductForMatch('2x6#3')).toBe('2x63');
  });

  test('normalizes different formats to same value', () => {
    const variants = ['2x4#2', '2x4 #2', '2X4#2', '2x4 # 2'];
    const normalized = variants.map(normalizeProductForMatch);
    expect(new Set(normalized).size).toBe(1);
  });
});

describe('calcMatchScore', () => {
  beforeEach(() => {
    resetState();
    S.sells = [];
    S.autoMatchConfig = { volumeTolerance: 0.2, priceTolerance: 20 };
  });

  test('returns 0 for null inputs', () => {
    expect(calcMatchScore(null, null)).toBe(0);
    expect(calcMatchScore(null, {})).toBe(0);
    expect(calcMatchScore({}, null)).toBe(0);
  });

  test('gives high score for perfect match', () => {
    const buy = { id: 1, product: '2x4#2', length: 'RL', volume: 23, price: 400, date: '2026-01-15', orderNum: 'PO-1' };
    const sell = { id: 2, product: '2x4#2', length: 'RL', volume: 23, price: 500, freight: 0, date: '2026-01-16' };
    const score = calcMatchScore(buy, sell);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  test('gives 40 points for exact product match', () => {
    const buy = { product: '2x4#2', volume: 100, orderNum: 'X' };
    const sell = { product: '2x4#2', volume: 100, price: 500, freight: 0 };
    const score = calcMatchScore(buy, sell);
    expect(score).toBeGreaterThanOrEqual(40);
  });

  test('gives lower score for partial product match', () => {
    const buy = { product: '2x4#2', volume: 23, orderNum: 'X' };
    const sell1 = { product: '2x4#2', volume: 23, price: 500, freight: 0 };
    const sell2 = { product: '2x4#3', volume: 23, price: 500, freight: 0 };
    expect(calcMatchScore(buy, sell1)).toBeGreaterThan(calcMatchScore(buy, sell2));
  });

  test('gives 15 points for exact length match', () => {
    const buy = { product: '2x4#2', length: '16', volume: 23, orderNum: 'X' };
    const sell = { product: '2x4#2', length: '16', volume: 23, price: 500, freight: 0 };
    const score = calcMatchScore(buy, sell);
    // Product (40) + Length (15) + Volume + Date + Price ≥ 55
    expect(score).toBeGreaterThanOrEqual(55);
  });
});

describe('getVolumeAlreadySold', () => {
  beforeEach(() => {
    resetState();
  });

  test('returns 0 for buy with no order number', () => {
    expect(getVolumeAlreadySold({ id: 1 })).toBe(0);
  });

  test('returns 0 when no matching sells', () => {
    S.sells = [{ orderNum: 'PO-999', volume: 10 }];
    expect(getVolumeAlreadySold({ id: 1, orderNum: 'PO-123' })).toBe(0);
  });

  test('sums volume from matching sells', () => {
    S.sells = [
      { orderNum: 'PO-123', volume: 10 },
      { orderNum: 'PO-123', volume: 15 }
    ];
    expect(getVolumeAlreadySold({ id: 1, orderNum: 'PO-123' })).toBe(25);
  });

  test('excludes cancelled sells', () => {
    S.sells = [
      { orderNum: 'PO-123', volume: 10 },
      { orderNum: 'PO-123', volume: 15, status: 'cancelled' }
    ];
    expect(getVolumeAlreadySold({ id: 1, orderNum: 'PO-123' })).toBe(10);
  });
});

describe('getAvailableVolume', () => {
  beforeEach(() => {
    resetState();
    S.sells = [];
  });

  test('returns 0 for null buy', () => {
    expect(getAvailableVolume(null)).toBe(0);
  });

  test('returns full volume when nothing sold', () => {
    expect(getAvailableVolume({ volume: 23, orderNum: 'PO-1' })).toBe(23);
  });

  test('subtracts sold volume', () => {
    S.sells = [{ orderNum: 'PO-1', volume: 10 }];
    expect(getAvailableVolume({ volume: 23, orderNum: 'PO-1' })).toBe(13);
  });
});
