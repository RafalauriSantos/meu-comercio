import { describe, it, expect } from 'vitest';
import { InMemoryRecoveryStore } from '../testing/recovery-fakes';
import { GetOwnerEmailStatusUseCase } from './get-owner-email-status.use-case';

function setup() {
  const owners = new InMemoryRecoveryStore();
  return { owners, useCase: new GetOwnerEmailStatusUseCase({ owners }) };
}

describe('GetOwnerEmailStatusUseCase', () => {
  it('AC-62: owner without e-mail gives null and not verified', async () => {
    const { owners, useCase } = setup();
    owners.addUser('dona');
    expect(await useCase.execute({ username: 'dona' })).toEqual({ email: null, verified: false });
  });

  it('AC-63: e-mail not confirmed gives the address and verified false', async () => {
    const { owners, useCase } = setup();
    owners.addUser('dona', { email: 'maria@gmail.com' });
    expect(await useCase.execute({ username: 'dona' })).toEqual({ email: 'maria@gmail.com', verified: false });
  });

  it('confirmed e-mail gives verified true', async () => {
    const { owners, useCase } = setup();
    owners.addUser('dona', { email: 'maria@gmail.com', verifiedAt: new Date('2026-11-21T10:00:00Z') });
    expect(await useCase.execute({ username: 'dona' })).toEqual({ email: 'maria@gmail.com', verified: true });
  });

  it('unknown user is treated as no e-mail, without throwing', async () => {
    const { useCase } = setup();
    expect(await useCase.execute({ username: 'ninguem' })).toEqual({ email: null, verified: false });
  });
});
