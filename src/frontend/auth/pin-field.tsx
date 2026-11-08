'use client';

import { sanitizePin } from './sanitize-pin';

export interface PinFieldProps {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}

export function PinField({ id, label, hint, value, onChange }: PinFieldProps) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input auth-input-pin"
        type="password"
        inputMode="numeric"
        pattern="[0-9]{6}"
        required
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(sanitizePin(event.target.value))}
        placeholder="••••••"
        aria-describedby={`${id}-hint`}
      />
      <p className="auth-hint" id={`${id}-hint`}>
        {hint}
      </p>
    </div>
  );
}
