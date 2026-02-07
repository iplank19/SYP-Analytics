/**
 * Tests for trading signals engine (js/signals.js)
 */
const { getSource, resetState } = require('./setup');

// Load dependencies in order
eval(getSource('js/state.js'));
eval(getSource('js/utils.js'));
eval(getSource('js/signals.js'));

beforeEach(() => {
  resetState();
  // Clear signal cache between tests
  _signalCache = null;
  _signalCacheTime = 0;
  // Ensure signal config is explicitly initialized to defaults
  S.signalConfig = JSON.parse(JSON.stringify(SIGNAL_DEFAULTS));
  S.signals = [];
  S.signalHistory = [];
});

// ============================================================================
// calcMA
// ============================================================================

describe('calcMA', () => {
  test('returns exact average of last N items', () => {
    const prices = [
      { date: '2026-01-01', price: 100 },
      { date: '2026-01-02', price: 200 },
      { date: '2026-01-03', price: 300 }
    ];
    expect(calcMA(prices, 3)).toBe(200);
  });

  test('returns null when insufficient data', () => {
    const prices = [{ date: '2026-01-01', price: 100 }];
    expect(calcMA(prices, 3)).toBeNull();
  });

  test('uses last N items when array longer than period', () => {
    const prices = [
      { date: '2026-01-01', price: 50 },
      { date: '2026-01-02', price: 100 },
      { date: '2026-01-03', price: 200 },
      { date: '2026-01-04', price: 300 }
    ];
    // period=2 → last 2 items: 200, 300 → avg 250
    expect(calcMA(prices, 2)).toBe(250);
  });

  test('period=1 returns last price', () => {
    const prices = [
      { date: '2026-01-01', price: 100 },
      { date: '2026-01-02', price: 42 }
    ];
    expect(calcMA(prices, 1)).toBe(42);
  });

  test('returns null for empty array', () => {
    expect(calcMA([], 5)).toBeNull();
  });
});

// ============================================================================
// calcStdDev
// ============================================================================

describe('calcStdDev', () => {
  test('returns known standard deviation', () => {
    // prices: 10, 20, 30, 40, 50 → mean=30, sample variance=250, stddev≈15.811
    const prices = [10, 20, 30, 40, 50].map((p, i) => ({ date: `2026-01-0${i + 1}`, price: p }));
    const result = calcStdDev(prices, 5);
    expect(result).toBeCloseTo(15.811, 2);
  });

  test('returns null when insufficient data', () => {
    const prices = [{ date: '2026-01-01', price: 100 }];
    expect(calcStdDev(prices, 3)).toBeNull();
  });

  test('returns 0 when period <= 1', () => {
    const prices = [{ date: '2026-01-01', price: 100 }];
    expect(calcStdDev(prices, 1)).toBe(0);
  });

  test('returns 0 when all values are the same', () => {
    const prices = [100, 100, 100, 100].map((p, i) => ({ date: `2026-01-0${i + 1}`, price: p }));
    expect(calcStdDev(prices, 4)).toBe(0);
  });

  test('uses last N items', () => {
    // 5 items, period=3 → last 3: 300, 400, 500
    const prices = [100, 200, 300, 400, 500].map((p, i) => ({ date: `2026-01-0${i + 1}`, price: p }));
    const result = calcStdDev(prices, 3);
    // mean=400, sample variance=10000, stddev=100
    expect(result).toBe(100);
  });
});

// ============================================================================
// calcROC
// ============================================================================

