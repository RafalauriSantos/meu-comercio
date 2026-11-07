export type SessionDestination = 'pdv' | 'open-cash';

/** Where an operator who already has a session goes when opening /login. */
export function destinationForSession(session: { cashOpen: boolean }): SessionDestination {
  return session.cashOpen ? 'pdv' : 'open-cash';
}
