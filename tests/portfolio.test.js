/**
 * Tests for portfolio management functions (js/portfolio.js)
 */
const { getSource, resetState } = require('./setup');

// Load dependencies in order
eval(getSource('js/state.js'));
eval(getSource('js/utils.js'));
eval(getSource('js/portfolio.js'));

beforeEach(() => {
  resetState();
});

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

// ============================================================================
// getMarketPrice
// ============================================================================

describe('getMarketPrice', () => {
  test('returns null when rl is empty', () => {
    S.rl = [];
    expect(getMarketPrice('2x4#2', 'west')).toBeNull();
  });

  test('returns exact match from latest RL', () => {
    S.rl = [{ date: '2026-01-01', west: { '2x4#2': 420 }, central: {}, east: {} }];
    expect(getMarketPrice('2x4#2', 'west')).toBe(420);
  });

  test('falls back to #2 suffix', () => {
    S.rl = [{ date: '2026-01-01', west: { '2x4#2': 415 }, central: {}, east: {} }];
    expect(getMarketPrice('2x4', 'west')).toBe(415);
  });

  test('falls back to composite', () => {
    S.rl = [{
      date: '2026-01-01',
      west: {},
      central: {},
      east: {},
      composite: { west: { '2x4#2': 410 } }
    }];
    expect(getMarketPrice('2x4#2', 'west')).toBe(410);
  });

  test('returns null when product not found', () => {
    S.rl = [{ date: '2026-01-01', west: { '2x4#2': 420 }, central: {}, east: {} }];
    expect(getMarketPrice('2x12#1', 'west')).toBeNull();
  });

  test('returns price from specified region', () => {
    S.rl = [{
      date: '2026-01-01',
      west: { '2x4#2': 420 },
      central: { '2x4#2': 380 },
      east: { '2x4#2': 360 }
    }];
    expect(getMarketPrice('2x4#2', 'central')).toBe(380);
    expect(getMarketPrice('2x4#2', 'east')).toBe(360);
  });
});

// ============================================================================
// calcBasis
// ============================================================================

describe('calcBasis', () => {
  test('returns positive basis when trade price > market', () => {
    S.rl = [{ date: '2026-01-01', west: { '2x4#2': 400 }, central: {}, east: {} }];
    const result = calcBasis(420, '2x4#2', 'west');
    expect(result.basis).toBe(20);
    expect(result.basisPct).toBe(5);
  });

  test('returns negative basis when trade price < market', () => {
    S.rl = [{ date: '2026-01-01', west: { '2x4#2': 400 }, central: {}, east: {} }];
    const result = calcBasis(380, '2x4#2', 'west');
    expect(result.basis).toBe(-20);
    expect(result.basisPct).toBe(-5);
  });

  test('returns zero basis when prices match', () => {
    S.rl = [{ date: '2026-01-01', west: { '2x4#2': 400 }, central: {}, east: {} }];
    const result = calcBasis(400, '2x4#2', 'west');
    expect(result.basis).toBe(0);
    expect(result.basisPct).toBe(0);
  });

  test('returns null when no market price', () => {
    S.rl = [];
    expect(calcBasis(400, '2x4#2', 'west')).toBeNull();
  });

  test('includes trade and market price in result', () => {
    S.rl = [{ date: '2026-01-01', west: { '2x4#2': 400 }, central: {}, east: {} }];
    const result = calcBasis(420, '2x4#2', 'west');
    expect(result.tradePrice).toBe(420);
    expect(result.marketPrice).toBe(400);
  });
});

// ============================================================================
// calcHedgeRatio
// ============================================================================

describe('calcHedgeRatio', () => {
  test('returns 0 hedge ratio with no trades', () => {
    const result = calcHedgeRatio();
    expect(result.hedgeRatio).toBe(0);
    expect(result.netPosition).toBe(0);
  });

  test('fully hedged when sold equals bought', () => {
    S.buys = [{ product: '2x4#2', volume: 100 }];
    S.sells = [{ product: '2x4#2', volume: 100 }];
    const result = calcHedgeRatio();
    expect(result.hedgeRatio).toBe(1);
    expect(result.isFullyHedged).toBe(true);
    expect(result.netPosition).toBe(0);
  });

  test('detects over-hedged position', () => {
    S.buys = [{ product: '2x4#2', volume: 100 }];
    S.sells = [{ product: '2x4#2', volume: 150 }];
    const result = calcHedgeRatio();
    expect(result.hedgeRatio).toBe(1.5);
    expect(result.isOverHedged).toBe(true);
    expect(result.netPosition).toBe(-50);
  });

  test('filters by product when specified', () => {
    S.buys = [
      { product: '2x4#2', volume: 100 },
      { product: '2x6#2', volume: 200 }
    ];
    S.sells = [
      { product: '2x4#2', volume: 50 },
      { product: '2x6#2', volume: 200 }
    ];
    const result = calcHedgeRatio('2x4#2');
    expect(result.bought).toBe(100);
    expect(result.sold).toBe(50);
    expect(result.hedgeRatio).toBe(0.5);
  });

  test('reports portfolio label when no product filter', () => {
    const result = calcHedgeRatio();
    expect(result.product).toBe('Portfolio');
  });

  test('isFullyHedged is true at 90% hedge ratio', () => {
    S.buys = [{ product: '2x4#2', volume: 100 }];
    S.sells = [{ product: '2x4#2', volume: 91 }];
    const result = calcHedgeRatio();
    expect(result.isFullyHedged).toBe(true);
  });
});

