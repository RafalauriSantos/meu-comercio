import { describe, it, expect } from 'vitest';
import { safeReturnPath, loginUrlWithReturn, loginUrlHere } from './safe-return-path';

describe('safeReturnPath', () => {
  it('accepts an internal path, with query and hash', () => {
    for (const path of ['/gestao', '/pdv', '/gestao?aba=fiado', '/pdv#topo']) {
      expect(safeReturnPath(path)).toBe(path);
    }
  });

  it('ignores anything that could leave the site or is not a path', () => {
    const bad = [
      '//outro.site',
      '///outro.site',
      '/\\outro.site',
      '\\\\outro.site',
      'https://outro.site',
      'http://outro.site/gestao',
      'javascript:alert(1)',
      'gestao',
      '/gestao?next=https://outro.site',
      '/a\nb',
      '/a\tb',
      '/a\rb',
      '',
      '   ',
    ];
    for (const path of bad) expect(safeReturnPath(path)).toBeNull();
  });

  it('ignores a missing value', () => {
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
  });
});

describe('loginUrlWithReturn', () => {
  it('puts the current path in voltar, encoded', () => {
    expect(loginUrlWithReturn('/gestao', '?aba=fiado')).toBe('/login?voltar=%2Fgestao%3Faba%3Dfiado');
  });
});

describe('loginUrlHere', () => {
  it('goes to the login that returns to the current page', () => {
    expect(loginUrlHere({ pathname: '/pdv', search: '' })).toBe('/login?voltar=%2Fpdv');
    expect(loginUrlHere({ pathname: '/gestao', search: '?aba=fiado' })).toBe('/login?voltar=%2Fgestao%3Faba%3Dfiado');
  });

  it('is the plain login when there is no window', () => {
    expect(loginUrlHere()).toBe('/login');
  });
});
