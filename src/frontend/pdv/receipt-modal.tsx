'use client';

import React from 'react';

export type PrintModalData = {
  receiptText: string;
  creditNoteText?: string;
  activeTab: 'receipt' | 'creditNote';
};

interface ReceiptModalProps {
  printModalData: PrintModalData | null;
  setPrintModalData: (data: PrintModalData | null) => void;
}

/** The window of the receipt after a sale (receipt and, on fiado, the credit note) and the text the thermal printer prints. */
export function ReceiptModal({ printModalData, setPrintModalData }: ReceiptModalProps) {
  return (
    <>
      {/* MODAL DE IMPRESSÃO TÉRMICA PÓS-VENDA */}
      {printModalData && (
        <div className="pdv-overlay no-print">
          <div className="pdv-modal is-narrow" role="dialog" aria-modal="true" aria-labelledby="pdv-print-title">
            <div className="pdv-modal-body">
              <p className="pdv-eyebrow">Pós-venda · impressão térmica</p>
              <h2 id="pdv-print-title" className="pdv-title">
                Comprovante da venda
              </h2>

              {printModalData.creditNoteText && (
                <div role="group" aria-label="Tipo de comprovante" className="pdv-choices is-two">
                  <button
                    type="button"
                    className="pdv-choice"
                    aria-pressed={printModalData.activeTab === 'receipt'}
                    onClick={() => setPrintModalData({ ...printModalData, activeTab: 'receipt' })}
                  >
                    Cupom não fiscal
                  </button>
                  <button
                    type="button"
                    className="pdv-choice"
                    aria-pressed={printModalData.activeTab === 'creditNote'}
                    onClick={() => setPrintModalData({ ...printModalData, activeTab: 'creditNote' })}
                  >
                    Canhoto fiado (assinatura)
                  </button>
                </div>
              )}

              <pre className="pdv-receipt">
                {printModalData.activeTab === 'receipt'
                  ? printModalData.receiptText
                  : printModalData.creditNoteText}
              </pre>
            </div>

            <footer className="pdv-modal-foot">
              <button className="outline pdv-back" type="button" onClick={() => setPrintModalData(null)}>
                Fechar
              </button>
              <button className="primary pdv-confirm" type="button" onClick={() => window.print()}>
                Imprimir (Ctrl+P)
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Elemento de impressão térmica invisível em tela e renderizado no print */}
      {printModalData && (
        <div className="thermal-print-area" aria-hidden="true">
          {printModalData.activeTab === 'receipt'
            ? printModalData.receiptText
            : printModalData.creditNoteText}
        </div>
      )}
    </>
  );
}
