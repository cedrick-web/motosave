import { describe, expect, it } from 'vitest';
import { calculateGoalProgress } from './finance';

describe('calculateGoalProgress', () => {
  it('returns zero for an empty goal', () => {
    expect(calculateGoalProgress(0, 100)).toBe(0);
  });
  it('returns rounded progress', () => {
    expect(calculateGoalProgress(249, 1000)).toBe(25);
  });
  it('does not exceed one hundred percent', () => {
    expect(calculateGoalProgress(1200, 1000)).toBe(100);
  });
  it('guards against a zero or invalid target', () => {
    expect(calculateGoalProgress(100, 0)).toBe(0);
    expect(calculateGoalProgress(100, Number.NaN)).toBe(0);
  });
  it('does not display negative progress', () => {
    expect(calculateGoalProgress(-20, 100)).toBe(0);
  });
  it('guards against invalid tracked values', () => {
    expect(calculateGoalProgress(Number.NaN, 100)).toBe(0);
  });
});
