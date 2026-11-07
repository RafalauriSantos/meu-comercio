import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiRequest, ApiError } from './api-client';

describe('apiRequest errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes the status, message and code of a failed response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Venda duplicada.', code: 'DUPLICATE_SALE' }), { status: 409 })
      )
    );

    const error = await apiRequest('/api/sales').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).message).toBe('Venda duplicada.');
    expect((error as ApiError).code).toBe('DUPLICATE_SALE');
  });

  it('leaves the code undefined when the server sends none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Erro.' }), { status: 400 }))
    );

    const error = await apiRequest('/api/sales').catch((e: unknown) => e);

    expect((error as ApiError).code).toBeUndefined();
  });
});
