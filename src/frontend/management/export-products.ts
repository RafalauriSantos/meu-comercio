/** Data lines of the CSV: the title line and the empty lines do not count. A line break inside quotes stays in its line. */
export function countCsvRows(csv: string): number {
  let rows = 0;
  let hasContent = false;
  let quoted = false;
  for (const ch of csv) {
    if (ch === '"') quoted = !quoted;
    if (ch === '\n' && !quoted) {
      if (hasContent) rows++;
      hasContent = false;
    } else if (ch !== '\r') {
      hasContent = true;
    }
  }
  if (hasContent) rows++;
  return Math.max(rows - 1, 0);
}

/** `count` null: the file could not be read, so no number is shown. */
export function exportedText(count: number | null, filename: string): string {
  if (count === null) return `Planilha baixada. Arquivo ${filename}`;
  return `Planilha baixada: ${count} ${count === 1 ? 'produto ativo' : 'produtos ativos'}. Arquivo ${filename}`;
}
