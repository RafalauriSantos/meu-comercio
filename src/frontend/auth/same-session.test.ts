import { describe, it, expect } from 'vitest';
import { isSameSession } from './same-session';

const maria = { username: 'maria', merchantId: 'm1', authorities: [], isOwner: true };

describe('isSameSession', () => {
  it('is the same person when username and store match', () => {
    const withOtherAuthorities = { ...maria, authorities: ['x'] };
    expect(isSameSession(maria, withOtherAuthorities)).toBe(true);
  });

  it('is another person when the username or the store changes', () => {
    expect(isSameSession(maria, { ...maria, username: 'joao' })).toBe(false);
    expect(isSameSession(maria, { ...maria, merchantId: 'm2' })).toBe(false);
  });

  it('is another person when there was no user on the screen', () => {
    expect(isSameSession(null, maria)).toBe(false);
  });
});
