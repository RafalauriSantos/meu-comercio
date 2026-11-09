import { describe, it, expect } from 'vitest';
import { parseWeightInput, WEIGHT_STEP_GRAMS } from './weight-input';

describe('parseWeightInput', () => {
  it('reads only digits as grams', () => {
    expect(parseWeightInput('350')).toBe(350);
    expect(parseWeightInput(' 1200 ')).toBe(1200);
  });

  it('reads digits with a comma or a point as kilograms', () => {
    expect(parseWeightInput('0,350')).toBe(350);
    expect(parseWeightInput('1.25')).toBe(1250);
    expect(parseWeightInput('2,5')).toBe(2500);
  });

  it('is null for empty, zero or invalid text', () => {
    for (const text of ['', '   ', '0', '0,0', 'abc', '1,2,3', '-5']) {
      expect(parseWeightInput(text), text).toBeNull();
    }
  });

  it('steps the plus and minus buttons by 50 g', () => {
    expect(WEIGHT_STEP_GRAMS).toBe(50);
  });
});
