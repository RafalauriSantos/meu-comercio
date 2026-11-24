import { describe, it, expect } from 'vitest';
import { isBodyTooLarge, BODY_LIMIT_BYTES, IMPORT_BODY_LIMIT_BYTES } from './body-limit';

const post = (contentLength: string | null, pathname = '/api/sales') => ({ method: 'POST', pathname, contentLength });

describe('isBodyTooLarge (12.5)', () => {
  it('lets a body up to 1 MB through, and refuses one byte more', () => {
    expect(BODY_LIMIT_BYTES).toBe(1_048_576);
    expect(isBodyTooLarge(post(String(BODY_LIMIT_BYTES)))).toBe(false);
    expect(isBodyTooLarge(post(String(BODY_LIMIT_BYTES + 1)))).toBe(true);
  });

  it('applies to every mutation, not to reads', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(isBodyTooLarge({ method, pathname: '/api/products', contentLength: '5000000' }), method).toBe(true);
    }
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(isBodyTooLarge({ method, pathname: '/api/products', contentLength: '5000000' }), method).toBe(false);
    }
  });

  it('does not decide when the size is not known: no header, or a header that is not a number', () => {
    expect(isBodyTooLarge(post(null))).toBe(false);
    expect(isBodyTooLarge(post(''))).toBe(false);
    expect(isBodyTooLarge(post('abc'))).toBe(false);
    expect(isBodyTooLarge(post('-5'))).toBe(false);
  });

  it('gives the spreadsheet import a larger limit, because its text may be 600 thousand characters with accents', () => {
    expect(IMPORT_BODY_LIMIT_BYTES).toBe(2_097_152);
    expect(isBodyTooLarge(post('1500000', '/api/products/import'))).toBe(false);
    expect(isBodyTooLarge(post(String(IMPORT_BODY_LIMIT_BYTES + 1), '/api/products/import'))).toBe(true);
    expect(isBodyTooLarge(post('1500000', '/api/products'))).toBe(true);
  });

  it('only looks at the API: a page is not limited here', () => {
    expect(isBodyTooLarge(post('5000000', '/login'))).toBe(false);
  });
});
