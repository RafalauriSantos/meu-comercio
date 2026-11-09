import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandMark } from '@/frontend/ui/brand-mark';
import { VersionLabel } from '@/frontend/ui/version-label';

interface AuthShellProps {
  // Wider card for the sign up form.
  wide?: boolean;
  // id of the card's heading, when it has one.
  labelledBy?: string;
  // Line below the card (the sign in / sign up toggle).
  footer?: ReactNode;
  children: ReactNode;
}

// Sign in and sign up: the logo, one centered card and a footer line, on the page ground.
export function AuthShell({ wide, labelledBy, footer, children }: AuthShellProps) {
  return (
    <main className="auth" data-theme="light">
      <Link href="/" className="auth-brand">
        <BrandMark size={40} />
        Meu Comércio
      </Link>

      <section className={wide ? 'auth-card auth-card-wide' : 'auth-card'} aria-labelledby={labelledBy}>
        {children}
      </section>

      {footer && <p className="auth-foot">{footer}</p>}
      <p className="auth-version">
        <VersionLabel />
      </p>
    </main>
  );
}
