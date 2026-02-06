/**
 * Tests for order matching: buildOrderSold, buildBuyByOrderForPnL
 * These are the core functions that link buys to sells for P&L calculation.
 */
const { getSource, resetState } = require('./setup');

// Load dependencies in order
eval(getSource('js/state.js'));
eval(getSource('js/utils.js'));
eval(getSource('js/pnl.js'));

describe('buildOrderSold', () => {
  beforeEach(() => {
    resetState();
  });

  test('is defined as a function', () => {
    expect(typeof buildOrderSold).toBe('function');
  });

  test('returns empty object for no sells', () => {
    expect(buildOrderSold([])).toEqual({});
  });

  test('accumulates volume per normalized order', () => {
    const sells = [
      { orderNum: 'PO-123', volume: 10 },
      { orderNum: 'PO-123', volume: 15 }
    ];
    const result = buildOrderSold(sells);
    expect(result['po123']).toBe(25);
  });

  test('normalizes order numbers for matching', () => {
    const sells = [
      { orderNum: 'PO-456', volume: 10 },
      { orderNum: 'po456', volume: 5 },
      { orderNum: 'PO_456', volume: 7 }
    ];
    const result = buildOrderSold(sells);
    expect(result['po456']).toBe(22);
  });

  test('uses linkedPO as fallback', () => {
    const sells = [
      { linkedPO: 'PO-789', volume: 20 }
    ];
    const result = buildOrderSold(sells);
    expect(result['po789']).toBe(20);
  });

  test('uses oc as fallback', () => {
    const sells = [
      { oc: 'OC-001', volume: 15 }
    ];
    const result = buildOrderSold(sells);
    expect(result['oc001']).toBe(15);
  });

  test('skips sells with no order number', () => {
    const sells = [
      { volume: 10 },
      { orderNum: '', volume: 5 },
      { orderNum: 'PO-100', volume: 8 }
    ];
    const result = buildOrderSold(sells);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['po100']).toBe(8);
  });

  test('handles zero volume', () => {
    const sells = [
      { orderNum: 'PO-200', volume: 0 }
    ];
    const result = buildOrderSold(sells);
    expect(result['po200']).toBe(0);
  });

  test('defaults to S.sells when called with no arguments', () => {
    S.sells = [
      { orderNum: 'PO-999', volume: 42 }
    ];
    const result = buildOrderSold();
    expect(result['po999']).toBe(42);
  });

  test('buy PO-123 matches sell po123 (the exact bug we fixed)', () => {
    S.buys = [
      { orderNum: 'PO-123', price: 400, volume: 23, product: '2x4#2', region: 'west' }
    ];
    S.sells = [
      { orderNum: 'po123', price: 450, volume: 23, freight: 69, product: '2x4#2', customer: 'Test' }
    ];

    const orderSold = buildOrderSold(S.sells);
    const normalizedBuyOrder = normalizeOrderNum(S.buys[0].orderNum);
    const normalizedSellOrder = normalizeOrderNum(S.sells[0].orderNum);

    expect(normalizedBuyOrder).toBe(normalizedSellOrder);
    expect(normalizedBuyOrder).toBe('po123');
    expect(orderSold[normalizedBuyOrder]).toBe(23);
  });
});

describe('buildBuyByOrderForPnL', () => {
  beforeEach(() => {
    resetState();
  });

  test('is defined as a function', () => {
    expect(typeof buildBuyByOrderForPnL).toBe('function');
  });

  test('returns empty object for no buys', () => {
    S.buys = [];
    expect(buildBuyByOrderForPnL()).toEqual({});
  });

  test('creates lookup by normalized order number', () => {
    S.buys = [
      { orderNum: 'PO-100', price: 400, volume: 23, product: '2x4#2' },
      { orderNum: 'PO-200', price: 380, volume: 46, product: '2x6#2' }
    ];
    const result = buildBuyByOrderForPnL();
    expect(result['po100'].price).toBe(400);
    expect(result['po200'].price).toBe(380);
  });

  test('first buy wins for duplicate order numbers', () => {
    S.buys = [
      { orderNum: 'PO-100', price: 400, volume: 23 },
      { orderNum: 'PO-100', price: 999, volume: 46 }
    ];
    const result = buildBuyByOrderForPnL();
    expect(result['po100'].price).toBe(400);
  });

  test('uses po field as fallback', () => {
    S.buys = [
      { po: 'PO-300', price: 420, volume: 23 }
    ];
    const result = buildBuyByOrderForPnL();
    expect(result['po300'].price).toBe(420);
  });

  test('skips buys with no order number', () => {
    S.buys = [
      { price: 400, volume: 23 },
      { orderNum: 'PO-400', price: 380, volume: 46 }
    ];
    const result = buildBuyByOrderForPnL();
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['po400']).toBeDefined();
  });

  test('cross-format matching: PO-123 buy matches po123 sell lookup', () => {
    S.buys = [
      { orderNum: 'PO-123', price: 400, volume: 23 }
    ];
    const buyLookup = buildBuyByOrderForPnL();
    const sellOrderNum = 'po123';
    const normalizedSell = normalizeOrderNum(sellOrderNum);

    expect(buyLookup[normalizedSell]).toBeDefined();
    expect(buyLookup[normalizedSell].price).toBe(400);
  });
});
