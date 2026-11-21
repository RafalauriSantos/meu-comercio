import { describe, it, expect } from 'vitest';
import { decideRecoveryRequest, decideTokenAttempt } from './recovery-limits';

const now = new Date('2026-11-21T12:00:00Z');
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);
const none = { accountRequests: [], ipRequests: [], dailyCount: 0 };

describe('decideRecoveryRequest', () => {
  it('permite o primeiro pedido', () => {
    expect(decideRecoveryRequest(none, now)).toEqual({ status: 'ALLOWED' });
  });

  it('pede para esperar 60 s entre dois pedidos da mesma conta', () => {
    const counts = { ...none, accountRequests: [ago(20)], ipRequests: [ago(20)] };
    expect(decideRecoveryRequest(counts, now, true)).toEqual({ status: 'TOO_SOON', retryAfterSeconds: 40 });
    expect(decideRecoveryRequest(counts, now)).toEqual({ status: 'ALLOWED' });
    const later = { ...none, accountRequests: [ago(60)] };
    expect(decideRecoveryRequest(later, now, true)).toEqual({ status: 'ALLOWED' });
  });

  it('limita a conta a 3 pedidos em 60 min e informa quando abre uma vaga', () => {
    const counts = { ...none, accountRequests: [ago(3000), ago(2000), ago(1000)] };
    expect(decideRecoveryRequest(counts, now)).toEqual({ status: 'ACCOUNT_LIMITED', retryAfterSeconds: 600 });
  });

  it('ignora pedidos fora da janela de 60 min', () => {
    const counts = { ...none, accountRequests: [ago(3601), ago(3700), ago(3800)] };
    expect(decideRecoveryRequest(counts, now)).toEqual({ status: 'ALLOWED' });
  });

  it('limita o IP a 10 pedidos em 60 min', () => {
    const ipRequests = Array.from({ length: 10 }, (_, i) => ago(100 + i * 100));
    expect(decideRecoveryRequest({ ...none, ipRequests }, now)).toEqual({ status: 'IP_LIMITED', retryAfterSeconds: 2600 });
    expect(decideRecoveryRequest({ ...none, ipRequests: ipRequests.slice(1) }, now)).toEqual({ status: 'ALLOWED' });
  });

  it('limita o app a 250 por dia', () => {
    expect(decideRecoveryRequest({ ...none, dailyCount: 249 }, now)).toEqual({ status: 'ALLOWED' });
    expect(decideRecoveryRequest({ ...none, dailyCount: 250 }, now)).toEqual({ status: 'DAILY_LIMITED' });
  });
});

describe('decideTokenAttempt', () => {
  it('permite 10 tentativas por IP em 60 min e recusa a 11ª', () => {
    expect(decideTokenAttempt(Array.from({ length: 9 }, () => ago(10)), now)).toEqual({ status: 'ALLOWED' });
    expect(decideTokenAttempt(Array.from({ length: 10 }, () => ago(10)), now)).toEqual({
      status: 'IP_LIMITED',
      retryAfterSeconds: 3590,
    });
  });
});
