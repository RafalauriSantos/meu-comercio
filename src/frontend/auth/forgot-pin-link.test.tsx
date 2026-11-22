import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { ForgotPinLink } from './forgot-pin-link';

const read = (path: string) => readFileSync(join(process.cwd(), ...path.split('/')), 'utf8');

// The places that ask for the owner's PIN. The first five are money screens: only the link may enter them.
const MONEY_FILES = [
  'src/app/pdv/page.tsx',
  'src/frontend/pdv/cancel-sale-modal.tsx',
  'src/frontend/management/customer-edit-panel.tsx',
  'src/frontend/management/new-customer-panel.tsx',
  'src/frontend/management/delete-pieces.tsx',
];

describe('ForgotPinLink (AC-26, AC-58)', () => {
  it('links to the forgot PIN page in a new tab, so an open sale or form is not lost', () => {
    const markup = renderToStaticMarkup(<ForgotPinLink />);

    expect(markup).toMatch(/^<a /);
    expect(markup).toContain('href="/esqueci-pin"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain('class="forgot-pin-link"');
    expect(markup).toContain('>Esqueci o PIN</a>');
  });

  for (const file of [...MONEY_FILES, 'src/app/login/page.tsx']) {
    it(`is used by ${file}`, () => {
      const source = read(file);

      expect(source).toContain("import { ForgotPinLink } from '@/frontend/auth/forgot-pin-link';");
      expect(source).toContain('<ForgotPinLink />');
    });
  }

  for (const file of MONEY_FILES) {
    it(`touches ${file} with one import and one line of JSX only`, () => {
      const source = read(file);

      expect(source.match(/ForgotPinLink/g)).toHaveLength(2);
      expect(source.match(/^import .*forgot-pin-link.*$/gm)).toHaveLength(1);
      expect(source.match(/^\s*<ForgotPinLink \/>\r?$/gm)).toHaveLength(1);
      expect(source).not.toContain('/esqueci-pin');
      expect(source).not.toContain('Esqueci o PIN');
    });
  }

  it('does not pull the auth stylesheet or the auth-link class into the money screens', () => {
    const component = read('src/frontend/auth/forgot-pin-link.tsx');
    expect(component).not.toContain('auth.css');
    expect(component).not.toContain('auth-link');
  });

  it('has its own scoped style, defined once in the global CSS, without ::after or side margin', () => {
    const css = read('src/app/globals.css');
    const rule = css.match(/^.forgot-pin-link {[^}]*}/m)?.[0] ?? '';
    expect(css.match(/^.forgot-pin-link {/gm)).toHaveLength(1);
    expect(rule).not.toMatch(/margin-(left|right)/);
    expect(css).not.toContain('.forgot-pin-link::after');
  });

  it('is the only place that knows the address and the text (no copies)', () => {
    expect(read('src/app/login/page.tsx')).not.toContain('/esqueci-pin');
    expect(read('src/app/login/page.tsx')).not.toContain('Esqueci o PIN');
  });
});
