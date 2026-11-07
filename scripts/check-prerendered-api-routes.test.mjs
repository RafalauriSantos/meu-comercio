import { describe, it, expect } from 'vitest';
import { findPrerenderedApiRoutes } from './check-prerendered-api-routes.mjs';

describe('findPrerenderedApiRoutes', () => {
  it('flags API route handlers that the build prerendered', () => {
    const manifest = {
      routes: {
        '/api/setup/status': { routeType: 'route', renderingMode: 'STATIC' },
        '/api/health': { routeType: 'route', renderingMode: 'STATIC' },
      },
    };

    expect(findPrerenderedApiRoutes(manifest)).toEqual(['/api/health', '/api/setup/status']);
  });

  it('flags a route handler at the API root', () => {
    const manifest = { routes: { '/api': { routeType: 'route', renderingMode: 'STATIC' } } };

    expect(findPrerenderedApiRoutes(manifest)).toEqual(['/api']);
  });

  it('does not treat paths that only start with the letters api as API routes', () => {
    const manifest = { routes: { '/apidocs': { routeType: 'route', renderingMode: 'STATIC' } } };

    expect(findPrerenderedApiRoutes(manifest)).toEqual([]);
  });

  it('ignores pages and static files such as the favicon', () => {
    const manifest = {
      routes: {
        '/': { routeType: 'page', renderingMode: 'PARTIALLY_STATIC' },
        '/login': { routeType: 'page', renderingMode: 'PARTIALLY_STATIC' },
        '/favicon.ico': { routeType: 'route', renderingMode: 'STATIC' },
      },
    };

    expect(findPrerenderedApiRoutes(manifest)).toEqual([]);
  });

  it('accepts a manifest with no routes', () => {
    expect(findPrerenderedApiRoutes({})).toEqual([]);
  });
});
