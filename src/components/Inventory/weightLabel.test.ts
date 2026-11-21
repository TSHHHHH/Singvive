import { describe, expect, it } from 'vitest';
import { feltWeightLabel, shortKg } from './weightLabel';

describe('weightLabel', () => {
  it('trims to two decimals with no trailing zeros', () => {
    expect(shortKg(1)).toBe('1');
    expect(shortKg(0.65)).toBe('0.65');
    expect(shortKg(0.4 * 0.7)).toBe('0.28');
    expect(shortKg(1.2)).toBe('1.2');
  });

  it('shows felt and raw weight when a factor changes it', () => {
    expect(feltWeightLabel(1, 0.65)).toBe('0.65kg(1kg)');
    expect(feltWeightLabel(0.2, 1.5)).toBe('0.3kg(0.2kg)');
  });

  it('shows a single weight when nothing changes it', () => {
    expect(feltWeightLabel(0.4, 1)).toBe('0.4kg');
    expect(feltWeightLabel(0.001, 0.9)).toBe('0kg');
  });
});