describe('calcROC', () => {
  test('calculates positive rate of change', () => {
    // 10% increase: 100 → 110
    const prices = [
      { date: '2026-01-01', price: 100 },
      { date: '2026-01-02', price: 105 },
      { date: '2026-01-03', price: 110 }
    ];
    // period=2: current=110, past=100, ROC=(110-100)/100*100=10
    expect(calcROC(prices, 2)).toBe(10);
  });

  test('calculates negative rate of change', () => {
    const prices = [
      { date: '2026-01-01', price: 200 },
      { date: '2026-01-02', price: 190 },
      { date: '2026-01-03', price: 180 }
    ];
    // period=2: current=180, past=200, ROC=-10
    expect(calcROC(prices, 2)).toBe(-10);
  });

  test('returns null when insufficient data', () => {
    const prices = [{ date: '2026-01-01', price: 100 }];
    expect(calcROC(prices, 2)).toBeNull();
  });

  test('returns null when past price is 0', () => {
    const prices = [
      { date: '2026-01-01', price: 0 },
      { date: '2026-01-02', price: 100 }
    ];
    expect(calcROC(prices, 1)).toBeNull();
  });
});

// ============================================================================
// calcSignalConfidence
// ============================================================================

describe('calcSignalConfidence', () => {
  test('strong signal has base confidence of 70', () => {
    const signal = { product: '2x4#2', direction: 'buy', strength: 'strong', region: 'west', type: 'trend' };
    expect(calcSignalConfidence(signal, [signal])).toBe(70);
  });

  test('moderate signal has base confidence of 45', () => {
    const signal = { product: '2x4#2', direction: 'buy', strength: 'moderate', region: 'west', type: 'trend' };
    expect(calcSignalConfidence(signal, [signal])).toBe(45);
  });

  test('weak signal has base confidence of 20', () => {
    const signal = { product: '2x4#2', direction: 'buy', strength: 'weak', region: 'west', type: 'trend' };
    expect(calcSignalConfidence(signal, [signal])).toBe(20);
  });

  test('confirming signals add bonus (+10 each, max 30)', () => {
    const signal = { product: '2x4#2', direction: 'buy', strength: 'moderate', region: 'west', type: 'trend' };
    const confirming1 = { product: '2x4#2', direction: 'buy', strength: 'moderate', region: 'west', type: 'momentum' };
    const confirming2 = { product: '2x4#2', direction: 'buy', strength: 'moderate', region: 'central', type: 'meanReversion' };
    // base=45, +10 for confirming1, +10 for confirming2, +5 region bonus from confirming1 having different type/same product/same direction/different region... actually region bonus is for same type different region
    // confirming1: same product, same direction → +10
    // confirming2: same product, same direction → +10
    // regionConfirm: same product, same direction, different region, same type → confirming2 is type meanReversion vs trend, so no region bonus
    // Total = 45 + 20 = 65
    expect(calcSignalConfidence(signal, [signal, confirming1, confirming2])).toBe(65);
  });

  test('conflicting strong signals reduce confidence', () => {
    const signal = { product: '2x4#2', direction: 'buy', strength: 'moderate', region: 'west', type: 'trend' };
    const conflict = { product: '2x4#2', direction: 'sell', strength: 'strong', region: 'west', type: 'momentum' };
    // base=45, -10 for conflict = 35
    expect(calcSignalConfidence(signal, [signal, conflict])).toBe(35);
  });

  test('confidence is clamped to 0-100', () => {
    // Strong base (70) + 4 confirming (+30 capped) + region bonus (+5) = 100 max
    const signal = { product: '2x4#2', direction: 'buy', strength: 'strong', region: 'west', type: 'trend' };
    const others = [
      { product: '2x4#2', direction: 'buy', strength: 'strong', region: 'central', type: 'trend' },
      { product: '2x4#2', direction: 'buy', strength: 'strong', region: 'east', type: 'trend' },
      { product: '2x4#2', direction: 'buy', strength: 'strong', region: 'west', type: 'momentum' },
      { product: '2x4#2', direction: 'buy', strength: 'strong', region: 'west', type: 'seasonal' },
    ];
    const result = calcSignalConfidence(signal, [signal, ...others]);
    expect(result).toBeLessThanOrEqual(100);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  test('many conflicting signals cannot push below 0', () => {
    const signal = { product: '2x4#2', direction: 'buy', strength: 'weak', region: 'west', type: 'trend' };
    const conflicts = Array.from({ length: 5 }, (_, i) => ({
      product: '2x4#2', direction: 'sell', strength: 'strong', region: 'west', type: `type${i}`
    }));
    const result = calcSignalConfidence(signal, [signal, ...conflicts]);
    expect(result).toBe(0);
  });
});

// ============================================================================
// generateTrendSignals
// ============================================================================

describe('generateTrendSignals', () => {
  test('returns empty when disabled', () => {
    S.signalConfig = { trendFollowing: { enabled: false } };
    expect(generateTrendSignals()).toEqual([]);
  });

  test('returns empty when not enough RL data', () => {
    S.rl = [{ date: '2026-01-01', west: { '2x4#2': 400 } }];
    expect(generateTrendSignals()).toEqual([]);
  });

  test('generates bullish signal on ascending MAs', () => {
    // Create 35 data points ending today, steadily rising prices
    const now = new Date();
    S.rl = [];
    for (let i = 34; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 2);
      S.rl.push({
        date: d.toISOString().split('T')[0],
        west: { '2x4#2': 350 + (34 - i) * 5 },
        central: {},
        east: {}
      });
    }
    const signals = generateTrendSignals();
    const bullish = signals.filter(s => s.direction === 'buy' && s.product === '2x4#2');
    expect(bullish.length).toBeGreaterThanOrEqual(1);
    expect(bullish[0].type).toBe('trend');
  });

  test('generates bearish signal on descending MAs', () => {
    const now = new Date();
    S.rl = [];
    for (let i = 34; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 2);
      S.rl.push({
        date: d.toISOString().split('T')[0],
        west: { '2x4#2': 600 - (34 - i) * 5 },
        central: {},
        east: {}
      });
    }
    const signals = generateTrendSignals();
    const bearish = signals.filter(s => s.direction === 'sell' && s.product === '2x4#2');
    expect(bearish.length).toBeGreaterThanOrEqual(1);
    expect(bearish[0].type).toBe('trend');
  });
});

