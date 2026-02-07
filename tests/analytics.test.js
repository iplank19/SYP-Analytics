/**
 * Tests for analytics functions (js/analytics.js)
 */
const { getSource, resetState } = require('./setup');

// Load dependencies in order
eval(getSource('js/state.js'));
eval(getSource('js/utils.js'));
eval(getSource('js/analytics.js'));

beforeEach(() => {
  resetState();
});

// Helper to create relative date strings
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

// ============================================================================
// calcTopProducts
// ============================================================================

describe('calcTopProducts', () => {
  test('returns empty lists for empty input', () => {
    const result = calcTopProducts([], []);
    expect(result.byVolume).toEqual([]);
    expect(result.byProfit).toEqual([]);
  });

  test('sorts products by volume', () => {
    const buys = [
      { product: '2x4#2', volume: 100, price: 400, orderNum: 'A1' },
      { product: '2x6#2', volume: 200, price: 450, orderNum: 'A2' }
    ];
    const sells = [
      { product: '2x4#2', volume: 50, price: 420, freight: 0, orderNum: 'A1' },
      { product: '2x6#2', volume: 150, price: 470, freight: 0, orderNum: 'A2' }
    ];
    S.buys = buys;
    const result = calcTopProducts(buys, sells);
    // 2x6#2 total vol=200+150=350, 2x4#2 total vol=100+50=150
    expect(result.byVolume[0].product).toBe('2x6#2');
    expect(result.byVolume[1].product).toBe('2x4#2');
  });

  test('calculates matched profit correctly', () => {
    const buys = [
      { product: '2x4#2', volume: 100, price: 400, orderNum: 'A1' }
    ];
    const sells = [
      { product: '2x4#2', volume: 100, price: 420, freight: 0, orderNum: 'A1' }
    ];
    S.buys = buys;
    const result = calcTopProducts(buys, sells);
    // Profit = (420 - 0/100 - 400) * 100 = 2000
    const prod = result.byProfit.find(p => p.product === '2x4#2');
    expect(prod.profit).toBe(2000);
  });

  test('unmatched sell yields 0 profit', () => {
    const buys = [];
    const sells = [
      { product: '2x4#2', volume: 50, price: 420, freight: 0, orderNum: 'X999' }
    ];
    S.buys = buys;
    const result = calcTopProducts(buys, sells);
    const prod = result.byVolume.find(p => p.product === '2x4#2');
    expect(prod.profit).toBe(0);
  });

  test('accounts for freight in FOB calculation', () => {
    const buys = [
      { product: '2x4#2', volume: 100, price: 400, orderNum: 'A1' }
    ];
    const sells = [
      { product: '2x4#2', volume: 100, price: 420, freight: 1000, orderNum: 'A1' }
    ];
    S.buys = buys;
    const result = calcTopProducts(buys, sells);
    // sellFob = 420 - 1000/100 = 410, profit = (410 - 400) * 100 = 1000
    const prod = result.byProfit.find(p => p.product === '2x4#2');
    expect(prod.profit).toBe(1000);
  });
});

// ============================================================================
// calcTopCustomers
// ============================================================================

