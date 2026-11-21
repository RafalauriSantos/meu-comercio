import { describe, it, expect } from 'vitest';
import { secondsLeft } from './use-resend-countdown';

describe('secondsLeft', () => {
  const start = 1_000_000;

  it('AC-10: logo depois do envio faltam 60 s', () => {
    expect(secondsLeft(start + 60_000, start)).toBe(60);
  });

  it('arredonda para cima: com 59,4 s restantes mostra 60, com 0,4 s mostra 1', () => {
    expect(secondsLeft(start + 60_000, start + 600)).toBe(60);
    expect(secondsLeft(start + 60_000, start + 59_600)).toBe(1);
  });

  it('chega a 0 no instante e nunca fica negativo', () => {
    expect(secondsLeft(start + 60_000, start + 60_000)).toBe(0);
    expect(secondsLeft(start + 60_000, start + 90_000)).toBe(0);
  });

  it('sem envio anterior (0) não há espera', () => {
    expect(secondsLeft(0, start)).toBe(0);
  });
});
