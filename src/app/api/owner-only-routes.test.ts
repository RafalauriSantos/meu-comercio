import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as restockPost } from './inventory/restock/route';
import { GET as reportsGet } from './reports/sales/route';
import { PATCH as settingsPatch } from './store/settings/route';
import { GET as operatorsGet, POST as operatorsPost } from './users/operators/route';
import { POST as emailVerificationPost } from './owner/email/verification/route';

// 19.3: the routes only the owner may use must refuse an operator (403) and a visitor (401) before they read
// the body or touch the database. The database is replaced by an empty object: a route that went on past the
// check would crash (500) instead of answering 403.

const mockRequireAuthSession = vi.fn();
vi.mock('@/shared/infrastructure/auth/auth-context', () => ({
  requireAuthSession: () => mockRequireAuthSession(),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super('Não autorizado.');
      this.name = 'UnauthorizedError';
    }
  },
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: () => Promise.resolve(),
}));

vi.mock('@/shared/infrastructure/db/connection', () => ({ db: {} }));

const operator = { merchantId: 'merchant-1', username: 'caixa', authorities: ['ROLE_OPERATOR'] };
function request(method: string, path: string, body: unknown = {}): NextRequest {
  const hasBody = method !== 'GET';
  return new NextRequest(`http://localhost${path}`, {
    method,
    ...(hasBody && { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

const ownerOnly: Array<[string, () => Promise<Response>]> = [
  ['POST /api/inventory/restock', () => restockPost(request('POST', '/api/inventory/restock'))],
  ['GET /api/reports/sales', () => reportsGet(request('GET', '/api/reports/sales?period=today'))],
  ['PATCH /api/store/settings', () => settingsPatch(request('PATCH', '/api/store/settings', { stockControlEnabled: false }))],
  ['GET /api/users/operators', () => operatorsGet()],
  ['POST /api/users/operators', () => operatorsPost(request('POST', '/api/users/operators'))],
  ['POST /api/owner/email/verification', () => emailVerificationPost(request('POST', '/api/owner/email/verification'))],
];

describe('routes only the owner may use (19.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(ownerOnly)('%s refuses an operator with 403', async (_name, call) => {
    mockRequireAuthSession.mockResolvedValue(operator);

    const response = await call();

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.message).toEqual(expect.any(String));
  });

  it.each(ownerOnly)('%s refuses a visitor without a session with 401', async (_name, call) => {
    const { UnauthorizedError } = await import('@/shared/infrastructure/auth/auth-context');
    mockRequireAuthSession.mockRejectedValue(new UnauthorizedError());

    const response = await call();

    expect(response.status).toBe(401);
  });
});
