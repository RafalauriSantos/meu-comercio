export type SessionDestination = 'pdv' | 'open-cash';

/** Where an operator who already has a session goes when opening /login. */
export function destinationForSession(session: { cashOpen: boolean }): SessionDestination {
  return session.cashOpen ? 'pdv' : 'open-cash';
}

/**
 * The path to go to after the login, or null to show the open cash screen. `voltar` is already safe.
 * The PDV still needs an open cash register; any other page (the Gestão) does not.
 */
export function afterLoginPath(session: { cashOpen: boolean; voltar: string | null }): string | null {
  const { cashOpen, voltar } = session;
  if (voltar && (cashOpen || !/^\/pdv([/?#]|$)/.test(voltar))) return voltar;
  return destinationForSession({ cashOpen }) === 'pdv' ? '/pdv' : null;
}
