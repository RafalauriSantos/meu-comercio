'use client';

import { useResetPassword } from '@/frontend/auth/use-reset-password';
import { ResetPasswordScreen } from '@/frontend/auth/reset-password-screen';
import '@/frontend/styles/auth.css';

export default function ResetPasswordPage() {
  const { phase, password, setPassword, confirm, setConfirm, submit, retry } = useResetPassword();
  return (
    <ResetPasswordScreen
      phase={phase}
      password={password}
      confirm={confirm}
      onPasswordChange={setPassword}
      onConfirmChange={setConfirm}
      onSubmit={submit}
      onRetry={retry}
    />
  );
}