describe('calcTopCustomers', () => {
  test('returns empty for no sells', () => {
    expect(calcTopCustomers([])).toEqual([]);
  });

  test('sorts customers by volume', () => {
    S.buys = [
      { product: '2x4#2', volume: 100, price: 400, orderNum: 'A1' },
      { product: '2x4#2', volume: 200, price: 400, orderNum: 'A2' }
    ];
    const sells = [
      { customer: 'Big Co', product: '2x4#2', volume: 200, price: 420, freight: 0, orderNum: 'A2' },
      { customer: 'Small Co', product: '2x4#2', volume: 50, price: 420, freight: 0, orderNum: 'A1' }
    ];
    const result = calcTopCustomers(sells);
    expect(result[0].customer).toBe('Big Co');
    expect(result[0].volume).toBe(200);
    expect(result[1].customer).toBe('Small Co');
    expect(result[1].volume).toBe(50);
  });

  test('calculates profit from matched orders', () => {
    S.buys = [
      { product: '2x4#2', volume: 100, price: 400, orderNum: 'A1' }
    ];
    const sells = [
      { customer: 'Test Corp', product: '2x4#2', volume: 100, price: 450, freight: 500, orderNum: 'A1' }
    ];
    const result = calcTopCustomers(sells);
    // sellFob = 450 - 500/100 = 445, profit = (445-400)*100 = 4500
    expect(result[0].profit).toBe(4500);
  });

  test('counts orders correctly', () => {
    S.buys = [];
    const sells = [
      { customer: 'Test Corp', product: '2x4#2', volume: 50, price: 420, freight: 0, orderNum: 'X1' },
      { customer: 'Test Corp', product: '2x6#2', volume: 30, price: 430, freight: 0, orderNum: 'X2' },
      { customer: 'Other', product: '2x4#2', volume: 20, price: 410, freight: 0, orderNum: 'X3' }
    ];
    const result = calcTopCustomers(sells);
    const testCorp = result.find(c => c.customer === 'Test Corp');
    expect(testCorp.orders).toBe(2);
  });
});

// ============================================================================
// calcAgingSummary
// ============================================================================

describe('calcAgingSummary', () => {
  test('returns zeros for empty buys', () => {
    const result = calcAgingSummary([]);
    expect(result.fresh).toBe(0);
    expect(result.week).toBe(0);
    expect(result.twoToFourWeek).toBe(0);
    expect(result.old).toBe(0);
    expect(result.total).toBe(0);
  });

  test('classifies fresh inventory (0-7 days)', () => {
    const buys = [
      { date: daysAgo(3), volume: 100, orderNum: 'A1', product: '2x4#2' }
    ];
    S.sells = [];
    const result = calcAgingSummary(buys);
    expect(result.fresh).toBe(100);
    expect(result.total).toBe(100);
  });

  test('classifies weekly inventory (8-14 days)', () => {
    const buys = [
      { date: daysAgo(10), volume: 75, orderNum: 'B1', product: '2x4#2' }
    ];
    S.sells = [];
    const result = calcAgingSummary(buys);
    expect(result.week).toBe(75);
  });

  test('classifies old inventory (>30 days)', () => {
    const buys = [
      { date: daysAgo(45), volume: 50, orderNum: 'C1', product: '2x4#2' }
    ];
    S.sells = [];
    const result = calcAgingSummary(buys);
    expect(result.old).toBe(50);
  });

  test('excludes fully sold inventory', () => {
    const buys = [
      { date: daysAgo(3), volume: 100, orderNum: 'A1', product: '2x4#2' }
    ];
    S.sells = [
      { volume: 100, orderNum: 'A1', linkedPO: '', oc: '' }
    ];
    const result = calcAgingSummary(buys);
    expect(result.total).toBe(0);
  });

  test('counts only remaining volume for partially sold', () => {
    const buys = [
      { date: daysAgo(3), volume: 100, orderNum: 'A1', product: '2x4#2' }
    ];
    S.sells = [
      { volume: 60, orderNum: 'A1', linkedPO: '', oc: '' }
    ];
    const result = calcAgingSummary(buys);
    expect(result.fresh).toBe(40);
    expect(result.total).toBe(40);
  });
});

// ============================================================================
// calcMarketMovers
// ============================================================================

