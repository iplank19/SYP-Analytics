/**
 * Tests for normalizeOrderNum — the function that matches buys to sells.
 * This catches the exact bug we fixed: 3 conflicting implementations.
 */
const { getSource, resetState } = require('./setup');

// Load state.js which defines normalizeOrderNum
eval(getSource('js/state.js'));

describe('normalizeOrderNum', () => {
  test('is defined as a function', () => {
    expect(typeof normalizeOrderNum).toBe('function');
  });

  test('strips hyphens and lowercases', () => {
    expect(normalizeOrderNum('PO-123')).toBe('po123');
  });

  test('strips underscores and lowercases', () => {
    expect(normalizeOrderNum('PO_123')).toBe('po123');
  });

  test('strips spaces', () => {
    expect(normalizeOrderNum('PO 123')).toBe('po123');
  });

  test('all formats normalize to the same value', () => {
    const variants = ['PO-123', 'po123', 'PO_123', 'PO 123', 'po-123', 'PO123'];
    const normalized = variants.map(normalizeOrderNum);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe('po123');
  });

  test('handles null/undefined/empty', () => {
    expect(normalizeOrderNum(null)).toBe('');
    expect(normalizeOrderNum(undefined)).toBe('');
    expect(normalizeOrderNum('')).toBe('');
  });

  test('handles numeric input', () => {
    expect(normalizeOrderNum(12345)).toBe('12345');
  });

  test('strips special characters (dots, slashes)', () => {
    expect(normalizeOrderNum('PO.123/A')).toBe('po123a');
  });

  test('preserves alphanumeric content', () => {
    expect(normalizeOrderNum('ABC-DEF-789')).toBe('abcdef789');
  });

  test('complex order numbers normalize consistently', () => {
    expect(normalizeOrderNum('ORD#2024-001')).toBe('ord2024001');
    expect(normalizeOrderNum('ord#2024-001')).toBe('ord2024001');
    expect(normalizeOrderNum('ORD#2024_001')).toBe('ord2024001');
  });
});
