import React from 'react';
import { BARCODE_INVALID_TEXT, type BarcodeFieldState } from '@/frontend/lib/barcode-field';

export const BARCODE_SAVE_HINT = 'Corrija o código de barras, ou deixe em branco, para salvar.';
export const BARCODE_EMPTY_HELP_NEW = 'Deixe em branco e o sistema gera um código para este produto.';
export const BARCODE_EMPTY_HELP = 'Bipe o produto ou digite o código. Em branco, o sistema gera um.';

/** The message under the barcode field (D-30). It only draws: the field points to it by aria-describedby. */
export function BarcodeFieldMessage({ id, state, emptyHelp }: { id: string; state: BarcodeFieldState | null; emptyHelp: string }) {
  return (
    <div id={id}>
      {state?.kind === 'empty' && <span className="mg-help">{emptyHelp}</span>}
      {state?.kind === 'short' && (
        <span className="mg-help">Um código de barras tem 8, 12, 13 ou 14 números. Você digitou {state.length}.</span>
      )}
      {state?.kind === 'invalid' && (
        <span className="mg-help barcode-alert" role="alert">
          {BARCODE_INVALID_TEXT}
        </span>
      )}
      {state?.kind === 'valid' && (
        <span className="mg-badge mg-badge-ok barcode-ok" role="status">
          Código válido ({state.label})
        </span>
      )}
    </div>
  );
}
