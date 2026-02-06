/**
 * Tests for P&L math: getTradePnLComponents, margin calculations
 */
const { getSource, resetState } = require('./setup');

// Load dependencies in order
eval(getSource('js/state.js'));
eval(getSource('js/utils.js'));
eval(getSource('js/pnl.js'));

describe('getTradePnLComponents', () => {
  beforeEach(() => {
    resetState();
  });

  test('is defined as a function', () => {
    expect(typeof getTradePnLComponents).toBe('function');
  });

  test('returns null for unmatched sell (no buy)', () => {
    S.buys = [];
    const sell = { orderNum: 'PO-999', price: 450, volume: 23, freight: 69 };
    expect(getTradePnLComponents(sell)).toBeNull();
  });

  test('calculates FOB correctly: sellPrice - (freight / volume)', () => {
    S.buys = [
      { orderNum: 'PO-100', price: 400, volume: 23 }
    ];
    const sell = { orderNum: 'PO-100', price: 450, volume: 23, freight: 69 };
    const result = getTradePnLComponents(sell);

    expect(result).not.toBeNull();
    const freightPerMBF = 69 / 23;
    expect(result.netRevenue).toBeCloseTo((450 - freightPerMBF) * 23, 2);
  });

  test('calculates margin correctly: FOB - buyPrice', () => {
    S.buys = [
      { orderNum: 'PO-100', price: 400, volume: 23 }
    ];
    const sell = { orderNum: 'PO-100', price: 450, volume: 23, freight: 69 };
    const result = getTradePnLComponents(sell);

    const freightPerMBF = 69 / 23;
    const expectedMargin = (450 - freightPerMBF) - 400;
    expect(result.marginPerMBF).toBeCloseTo(expectedMargin, 2);
  });

  test('calculates profit correctly: margin * volume', () => {
    S.buys = [
      { orderNum: 'PO-100', price: 400, volume: 23 }
    ];
    const sell = { orderNum: 'PO-100', price: 450, volume: 23, freight: 69 };
    const result = getTradePnLComponents(sell);

    const freightPerMBF = 69 / 23;
    const expectedProfit = ((450 - freightPerMBF) * 23) - (400 * 23);
    expect(result.grossPnL).toBeCloseTo(expectedProfit, 2);
  });

  test('handles zero volume', () => {
    S.buys = [
      { orderNum: 'PO-100', price: 400, volume: 0 }
    ];
    const sell = { orderNum: 'PO-100', price: 450, volume: 0, freight: 0 };
    const result = getTradePnLComponents(sell);

    expect(result).not.toBeNull();
    expect(result.grossPnL).toBe(0);
    expect(result.marginPerMBF).toBe(0);
  });

  test('handles zero freight', () => {
    S.buys = [
      { orderNum: 'PO-100', price: 400, volume: 23 }
    ];
    const sell = { orderNum: 'PO-100', price: 450, volume: 23, freight: 0 };
    const result = getTradePnLComponents(sell);

    expect(result.marginPerMBF).toBeCloseTo(50, 2);
    expect(result.grossPnL).toBeCloseTo(1150, 2);
  });

  test('handles negative margin (losing trade)', () => {
    S.buys = [
      { orderNum: 'PO-100', price: 450, volume: 23 }
    ];
    const sell = { orderNum: 'PO-100', price: 420, volume: 23, freight: 69 };
    const result = getTradePnLComponents(sell);

    expect(result.marginPerMBF).toBeLessThan(0);
    expect(result.grossPnL).toBeLessThan(0);
  });

  test('calculates gross revenue (before freight deduction)', () => {
    S.buys = [
      { orderNum: 'PO-100', price: 400, volume: 23 }
    ];
    const sell = { orderNum: 'PO-100', price: 450, volume: 23, freight: 69 };
    const result = getTradePnLComponents(sell);

    expect(result.grossRevenue).toBe(450 * 23);
    expect(result.freightCost).toBe(69);
  });

  test('calculates margin percentage', () => {
    S.buys = [
      { orderNum: 'PO-100', price: 400, volume: 23 }
    ];
    const sell = { orderNum: 'PO-100', price: 450, volume: 23, freight: 0 };
    const result = getTradePnLComponents(sell);

    // margin% = profit / buyCost * 100 = 1150 / 9200 * 100 ≈ 12.5%
    expect(result.marginPct).toBeCloseTo(12.5, 1);
  });

  test('cross-format order matching works', () => {
    S.buys = [
      { orderNum: 'PO-123', price: 400, volume: 23 }
    ];
    const sell = { orderNum: 'po123', price: 450, volume: 23, freight: 0 };
    const result = getTradePnLComponents(sell);

    expect(result).not.toBeNull();
    expect(result.buy.price).toBe(400);
    expect(result.marginPerMBF).toBeCloseTo(50, 2);
  });
});

describe('P&L edge cases', () => {
  beforeEach(() => {
    resetState();
  });

  test('missing freight field treated as 0', () => {
    S.buys = [
      { orderNum: 'PO-100', price: 400, volume: 23 }
    ];
    const sell = { orderNum: 'PO-100', price: 450, volume: 23 };
    const result = getTradePnLComponents(sell);

    expect(result).not.toBeNull();
    expect(result.freightCost).toBe(0);
    expect(result.marginPerMBF).toBeCloseTo(50, 2);
  });

  test('missing price fields treated as 0', () => {
    S.buys = [
      { orderNum: 'PO-100', volume: 23 }
    ];
    const sell = { orderNum: 'PO-100', volume: 23 };
    const result = getTradePnLComponents(sell);

    expect(result).not.toBeNull();
    expect(result.grossPnL).toBe(0);
  });

  test('large volume trade calculates correctly', () => {
    S.buys = [
      { orderNum: 'PO-BIG', price: 380, volume: 460 }
    ];
    const sell = { orderNum: 'PO-BIG', price: 420, volume: 460, freight: 1380 };
    const result = getTradePnLComponents(sell);

    // freight per MBF = 1380 / 460 = 3
    // FOB = 420 - 3 = 417
    // profit = (417 - 380) * 460 = 37 * 460 = 17020
    expect(result.grossPnL).toBeCloseTo(17020, 2);
  });
});
