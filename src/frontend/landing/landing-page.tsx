import Link from 'next/link';
import { LANDING_CONTENT } from './landing-content';

const { brand, header, hero, losses, steps, safety, faq, finalCall, footer } = LANDING_CONTENT;

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

        <section className="landing-section" aria-labelledby="landing-losses-title">
          <h2 id="landing-losses-title">{losses.title}</h2>
          <dl className="landing-losses">
            {losses.items.map((item) => (
              <div className="landing-loss" key={item.loss}>
                <dt>{item.loss}</dt>
                <dd>{item.control}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="landing-section" aria-labelledby="landing-steps-title">
          <h2 id="landing-steps-title">{steps.title}</h2>
          <ol className="landing-steps">
            {steps.items.map((item) => (
              <li key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section" aria-labelledby="landing-safety-title">
          <h2 id="landing-safety-title">{safety.title}</h2>
          <div className="landing-safety">
            {safety.items.map((item) => (
              <div className="landing-safety-row" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-section" aria-labelledby="landing-faq-title">
          <h2 id="landing-faq-title">{faq.title}</h2>
          <div className="landing-faq">
            {faq.items.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="landing-final" aria-labelledby="landing-final-title">
          <h2 id="landing-final-title">{finalCall.title}</h2>
          <p>{finalCall.text}</p>
          <Link href={hero.primary.href} className="landing-button landing-button-primary">
            {hero.primary.label}
          </Link>
          <p className="landing-note">{finalCall.note}</p>
        </section>
      </main>

      <footer className="landing-footer">
        <span className="landing-wordmark">{brand}</span>
        <span>{footer}</span>
      </footer>
    </div>
  );
}
