/**
 * Extended tests for P&L attribution engine (js/pnl.js)
 */
const { getSource, resetState } = require('./setup');

// Load dependencies in order
eval(getSource('js/state.js'));
eval(getSource('js/utils.js'));
eval(getSource('js/analytics.js'));
eval(getSource('js/pnl.js'));

beforeEach(() => {
  resetState();
});

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

// ============================================================================
// getMTMPnL
// ============================================================================

describe('getMTMPnL', () => {
  test('returns empty positions when RL is empty', () => {
    S.rl = [];
    const result = getMTMPnL();
    expect(result.positions).toEqual([]);
    expect(result.totalUnrealized).toBe(0);
  });

  test('calculates unrealized P&L for open position', () => {
    S.rl = [{ date: daysAgo(0), west: { '2x4#2': 420 }, central: {}, east: {} }];
    S.buys = [
      { product: '2x4#2', volume: 100, price: 400, region: 'west', orderNum: 'A1', po: 'A1', date: daysAgo(5) }
    ];
    S.sells = [];
    const result = getMTMPnL();
    // unrealized = (420 - 400) * 100 = 2000
    expect(result.positions.length).toBe(1);
    expect(result.totalUnrealized).toBe(2000);
    expect(result.positions[0].volume).toBe(100);
    expect(result.positions[0].marketPrice).toBe(420);
  });

  test('excludes fully sold positions', () => {
    S.rl = [{ date: daysAgo(0), west: { '2x4#2': 420 }, central: {}, east: {} }];
    S.buys = [
      { product: '2x4#2', volume: 100, price: 400, region: 'west', orderNum: 'A1', po: 'A1', date: daysAgo(5) }
    ];
    S.sells = [
      { product: '2x4#2', volume: 100, price: 420, orderNum: 'A1', linkedPO: '', oc: '', date: daysAgo(3) }
    ];
    const result = getMTMPnL();
    expect(result.positions.length).toBe(0);
    expect(result.totalUnrealized).toBe(0);
  });

  test('calculates partial position correctly', () => {
    S.rl = [{ date: daysAgo(0), west: { '2x4#2': 420 }, central: {}, east: {} }];
    S.buys = [
      { product: '2x4#2', volume: 100, price: 400, region: 'west', orderNum: 'A1', po: 'A1', date: daysAgo(5) }
    ];
    S.sells = [
      { product: '2x4#2', volume: 60, price: 420, orderNum: 'A1', linkedPO: '', oc: '', date: daysAgo(3) }
    ];
    const result = getMTMPnL();
    // Remaining: 40 MBF, cost=400*40=16000, market=420*40=16800, unrealized=800
    expect(result.positions.length).toBe(1);
    expect(result.totalUnrealized).toBe(800);
  });

  test('handles negative unrealized P&L', () => {
    S.rl = [{ date: daysAgo(0), west: { '2x4#2': 380 }, central: {}, east: {} }];
    S.buys = [
      { product: '2x4#2', volume: 100, price: 400, region: 'west', orderNum: 'A1', po: 'A1', date: daysAgo(5) }
    ];
    S.sells = [];
    const result = getMTMPnL();
    // unrealized = (380 - 400) * 100 = -2000
    expect(result.totalUnrealized).toBe(-2000);
  });

  test('aggregates multiple positions by product+region', () => {
    S.rl = [{ date: daysAgo(0), west: { '2x4#2': 420 }, central: {}, east: {} }];
    S.buys = [
      { product: '2x4#2', volume: 50, price: 400, region: 'west', orderNum: 'A1', po: 'A1', date: daysAgo(5) },
      { product: '2x4#2', volume: 50, price: 410, region: 'west', orderNum: 'A2', po: 'A2', date: daysAgo(3) }
    ];
    S.sells = [];
    const result = getMTMPnL();
    // Aggregated: 100 MBF, cost = 50*400 + 50*410 = 40500, market = 100*420 = 42000
    expect(result.positions.length).toBe(1);
    expect(result.totalVolume).toBe(100);
    expect(result.totalUnrealized).toBe(1500);
  });
});

