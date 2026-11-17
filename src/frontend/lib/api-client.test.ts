import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiRequest, ApiError, apiClient, shouldGoToLogin, loadErrorMessage } from './api-client';
import { subscribeSessionExpired } from './session-expired';

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
    expect((error as ApiError).message).toBe('O sistema teve um problema. Tente de novo em instantes.');
  });
});

describe('shouldGoToLogin and loadErrorMessage', () => {
  it('only an ApiError of an expired session goes to the login', () => {
    expect(shouldGoToLogin(new ApiError(401, 'x'))).toBe(true);
    expect(shouldGoToLogin(new ApiError(0, 'x', undefined, undefined, 'network'))).toBe(false);
    expect(shouldGoToLogin(new ApiError(0, 'x', undefined, undefined, 'timeout'))).toBe(false);
    expect(shouldGoToLogin(new ApiError(429, 'x'))).toBe(false);
    expect(shouldGoToLogin(new ApiError(500, 'x'))).toBe(false);
    expect(shouldGoToLogin(new ApiError(403, 'x'))).toBe(false);
    expect(shouldGoToLogin(new TypeError('Failed to fetch'))).toBe(false);
    expect(shouldGoToLogin(new Error('bug'))).toBe(false);
  });

  it('the message is the one of the ApiError, or the generic server one for an unexpected error', () => {
    expect(loadErrorMessage(new ApiError(0, 'A conexão está lenta. Tente de novo.', undefined, undefined, 'timeout'))).toBe(
      'A conexão está lenta. Tente de novo.'
    );
    expect(loadErrorMessage(new Error('bug'))).toBe('O sistema teve um problema. Tente de novo em instantes.');
  });
});

