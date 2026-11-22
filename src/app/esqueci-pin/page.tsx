'use client';

import { useForgotPassword } from '@/frontend/auth/use-forgot-password';
import { ForgotPasswordScreen } from '@/frontend/auth/forgot-password-screen';
import { FORGOT_COPY } from '@/frontend/auth/forgot-password-view';
import '@/frontend/styles/auth.css';

export default function ForgotPinPage() {
  const { phase, email, setEmail, honeypot, setHoneypot, seconds, submit } = useForgotPassword('pin');
  return (
    <ForgotPasswordScreen
      copy={FORGOT_COPY.pin}
      phase={phase}
      email={email}
      honeypot={honeypot}
      seconds={seconds}
      onEmailChange={setEmail}
      onHoneypotChange={setHoneypot}
      onSubmit={submit}
    />
  );
}
