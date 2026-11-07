import { describe, it, expect } from 'vitest';
import { LANDING_METADATA } from '@/frontend/landing/landing-metadata';
import robots from './robots';
import { metadata as loginMetadata } from './login/layout';
import { metadata as pdvMetadata } from './pdv/layout';
import { metadata as gestaoMetadata } from './gestao/layout';

const SITE = 'https://meucomercio.vercel.app';

describe('landing metadata', () => {
  it('uses the production address as canonical and as the base of every link', () => {
    expect(String(LANDING_METADATA.metadataBase)).toBe(`${SITE}/`);
    expect(LANDING_METADATA.alternates?.canonical).toBe(SITE);
    expect(LANDING_METADATA.openGraph?.url).toBe(SITE);
  });

  it('has a Portuguese title and description that make no forbidden claim', () => {
    const title = String(LANDING_METADATA.title);
    const description = String(LANDING_METADATA.description);

    expect(title).toContain('Meu Comércio');
    expect(description.length).toBeGreaterThan(40);
    for (const word of ['lucro', 'relatório', 'depoimento']) {
      expect(`${title} ${description}`.toLowerCase()).not.toContain(word);
    }
  });

  it('shares in Portuguese without claiming an image that does not exist', () => {
    expect(LANDING_METADATA.openGraph).toMatchObject({ locale: 'pt_BR', type: 'website', siteName: 'Meu Comércio' });
    expect(LANDING_METADATA.openGraph?.images).toBeUndefined();
  });
});

describe('robots', () => {
  it('allows the landing and disallows the API and the app screens', () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(rule.allow).toBe('/');
    expect(rule.disallow).toEqual(expect.arrayContaining(['/api/', '/pdv', '/gestao']));
  });

  it('keeps the login, the PDV and the management screen out of the index', () => {
    for (const metadata of [loginMetadata, pdvMetadata, gestaoMetadata]) {
      expect(metadata.robots).toMatchObject({ index: false, follow: false });
    }
  });
});
