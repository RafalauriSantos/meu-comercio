import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiRequest, ApiError, apiClient } from './api-client';

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

  it('shows what the rate limit says, not a generic failure', async () => {
    // The rate limit answers with an "error" field and no "message".
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Muitas requisições em curto intervalo. Aguarde alguns segundos antes de tentar novamente.',
            retryAfter: 12,
          }),
          { status: 429 }
        )
      )
    );

    const error = await apiRequest('/api/setup/status').catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(429);
    expect((error as ApiError).message).toBe(
      'Muitas requisições em curto intervalo. Aguarde alguns segundos antes de tentar novamente.'
    );
  });

  it('falls back to a generic message when the answer is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })));

    const error = await apiRequest('/api/sales').catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(502);
    expect((error as ApiError).message).toBe('Falha ao processar solicitação.');
  });
});

describe('apiClient products', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch() {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    return () => String(fetchMock.mock.calls[0][0]);
  }

  it.each<[[string?, number?, number?], string]>([
    [[], '/api/products'],
    [['arroz'], '/api/products?q=arroz'],
    [['a b', 2, 50], '/api/products?q=a+b&page=2&pageSize=50'],
    [['', 3], '/api/products?page=3'],
  ])('listProducts(%j) calls %s', async (args, url) => {
    const called = stubFetch();

    await apiClient.listProducts(...args);

    expect(called()).toBe(url);
  });

  it('getProductsSummary calls the summary route', async () => {
    const called = stubFetch();

    await apiClient.getProductsSummary();

    expect(called()).toBe('/api/products/summary');
  });
});
