import React from 'react';
import { maskCurrencyDigits } from '@/frontend/lib/currency-mask';

type MoneyInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> & {
  /** The masked text of the field ("12,50"), kept by the screen. */
  value: string;
  onValueChange: (masked: string) => void;
};

/**
 * A money field with the cents mask: only the digits count and the comma appears by itself ("125" becomes "1,25").
 * It is a text field with the numeric keypad, so the browser never turns the value into a number (22.5).
 * parseCurrencyInput reads the text it produces.
 */
export function MoneyInput({ value, onValueChange, ...rest }: MoneyInputProps) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => onValueChange(maskCurrencyDigits(e.target.value))}
    />
  );
}
