import React from 'react';

export interface ExportNoticeData {
  error: boolean;
  text: string;
}

export function ExportProductsButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button type="button" className="outline mg-toolbar-import mg-toolbar-export" disabled={busy} onClick={onClick}>
      {busy ? 'Gerando a planilha…' : 'Exportar planilha'}
    </button>
  );
}

export function ExportNotice({ busy, notice }: { busy: boolean; notice: ExportNoticeData | null }) {
  if (busy) return <div className="notice" role="status">Gerando a planilha…</div>;
  if (!notice) return null;
  return notice.error ? (
    <div className="error" role="alert">{notice.text}</div>
  ) : (
    <div className="success" role="status">{notice.text}</div>
  );
}
