import { describe, it, expect } from 'vitest';
import { assertDisposableTestDatabase } from './test-database-guard';

describe('assertDisposableTestDatabase', () => {
  it('aceita um banco local com nome terminado em _test', () => {
    expect(() => assertDisposableTestDatabase('postgres://postgres:postgres@localhost:5432/meu_test')).not.toThrow();
    expect(() => assertDisposableTestDatabase('postgresql://u:p@127.0.0.1:55432/app_test')).not.toThrow();
  });

  it('recusa banco cujo nome não termina em _test', () => {
    expect(() => assertDisposableTestDatabase('postgres://u:p@localhost:5432/postgres')).toThrow();
  });

  it('recusa host remoto', () => {
    expect(() => assertDisposableTestDatabase('postgres://u:p@ep-x.neon.tech/meu_test')).toThrow();
  });

  it('recusa host sobrescrito por query string', () => {
    expect(() =>
      assertDisposableTestDatabase('postgres://u:p@localhost:5432/meu_test?host=db.ep-x.neon.tech')
    ).toThrow();
  });

  it('recusa qualquer query string, mesmo sem host', () => {
    expect(() => assertDisposableTestDatabase('postgres://u:p@localhost:5432/meu_test?sslmode=require')).toThrow();
  });

  it('recusa protocolo que não é Postgres e URL malformada', () => {
    expect(() => assertDisposableTestDatabase('mysql://u:p@localhost:3306/meu_test')).toThrow();
    expect(() => assertDisposableTestDatabase('não é uma url')).toThrow();
  });
});
