import Link from 'next/link';
import { BrandMark } from '@/frontend/ui/brand-mark';
import { LANDING_CONTENT } from './landing-content';

const { brand, header, hero, losses, steps, safety, faq, finalCall, footer } = LANDING_CONTENT;

export function LandingPage() {
  return (
    <div className="landing" data-theme="light">
      <div className="landing-wrap">
        <nav className="landing-nav" aria-label="Principal">
          <span className="landing-wordmark">
            <BrandMark size={30} />
            {brand}
          </span>
          <Link href={header.login.href} className="landing-header-link">
            {header.login.label}
          </Link>
        </nav>
      </div>

      <main className="landing-wrap">
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

          {/* A labelled example, not a screenshot and not real data. */}
          <aside className="landing-panel" aria-label={hero.example.label}>
            <div className="landing-panel-head">
              <strong>{hero.example.title}</strong>
              <span className="landing-badge">{hero.example.badge}</span>
            </div>
            {hero.example.rows.map((row) => (
              <div className="landing-panel-row" key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
            <div className="landing-panel-row">
              <span>{hero.example.check.label}</span>
              <span className="landing-panel-ok">{hero.example.check.value}</span>
            </div>
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

        <section className="landing-section landing-final" aria-labelledby="landing-final-title">
          <h2 id="landing-final-title">{finalCall.title}</h2>
          <p>{finalCall.text}</p>
          <Link href={hero.primary.href} className="landing-button landing-button-primary">
            {hero.primary.label}
          </Link>
          <p className="landing-note">{finalCall.note}</p>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-wrap landing-footer-inner">
          <strong>{brand}</strong>
          <span>{footer}</span>
        </div>
      </footer>
    </div>
  );
}