// ============================================================================
// generateMeanReversionSignals
// ============================================================================

describe('generateMeanReversionSignals', () => {
  test('returns empty when disabled', () => {
    S.signalConfig = { meanReversion: { enabled: false } };
    expect(generateMeanReversionSignals()).toEqual([]);
  });

  test('generates buy signal when z-score < -1.5', () => {
    // Create 35 data points ending today: 30 near 400, then sharp drop
    const now = new Date();
    S.rl = [];
    for (let i = 34; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 2);
      const idx = 34 - i;
      const price = idx < 30 ? 400 + (Math.sin(idx) * 5) : 340;
      S.rl.push({
        date: d.toISOString().split('T')[0],
        west: { '2x4#2': price },
        central: {},
        east: {}
      });
    }
    const signals = generateMeanReversionSignals();
    const buySignals = signals.filter(s => s.direction === 'buy' && s.product === '2x4#2');
    expect(buySignals.length).toBeGreaterThanOrEqual(1);
    expect(buySignals[0].type).toBe('meanReversion');
  });

  test('generates sell signal when z-score > 1.5', () => {
    const now = new Date();
    S.rl = [];
    for (let i = 34; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 2);
      const idx = 34 - i;
      const price = idx < 30 ? 400 + (Math.sin(idx) * 5) : 470;
      S.rl.push({
        date: d.toISOString().split('T')[0],
        west: { '2x4#2': price },
        central: {},
        east: {}
      });
    }
    const signals = generateMeanReversionSignals();
    const sellSignals = signals.filter(s => s.direction === 'sell' && s.product === '2x4#2');
    expect(sellSignals.length).toBeGreaterThanOrEqual(1);
  });

  test('returns empty when prices are within normal range', () => {
    const now = new Date();
    S.rl = [];
    for (let i = 34; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 2);
      S.rl.push({
        date: d.toISOString().split('T')[0],
        west: { '2x4#2': 400 },
        central: {},
        east: {}
      });
    }
    const signals = generateMeanReversionSignals();
    expect(signals).toEqual([]);
  });
});