describe('calcMarketMovers', () => {
  test('returns empty when rl is undefined', () => {
    S.rl = undefined;
    expect(calcMarketMovers()).toEqual([]);
  });

  test('returns empty when fewer than 2 RL entries', () => {
    S.rl = [{ date: '2026-01-01', west: { '2x4#2': 400 }, central: {}, east: {} }];
    expect(calcMarketMovers()).toEqual([]);
  });

  test('returns top 5 movers sorted by absolute change', () => {
    S.rl = [
      {
        date: '2026-01-01',
        west: { '2x4#2': 400, '2x6#2': 500, '2x8#2': 350 },
        central: { '2x4#2': 380 },
        east: {}
      },
      {
        date: '2026-01-08',
        west: { '2x4#2': 430, '2x6#2': 490, '2x8#2': 370 },
        central: { '2x4#2': 400 },
        east: {}
      }
    ];
    const movers = calcMarketMovers();
    expect(movers.length).toBeLessThanOrEqual(5);
    // Largest absolute change should be first
    expect(Math.abs(movers[0].change)).toBeGreaterThanOrEqual(Math.abs(movers[movers.length - 1].change));
  });

  test('includes correct change and percentage', () => {
    S.rl = [
      { date: '2026-01-01', west: { '2x4#2': 400 }, central: {}, east: {} },
      { date: '2026-01-08', west: { '2x4#2': 420 }, central: {}, east: {} }
    ];
    const movers = calcMarketMovers();
    const m = movers.find(m => m.product === '2x4#2');
    expect(m.change).toBe(20);
    expect(m.pct).toBe(5);
  });
});

// ============================================================================
// calcTraderLeaderboard
// ============================================================================

describe('calcTraderLeaderboard', () => {
  test('returns all 6 traders', () => {
    const board = calcTraderLeaderboard('all');
    expect(board.length).toBe(6);
    const names = board.map(t => t.name);
    expect(names).toContain('Ian P');
    expect(names).toContain('Aubrey M');
    expect(names).toContain('Hunter S');
    expect(names).toContain('Sawyer R');
    expect(names).toContain('Jackson M');
    expect(names).toContain('John W');
  });

  test('calculates correct profit and win rate', () => {
    S.buys = [
      { trader: 'Ian P', product: '2x4#2', volume: 100, price: 400, orderNum: 'A1', date: daysAgo(5) },
      { trader: 'Ian P', product: '2x4#2', volume: 100, price: 410, orderNum: 'A2', date: daysAgo(3) }
    ];
    S.sells = [
      { trader: 'Ian P', product: '2x4#2', volume: 100, price: 430, freight: 0, orderNum: 'A1', date: daysAgo(4) },
      { trader: 'Ian P', product: '2x4#2', volume: 100, price: 400, freight: 0, orderNum: 'A2', date: daysAgo(2) }
    ];
    const board = calcTraderLeaderboard('30d');
    const ian = board.find(t => t.name === 'Ian P');
    // Trade 1: (430-400)*100 = 3000, Trade 2: (400-410)*100 = -1000
    expect(ian.profit).toBe(2000);
    // 1 win, 1 loss → 50% win rate
    expect(ian.winRate).toBe(50);
  });

  test('ranks traders by profit descending', () => {
    S.buys = [
      { trader: 'Ian P', product: '2x4#2', volume: 100, price: 400, orderNum: 'A1', date: daysAgo(5) },
      { trader: 'Aubrey M', product: '2x4#2', volume: 100, price: 400, orderNum: 'B1', date: daysAgo(5) }
    ];
    S.sells = [
      { trader: 'Ian P', product: '2x4#2', volume: 100, price: 450, freight: 0, orderNum: 'A1', date: daysAgo(3) },
      { trader: 'Aubrey M', product: '2x4#2', volume: 100, price: 420, freight: 0, orderNum: 'B1', date: daysAgo(3) }
    ];
    const board = calcTraderLeaderboard('30d');
    expect(board[0].name).toBe('Ian P');
    expect(board[0].profit).toBe(5000);
    expect(board[1].name).toBe('Aubrey M');
    expect(board[1].profit).toBe(2000);
  });

  test('handles trader with no trades', () => {
    const board = calcTraderLeaderboard('30d');
    const john = board.find(t => t.name === 'John W');
    expect(john.profit).toBe(0);
    expect(john.volume).toBe(0);
    expect(john.winRate).toBe(0);
  });
});
