import { describe, it, expect } from 'vitest';
import { ApiError } from '@/frontend/lib/api-client';
import { describeLinkFailure, INVALID_LINK_MESSAGE, readTokenFromHash } from './verify-email-link';

describe('readTokenFromHash', () => {
  it('lê o token do fragmento #token=', () => {
    expect(readTokenFromHash('#token=abc_DEF-123')).toBe('abc_DEF-123');
  });

  it('AC-22/35: sem token, vazio ou fragmento de outro tipo dá null', () => {
    for (const hash of ['', '#', '#token=', '#outro=1', '#token']) expect(readTokenFromHash(hash), hash).toBeNull();
  });
});

describe('describeLinkFailure', () => {
  it('AC-22/35: qualquer 400 vira a mesma mensagem de link inválido', () => {
    const a = describeLinkFailure(new ApiError(400, 'Link inválido ou vencido. Peça um novo.'));
    const b = describeLinkFailure(new ApiError(400, 'Dados inválidos.'));
    expect(a).toEqual({ name: 'invalid' });
    expect(b).toEqual(a);
    expect(INVALID_LINK_MESSAGE).toBe('Link inválido ou vencido. Peça um novo.');
  });

  it('AC-5: 409 é e-mail em uso', () => {
    expect(describeLinkFailure(new ApiError(409, 'Este e-mail já está em uso'))).toEqual({ name: 'in-use' });
  });

  it('AC-41: 429 é limite, com a mensagem do servidor, nunca link inválido', () => {
    const result = describeLinkFailure(new ApiError(429, 'Aguarde 50 minutos para tentar de novo.'));
    expect(result).toEqual({ name: 'limited', message: 'Aguarde 50 minutos para tentar de novo.' });
  });

  it('sem rede, tempo esgotado e erro 5xx pedem nova tentativa, nunca viram link inválido', () => {
    const offline = new ApiError(0, 'Sem conexão com a internet. Confira a conexão e tente de novo.', undefined, undefined, 'network');
    expect(describeLinkFailure(offline)).toEqual({ name: 'failed', message: offline.message });
    expect(describeLinkFailure(new ApiError(500, 'O sistema teve um problema. Tente de novo em instantes.')).name).toBe('failed');
    expect(describeLinkFailure(new TypeError('Failed to fetch')).name).toBe('failed');
  });
});
