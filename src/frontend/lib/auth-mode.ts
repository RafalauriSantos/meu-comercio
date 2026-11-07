export type AuthMode = 'login' | 'register';

/** Opens the register form only for the exact link `?modo=cadastro`; anything else is the login. */
export function parseAuthMode(search: string): AuthMode {
  return new URLSearchParams(search).get('modo') === 'cadastro' ? 'register' : 'login';
}
