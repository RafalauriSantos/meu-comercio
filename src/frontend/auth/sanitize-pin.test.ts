import { describe, it, expect } from 'vitest';
import { sanitizePin } from './sanitize-pin';

describe('sanitizePin', () => {
  it.each([
    ['12a4-56 789', '124567'],
    ['', ''],
    ['abc', ''],
    ['1234567890', '123456'],
    ['123456', '123456'],
    ['  7 ', '7'],
  ])('turns %j into %j', (input, expected) => {
    expect(sanitizePin(input)).toBe(expected);
  });
});
