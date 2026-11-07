import Link from 'next/link';
import { LANDING_CONTENT } from './landing-content';

const { brand, header, hero } = LANDING_CONTENT;

function CheckMark() {
  return (
    <svg className="landing-check" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-header">
        <span className="landing-wordmark">{brand}</span>
        <Link href={header.login.href} className="landing-header-link">
          {header.login.label}
        </Link>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <h1 id="landing-title">{hero.title}</h1>
            <p className="landing-lead">{hero.subtitle}</p>
            <div className="landing-actions">
              <Link href={hero.primary.href} className="landing-button landing-button-primary">
                {hero.primary.label}
              </Link>
              <Link href={hero.secondary.href} className="landing-button landing-button-secondary">
                {hero.secondary.label}
              </Link>
            </div>
            <p className="landing-note">{hero.note}</p>
          </div>

          <aside className="landing-ledger" aria-label={hero.panel.label}>
            <div className="landing-ledger-head">
              <h2>{hero.panel.title}</h2>
              <span className="landing-badge">{hero.panel.badge}</span>
            </div>
            <dl className="landing-ledger-rows">
              {hero.panel.figures.map((figure) => (
                <div className="landing-ledger-row" key={figure.label}>
                  <dt>{figure.label}</dt>
                  <dd className={figure.value === 'confere' ? 'landing-ledger-ok' : undefined}>
                    {figure.value === 'confere' ? <CheckMark /> : null}
                    {figure.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="landing-ledger-caption">{hero.panel.caption}</p>
          </aside>
        </section>
      </main>
    </div>
  );
}
