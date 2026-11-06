import { describe, it, expect } from 'vitest';
import { assertDisposableTestDatabase } from './test-database-guard';

const REFUSAL = /must be a plain local Postgres URL/;

describe('assertDisposableTestDatabase', () => {
  it('aceita um banco local com nome do tipo [a-z0-9_]+_test', () => {
    expect(() => assertDisposableTestDatabase('postgres://postgres:postgres@localhost:5432/meu_test')).not.toThrow();
    expect(() => assertDisposableTestDatabase('postgresql://u:p@127.0.0.1:55432/app_test')).not.toThrow();
  });

  it('recusa banco cujo nome não termina em _test', () => {
    expect(() => assertDisposableTestDatabase('postgres://u:p@localhost:5432/postgres')).toThrow(REFUSAL);
  });

  it('recusa host remoto', () => {
    expect(() => assertDisposableTestDatabase('postgres://u:p@ep-x.neon.tech/meu_test')).toThrow(REFUSAL);
  });

  it('recusa host sobrescrito por query string', () => {
    expect(() =>
      assertDisposableTestDatabase('postgres://u:p@localhost:5432/meu_test?host=db.ep-x.neon.tech')
    ).toThrow(REFUSAL);
  });

  it('recusa "?" ou "#" vazios no fim da URL', () => {
    expect(() => assertDisposableTestDatabase('postgres://u:p@localhost:5432/meu_test?')).toThrow(REFUSAL);
    expect(() => assertDisposableTestDatabase('postgres://u:p@localhost:5432/meu_test#')).toThrow(REFUSAL);
  });

  it('recusa espaço ou tabulação na URL', () => {
    expect(() => assertDisposableTestDatabase('postgres://u:p@localhost\t:5432/meu_test')).toThrow(REFUSAL);
    expect(() => assertDisposableTestDatabase('postgres://u:p@localhost:5432/meu_test ')).toThrow(REFUSAL);
  });

  it('recusa nome de banco com barra ou caractere fora de [a-z0-9_]', () => {
    expect(() => assertDisposableTestDatabase('postgres://u:p@localhost:5432/x/meu_test')).toThrow(REFUSAL);
    expect(() => assertDisposableTestDatabase('postgres://u:p@localhost:5432/Meu-Test')).toThrow(REFUSAL);
  });

  it('recusa protocolo que não é Postgres e URL malformada', () => {
    expect(() => assertDisposableTestDatabase('mysql://u:p@localhost:3306/meu_test')).toThrow(REFUSAL);
    expect(() => assertDisposableTestDatabase('não é uma url')).toThrow(REFUSAL);
  });
});
