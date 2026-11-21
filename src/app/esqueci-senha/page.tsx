'use client';

import { useForgotPassword } from '@/frontend/auth/use-forgot-password';
import { ForgotPasswordScreen } from '@/frontend/auth/forgot-password-screen';
import '@/frontend/styles/auth.css';

export default function ForgotPasswordPage() {
  const { phase, email, setEmail, honeypot, setHoneypot, seconds, submit } = useForgotPassword();
  return (
    <ForgotPasswordScreen
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
