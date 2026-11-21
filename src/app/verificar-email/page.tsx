'use client';

import { useVerifyEmail } from '@/frontend/auth/use-verify-email';
import { VerifyEmailScreen } from '@/frontend/auth/verify-email-screen';
import '@/frontend/styles/auth.css';

export default function VerifyEmailPage() {
  const { phase, confirm, retry } = useVerifyEmail();
  return <VerifyEmailScreen phase={phase} onConfirm={confirm} onRetry={retry} />;
}
