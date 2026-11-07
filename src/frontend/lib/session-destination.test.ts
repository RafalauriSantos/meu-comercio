import { describe, it, expect } from 'vitest';
import { destinationForSession } from './session-destination';

describe('destinationForSession', () => {
  it('sends an operator with the cash register open straight to the PDV', () => {
    expect(destinationForSession({ cashOpen: true })).toBe('pdv');
  });

  it('asks an authenticated operator to open the cash register when it is closed', () => {
    expect(destinationForSession({ cashOpen: false })).toBe('open-cash');
  });
});
