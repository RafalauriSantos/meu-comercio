import type { ReactNode } from 'react';
import Link from 'next/link';
import { AUTH_CONTENT, type AuthMode } from './auth-content';

const { brand, image, imageCaption, modes } = AUTH_CONTENT;

export function AuthShell({ mode, fontClassName, children }: { mode: AuthMode; fontClassName?: string; children: ReactNode }) {
  const copy = modes[mode];

  return (
    <main className={fontClassName ? `auth ${fontClassName}` : 'auth'}>
      <aside className="auth-brand">
        <Link href="/" className="auth-wordmark">
          {brand}
        </Link>

        <div>
          <p className="auth-brand-title">{copy.headline}</p>
          <ul className="auth-claims">
            {copy.claims.map((claim) => (
              <li key={claim}>{claim}</li>
            ))}
          </ul>
        </div>

        <figure className="auth-brand-shot">
          <div className="auth-brand-window">
            {/* Decorative: a fixed, already optimized WebP with explicit size. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.src} width={image.width} height={image.height} alt="" decoding="async" />
          </div>
          <figcaption>{imageCaption}</figcaption>
        </figure>
      </aside>

      <section className="auth-panel">
        <div className="auth-panel-inner">{children}</div>
      </section>
    </main>
  );
}