// ============================================================================
// getOptimalInventory
// ============================================================================

describe('getOptimalInventory', () => {
  test('returns empty when no sales and no inventory', () => {
    const result = getOptimalInventory();
    expect(result).toEqual([]);
  });

  test('detects low inventory status', () => {
    // Sell 100 MBF in last 30 days → avg daily = 100/30 ≈ 3.33
    // 7 days of inventory = ~23 MBF. Current inv = 10 → low
    S.sells = [
      { product: '2x4#2', volume: 100, date: daysAgo(5), price: 420, orderNum: 'S1' }
    ];
    S.buys = [
      { product: '2x4#2', volume: 10, price: 400, orderNum: 'B1', po: 'B1', date: daysAgo(2) }
    ];
    const result = getOptimalInventory();
    const item = result.find(r => r.product === '2x4#2');
    expect(item).toBeTruthy();
    expect(item.status).toBe('low');
    expect(item.action).toBe('buy');
  });

  test('detects excess inventory status', () => {
    // Sell 10 MBF in 30 days → avg daily = 0.33
    // 30 days of inventory = 10 MBF. Current inv = 500 → excess
    S.sells = [
      { product: '2x4#2', volume: 10, date: daysAgo(5), price: 420, orderNum: 'S1' }
    ];
    S.buys = [
      { product: '2x4#2', volume: 500, price: 400, orderNum: 'B1', po: 'B1', date: daysAgo(2) }
    ];
    const result = getOptimalInventory();
    const item = result.find(r => r.product === '2x4#2');
    expect(item).toBeTruthy();
    expect(item.status).toBe('excess');
    expect(item.action).toBe('reduce');
  });
});

// ============================================================================
// getInventoryTurnover
// ============================================================================

describe('getInventoryTurnover', () => {
  test('returns zero ratio with no data', () => {
    S.buys = [];
    S.sells = [];
    const result = getInventoryTurnover();
    expect(result.turnoverRatio).toBe(0);
    expect(result.currentInventory).toBe(0);
  });

  test('calculates correct turnover ratio', () => {
    S.buys = [
      { product: '2x4#2', volume: 100, price: 400, orderNum: 'A1', po: 'A1', date: daysAgo(10) }
    ];
    S.sells = [
      { product: '2x4#2', volume: 50, price: 420, freight: 0, orderNum: 'A1', linkedPO: '', oc: '', date: daysAgo(5) }
    ];
    const result = getInventoryTurnover();
    // Remaining inventory: 50 MBF at $400 = $20,000
    // COGS (90d): buy.price * sell.volume = 400*50 = $20,000
    // Annualized COGS: $80,000
    // Turnover ratio: 80000 / 20000 = 4.0
    expect(result.currentInventory).toBe(50);
    expect(result.cogs90Day).toBe(20000);
    expect(result.turnoverRatio).toBe(4);
    expect(result.daysToTurn).toBeCloseTo(91.25, 0);
  });

  test('calculates daysToTurn', () => {
    S.buys = [
      { product: '2x4#2', volume: 200, price: 400, orderNum: 'A1', po: 'A1', date: daysAgo(10) }
    ];
    S.sells = [
      { product: '2x4#2', volume: 100, price: 420, freight: 0, orderNum: 'A1', linkedPO: '', oc: '', date: daysAgo(5) }
    ];
    const result = getInventoryTurnover();
    // Remaining: 100 at $400 = $40,000
    // COGS 90d: 400*100 = $40,000
    // Annualized: $160,000
    // Ratio: 160000/40000 = 4
    // DaysToTurn: 365/4 = 91.25
    expect(result.daysToTurn).toBeCloseTo(91.25, 0);
  });
});

// ============================================================================
// calcDailyMTM
// ============================================================================

describe('calcDailyMTM', () => {
  test('returns zero totals when no RL data', () => {
    S.rl = [];
    const result = calcDailyMTM();
    expect(result.totalValue).toBe(0);
    expect(result.totalCost).toBe(0);
    expect(result.unrealizedPnL).toBe(0);
  });

  test('calculates unrealized P&L for open positions', () => {
    S.rl = [{ date: daysAgo(0), west: { '2x4#2': 420 }, central: {}, east: {} }];
    S.buys = [
      { product: '2x4#2', volume: 100, price: 400, region: 'west', orderNum: 'A1', po: 'A1', date: daysAgo(5) }
    ];
    S.sells = [];
    const result = calcDailyMTM();
    // Market value: 420 * 100 = 42000
    // Cost: 400 * 100 = 40000
    // Unrealized: 2000
    expect(result.totalValue).toBe(42000);
    expect(result.totalCost).toBe(40000);
    expect(result.unrealizedPnL).toBe(2000);
    expect(result.positions.length).toBe(1);
  });

  test('excludes fully sold positions', () => {
    S.rl = [{ date: daysAgo(0), west: { '2x4#2': 420 }, central: {}, east: {} }];
    S.buys = [
      { product: '2x4#2', volume: 100, price: 400, region: 'west', orderNum: 'A1', po: 'A1', date: daysAgo(5) }
    ];
    S.sells = [
      { volume: 100, orderNum: 'A1', linkedPO: '', oc: '' }
    ];
    const result = calcDailyMTM();
    expect(result.positions.length).toBe(0);
    expect(result.totalValue).toBe(0);
  });
});