describe('apiRequest error kinds', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const failWith = (status: number, path: string, body = '{}') => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status })));
    return apiRequest(path).catch((e: unknown) => e as ApiError) as Promise<ApiError>;
  };

  it('sets kind from the status and the path, and keeps status and code', async () => {
    expect((await failWith(401, '/api/products')).kind).toBe('session-expired');
    expect((await failWith(401, '/api/auth/login')).kind).toBe('business');
    expect((await failWith(429, '/api/products')).kind).toBe('rate-limit');
    expect((await failWith(500, '/api/products')).kind).toBe('server');
    const business = await failWith(409, '/api/sales', JSON.stringify({ message: 'Caixa fechado.', code: 'X' }));
    expect(business.kind).toBe('business');
    expect(business.status).toBe(409);
    expect(business.code).toBe('X');
    expect(business.message).toBe('Caixa fechado.');
  });

  it('a fetch that throws is a network error, status 0, and is never an expired session', async () => {
    const notify = vi.fn();
    const unsubscribe = subscribeSessionExpired(notify);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = (await apiRequest('/api/auth/me').catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe('network');
    expect(error.status).toBe(0);
    expect(error.message).toBe('Sem conexão com a internet. Confira a conexão e tente de novo.');
    expect(notify).not.toHaveBeenCalled();
    unsubscribe();
  });

  describe('time limit (fake fetch and fake clock)', () => {
    // A fetch that never answers and rejects like the browser when its signal is aborted.
    const hangingFetch = () =>
      vi.fn(
        (_path: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          })
      );

    async function settledAfter(pending: Promise<unknown>, ms: number) {
      let settled = false;
      void pending.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(ms);
      return settled;
    }

    it('a GET that hangs ends after 15 s as a timeout, never as an expired session', async () => {
      vi.useFakeTimers();
      const notify = vi.fn();
      const unsubscribe = subscribeSessionExpired(notify);
      vi.stubGlobal('fetch', hangingFetch());

      const pending = apiRequest('/api/products').catch((e: unknown) => e as ApiError) as Promise<ApiError>;
      expect(await settledAfter(pending, 14_999)).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      const error = await pending;
      expect(error.kind).toBe('timeout');
      expect(error.status).toBe(0);
      expect(error.message).toBe('A conexão está lenta. Tente de novo.');
      expect(notify).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('a write waits 30 s', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('fetch', hangingFetch());
      const pending = apiRequest('/api/products/abc', { method: 'PATCH', body: '{}' }).catch((e: unknown) => e as ApiError) as Promise<ApiError>;

      expect(await settledAfter(pending, 29_999)).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      expect((await pending).kind).toBe('timeout');
    });

    it('a write that moves money (cash open) is never aborted by time', async () => {
      vi.useFakeTimers();
      const fetchMock = hangingFetch();
      vi.stubGlobal('fetch', fetchMock);
      const pending = apiRequest('/api/cash/open', { method: 'POST', body: '{}' }).catch(() => undefined);

      expect(await settledAfter(pending, 10 * 60_000)).toBe(false);
      expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(false);
    });

    it('a sale is never aborted by time', async () => {
      vi.useFakeTimers();
      const fetchMock = hangingFetch();
      vi.stubGlobal('fetch', fetchMock);
      const pending = apiRequest('/api/sales', { method: 'POST', body: '{}' }).catch(() => undefined);

      expect(await settledAfter(pending, 10 * 60_000)).toBe(false);
      expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(false);
    });

    it('timeoutMs overrides the limit of one call', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('fetch', hangingFetch());
      const pending = apiRequest('/api/products', { timeoutMs: 1_000 }).catch((e: unknown) => e as ApiError) as Promise<ApiError>;

      await vi.advanceTimersByTimeAsync(1_000);

      expect((await pending).kind).toBe('timeout');
    });

    it('an answer in time clears the timer: no late abort', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 })));

      await expect(apiRequest('/api/products')).resolves.toEqual({ ok: true });

      expect(vi.getTimerCount()).toBe(0);
    });
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

  describe('updateProduct', () => {
    function stubJson(status: number, body: unknown) {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('sends a PATCH to the product path with only the fields given and returns the item', async () => {
      const item = { id: 'p 1', name: 'Novo', updatedAt: '2026-05-01T12:00:00.123Z' };
      const fetchMock = stubJson(200, item);

      const result = await apiClient.updateProduct('p 1', { name: 'Novo' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/products/p%201');
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toEqual({ name: 'Novo' });
      expect(result).toEqual(item);
    });

    it('keeps the price as a decimal string and sends expectedUpdatedAt', async () => {
      const fetchMock = stubJson(200, {});

      await apiClient.updateProduct('p1', { salePrice: '24.90', expectedUpdatedAt: '2026-05-01T12:00:00.123Z' });

      const body = fetchMock.mock.calls[0][1].body as string;
      expect(JSON.parse(body)).toEqual({ salePrice: '24.90', expectedUpdatedAt: '2026-05-01T12:00:00.123Z' });
      expect(body).toContain('"salePrice":"24.90"');
    });

    it('exposes PRODUCT_CHANGED on a 409', async () => {
      stubJson(409, { code: 'PRODUCT_CHANGED', message: 'O produto foi alterado. Recarregue.' });

      const error = await apiClient.updateProduct('p1', { name: 'X' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(409);
      expect((error as ApiError).code).toBe('PRODUCT_CHANGED');
    });
  });

  describe('updateCustomer', () => {
    function stubJson(status: number, body: unknown) {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('sends a PATCH to the customer path with only the fields given and returns the customer', async () => {
      const item = { id: 'c 1', name: 'Ana', phone: '11999998888', creditLimit: '100.00', updatedAt: '2026-05-01T12:00:00.123Z' };
      const fetchMock = stubJson(200, item);

      const result = await apiClient.updateCustomer('c 1', { name: 'Ana' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/customers/c%201');
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toEqual({ name: 'Ana' });
      expect(result).toEqual(item);
    });

    it('keeps the credit limit as a decimal string and sends expectedUpdatedAt', async () => {
      const fetchMock = stubJson(200, {});

      await apiClient.updateCustomer('c1', { phone: '11999998888', creditLimit: '50.00', expectedUpdatedAt: '2026-05-01T12:00:00.123Z' });

      const body = fetchMock.mock.calls[0][1].body as string;
      expect(JSON.parse(body)).toEqual({ phone: '11999998888', creditLimit: '50.00', expectedUpdatedAt: '2026-05-01T12:00:00.123Z' });
      expect(body).toContain('"creditLimit":"50.00"');
    });

    it('exposes CUSTOMER_CHANGED on a 409', async () => {
      stubJson(409, { code: 'CUSTOMER_CHANGED', message: 'O cliente foi alterado. Recarregue.' });

      const error = await apiClient.updateCustomer('c1', { name: 'X' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(409);
      expect((error as ApiError).code).toBe('CUSTOMER_CHANGED');
    });

    it('keeps a 409 of repeated phone without code', async () => {
      stubJson(409, { message: 'Já existe um cliente com este telefone.' });

      const error = await apiClient.updateCustomer('c1', { phone: '11999998888' }).catch((e: unknown) => e);

      expect((error as ApiError).status).toBe(409);
      expect((error as ApiError).code).toBeUndefined();
    });
  });
});

describe('createProduct barcode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function postedBody(barcode?: string) {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ barcode: '2912345678903' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await apiClient.createProduct({ barcode, name: 'Arroz', salePrice: '24,90' });
    return JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
  }

  it('sends a typed or scanned code as is', async () => {
    expect((await postedBody('7891234567895')).barcode).toBe('7891234567895');
  });

  it('leaves barcode out of the body when empty or absent', async () => {
    expect(await postedBody('')).not.toHaveProperty('barcode');
    expect(await postedBody()).not.toHaveProperty('barcode');
  });
});