// ============================================================================
// getRollingPnL
// ============================================================================

describe('getRollingPnL', () => {
  test('returns correct number of days', () => {
    const result = getRollingPnL(7);
    expect(result.length).toBe(7);
  });

  test('returns zeros when no trades', () => {
    const result = getRollingPnL(7);
    result.forEach(d => {
      expect(d.pnl).toBe(0);
      expect(d.volume).toBe(0);
    });
  });

  test('cumulative sums correctly', () => {
    S.buys = [
      { product: '2x4#2', volume: 100, price: 400, orderNum: 'A1', po: 'A1', date: daysAgo(5) }
    ];
    S.sells = [
      { product: '2x4#2', volume: 100, price: 420, freight: 0, orderNum: 'A1', linkedPO: '', oc: '', date: daysAgo(3) }
    ];
    const result = getRollingPnL(7);
    // Some day will have PnL = 2000, cumulative should reflect that
    const totalPnL = result.reduce((sum, d) => sum + d.pnl, 0);
    const lastCumulative = result[result.length - 1].cumulative;
    expect(lastCumulative).toBe(totalPnL);
  });

  test('gap days have zero P&L', () => {
    const result = getRollingPnL(30);
    // Most days should have 0 P&L
    const zeroDays = result.filter(d => d.pnl === 0);
    expect(zeroDays.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// getPnLBreakdown
// ============================================================================

describe('getPnLBreakdown', () => {
  test('groups by product', () => {
    S.buys = [
      { product: '2x4#2', volume: 100, price: 400, orderNum: 'A1', po: 'A1', date: daysAgo(5) },
      { product: '2x6#2', volume: 50, price: 450, orderNum: 'B1', po: 'B1', date: daysAgo(5) }
    ];
    S.sells = [
      { product: '2x4#2', volume: 100, price: 430, freight: 0, orderNum: 'A1', linkedPO: '', oc: '', date: daysAgo(3), trader: 'Ian P' },
      { product: '2x6#2', volume: 50, price: 470, freight: 0, orderNum: 'B1', linkedPO: '', oc: '', date: daysAgo(3), trader: 'Ian P' }
    ];
    const result = getPnLBreakdown({ groupBy: 'product', period: '30d' });
    expect(result.items.length).toBe(2);
    const prod2x4 = result.items.find(i => i.key === '2x4#2');
    const prod2x6 = result.items.find(i => i.key === '2x6#2');
    // 2x4: (430-400)*100 = 3000
    expect(prod2x4.pnl).toBe(3000);
    // 2x6: (470-450)*50 = 1000
    expect(prod2x6.pnl).toBe(1000);
  });

  test('groups by trader', () => {
    S.buys = [
      { product: '2x4#2', volume: 100, price: 400, orderNum: 'A1', po: 'A1', trader: 'Ian P', date: daysAgo(5) },
      { product: '2x4#2', volume: 100, price: 400, orderNum: 'B1', po: 'B1', trader: 'Aubrey M', date: daysAgo(5) }
    ];
    S.sells = [
      { product: '2x4#2', volume: 100, price: 430, freight: 0, orderNum: 'A1', linkedPO: '', oc: '', trader: 'Ian P', date: daysAgo(3) },
      { product: '2x4#2', volume: 100, price: 420, freight: 0, orderNum: 'B1', linkedPO: '', oc: '', trader: 'Aubrey M', date: daysAgo(3) }
    ];
    const result = getPnLBreakdown({ groupBy: 'trader', period: '30d' });
    const ian = result.items.find(i => i.key === 'Ian P');
    const aubrey = result.items.find(i => i.key === 'Aubrey M');
    expect(ian.pnl).toBe(3000);
    expect(aubrey.pnl).toBe(2000);
  });

  test('groups by customer', () => {
    S.buys = [
      { product: '2x4#2', volume: 100, price: 400, orderNum: 'A1', po: 'A1', date: daysAgo(5) }
    ];
    S.sells = [
      { product: '2x4#2', volume: 50, price: 430, freight: 0, orderNum: 'A1', linkedPO: '', oc: '', customer: 'Cust A', date: daysAgo(3) },
      { product: '2x4#2', volume: 50, price: 440, freight: 0, orderNum: 'A1', linkedPO: '', oc: '', customer: 'Cust B', date: daysAgo(2) }
    ];
    const result = getPnLBreakdown({ groupBy: 'customer', period: '30d' });
    const custA = result.items.find(i => i.key === 'Cust A');
    const custB = result.items.find(i => i.key === 'Cust B');
    expect(custA.pnl).toBe(1500); // (430-400)*50
    expect(custB.pnl).toBe(2000); // (440-400)*50
  });

  test('respects period filter', () => {
    S.buys = [
      { product: '2x4#2', volume: 100, price: 400, orderNum: 'A1', po: 'A1', date: daysAgo(60) }
    ];
    S.sells = [
      { product: '2x4#2', volume: 100, price: 430, freight: 0, orderNum: 'A1', linkedPO: '', oc: '', date: daysAgo(45) }
    ];
    const result7d = getPnLBreakdown({ groupBy: 'product', period: '7d' });
    expect(result7d.items.length).toBe(0);

    const result90d = getPnLBreakdown({ groupBy: 'product', period: '90d' });
    expect(result90d.items.length).toBe(1);
  });

  test('totals sum correctly', () => {
    S.buys = [
      { product: '2x4#2', volume: 100, price: 400, orderNum: 'A1', po: 'A1', date: daysAgo(5) },
      { product: '2x6#2', volume: 50, price: 450, orderNum: 'B1', po: 'B1', date: daysAgo(5) }
    ];
    S.sells = [
      { product: '2x4#2', volume: 100, price: 430, freight: 0, orderNum: 'A1', linkedPO: '', oc: '', date: daysAgo(3) },
      { product: '2x6#2', volume: 50, price: 470, freight: 0, orderNum: 'B1', linkedPO: '', oc: '', date: daysAgo(3) }
    ];
    const result = getPnLBreakdown({ groupBy: 'product', period: '30d' });
    const itemPnLSum = result.items.reduce((s, i) => s + i.pnl, 0);
    expect(result.totals.pnl).toBeCloseTo(itemPnLSum, 2);
    expect(result.totals.pnl).toBe(4000); // 3000 + 1000
  });

  test('returns empty for no sells', () => {
    S.buys = [];
    S.sells = [];
    const result = getPnLBreakdown({ groupBy: 'product', period: '30d' });
    expect(result.items).toEqual([]);
    expect(result.totals.pnl).toBe(0);
  });
});

// ============================================================================
// getContributionAnalysis
// ============================================================================

describe('getContributionAnalysis', () => {
  test('calculates contribution percentages', () => {
    S.buys = [
      { product: '2x4#2', volume: 100, price: 400, orderNum: 'A1', po: 'A1', date: daysAgo(5) },
      { product: '2x6#2', volume: 100, price: 450, orderNum: 'B1', po: 'B1', date: daysAgo(5) }
    ];
    S.sells = [
      { product: '2x4#2', volume: 100, price: 430, freight: 0, orderNum: 'A1', linkedPO: '', oc: '', date: daysAgo(3) },
      { product: '2x6#2', volume: 100, price: 480, freight: 0, orderNum: 'B1', linkedPO: '', oc: '', date: daysAgo(3) }
    ];
    const result = getContributionAnalysis('product', '30d');
    // Each item's pnlContribution should be a percentage
    expect(result.length).toBeGreaterThanOrEqual(2);
    const sum = result.reduce((s, r) => s + r.pnlContribution, 0);
    expect(sum).toBeCloseTo(100, 0);
  });
});
