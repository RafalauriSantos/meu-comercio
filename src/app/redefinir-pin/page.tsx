'use client';

import { useResetPassword } from '@/frontend/auth/use-reset-password';
import { ResetPasswordScreen } from '@/frontend/auth/reset-password-screen';
import '@/frontend/styles/auth.css';

export default function ResetPinPage() {
  const { phase, password, setPassword, confirm, setConfirm, pin, setPin, confirmPin, setConfirmPin, submit, retry } =
    useResetPassword('pin');
  return (
    <ResetPasswordScreen
      phase={phase}
      password={password}
      confirm={confirm}
      onPasswordChange={setPassword}
      onConfirmChange={setConfirm}
      pinFields={{
        pin,
        confirmPin,
        onPinChange: setPin,
        onConfirmPinChange: setConfirmPin,
      }}
      onSubmit={submit}
      onRetry={retry}
    />
  );
}
