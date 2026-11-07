import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hasAnyUser = vi.fn();
const connection = vi.fn();
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: () => connection(),
}));
vi.mock('@/modules/users/infrastructure/drizzle-user-repository', () => ({
  DrizzleUserRepository: class {
    hasAnyUser = hasAnyUser;
  },
}));

import * as route from './route';

describe('GET /api/setup/status', () => {
  const originalUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    hasAnyUser.mockReset();
    connection.mockReset();
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });

  it('waits for the request before answering, so the build never runs it or freezes its answer', async () => {
    delete process.env.DATABASE_URL;

    await route.GET();

    expect(connection).toHaveBeenCalledTimes(1);
  });

  it('reports setup required when there is no database configured', async () => {
    delete process.env.DATABASE_URL;

    const body = await (await route.GET()).json();

    expect(body).toEqual({ setupRequired: true, databaseConnected: false });
    expect(hasAnyUser).not.toHaveBeenCalled();
  });

  it('reports the real state of the database on each call', async () => {
    process.env.DATABASE_URL = 'postgres://placeholder';
    hasAnyUser.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const first = await (await route.GET()).json();
    const second = await (await route.GET()).json();

    expect(first).toEqual({ setupRequired: true, databaseConnected: true });
    expect(second).toEqual({ setupRequired: false, databaseConnected: true });
  });
});
