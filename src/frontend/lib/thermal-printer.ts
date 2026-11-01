export type ThermalWidth = '58mm' | '80mm';

export interface ThermalStoreHeader {
  name: string;
  phone?: string;
  cnpj?: string;
  address?: string;
}

export interface ThermalSaleItem {
  name: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface ThermalPaymentItem {
  method: string;
  amount: string;
  receivedAmount?: string;
  changeAmount?: string;
}

export interface ThermalSaleReceiptData {
  store: ThermalStoreHeader;
  saleId: string;
  date: Date | string;
  items: ThermalSaleItem[];
  subtotal: string;
  discount?: string;
  total: string;
  payments: ThermalPaymentItem[];
  operatorName?: string;
}

export interface ThermalCreditNoteData {
  store: ThermalStoreHeader;
  saleId?: string;
  date: Date | string;
  customer: {
    name: string;
    phone: string;
    document?: string;
  };
  previousDebt: string;
  amount: string;
  newDebt: string;
  operatorName?: string;
}

export function getThermalColumns(width: ThermalWidth): number {
  return width === '80mm' ? 48 : 32;
}

export function divider(char = '-', width: number): string {
  return char.repeat(width);
}

export function centerText(text: string, width: number): string {
  const trimmed = text.trim();
  if (trimmed.length >= width) {
    return trimmed.slice(0, width);
  }
  const leftPadding = Math.floor((width - trimmed.length) / 2);
  const rightPadding = width - trimmed.length - leftPadding;
  return ' '.repeat(leftPadding) + trimmed + ' '.repeat(rightPadding);
}

export function padLine(left: string, right: string, width: number): string {
  const totalLength = left.length + right.length;
  if (totalLength + 1 <= width) {
    const spaces = ' '.repeat(width - totalLength);
    return left + spaces + right;
  }

  // Se exceder a largura, trunca o lado esquerdo mantendo o lado direito
  const maxLeft = Math.max(0, width - right.length - 1);
  const truncatedLeft = left.slice(0, maxLeft);
  const spaces = ' '.repeat(Math.max(1, width - truncatedLeft.length - right.length));
  return truncatedLeft + spaces + right;
}

function formatCurrencyValue(val?: string): string {
  if (!val) return '0,00';
  const trimmed = val.trim();
  return trimmed.startsWith('R$') ? trimmed : `R$ ${trimmed}`;
}

export function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= width) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }

    while (currentLine.length > width) {
      lines.push(currentLine.slice(0, width));
      currentLine = currentLine.slice(width);
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

export function formatSaleReceipt(
  data: ThermalSaleReceiptData,
  width: ThermalWidth = '58mm'
): string {
  const cols = getThermalColumns(width);
  const lines: string[] = [];

  // 1. Cabeçalho
  lines.push(centerText(data.store.name, cols));
  if (data.store.cnpj) {
    lines.push(centerText(data.store.cnpj, cols));
  }
  if (data.store.phone) {
    lines.push(centerText(data.store.phone, cols));
  }
  if (data.store.address) {
    lines.push(...wrapText(data.store.address, cols).map((l) => centerText(l, cols)));
  }

  lines.push(divider('=', cols));

  // 2. Dados da Venda
  const dateStr = typeof data.date === 'string' ? data.date : data.date.toLocaleString('pt-BR');
  lines.push(padLine('Data: ' + dateStr, '', cols));
  lines.push(padLine('Venda: ' + data.saleId, '', cols));
  if (data.operatorName) {
    lines.push(padLine('Op: ' + data.operatorName, '', cols));
  }

  lines.push(divider('-', cols));

  // 3. Itens
  lines.push(padLine('ITEM', 'TOTAL', cols));
  lines.push(divider('-', cols));

  for (const item of data.items) {
    const itemLines = wrapText(item.name, cols);
    lines.push(...itemLines);

    const price = item.unitPrice.replace(/^R\$\s*/, '');
    const subtotal = item.subtotal.replace(/^R\$\s*/, '');
    const detailLeft = `${item.quantity}x R$ ${price}`;
    const detailRight = `R$ ${subtotal}`;
    lines.push(padLine(detailLeft, detailRight, cols));
  }

  lines.push(divider('-', cols));

  // 4. Totais
  lines.push(padLine('SUBTOTAL', formatCurrencyValue(data.subtotal), cols));
  if (data.discount && data.discount !== '0,00' && data.discount !== '0.00') {
    lines.push(padLine('DESCONTO', `-${formatCurrencyValue(data.discount)}`, cols));
  }
  lines.push(padLine('TOTAL', formatCurrencyValue(data.total), cols));

  lines.push(divider('-', cols));

  // 5. Pagamentos
  lines.push(padLine('PAGAMENTO', 'VALOR', cols));
  for (const payment of data.payments) {
    lines.push(padLine(payment.method, formatCurrencyValue(payment.amount), cols));
    if (payment.receivedAmount) {
      lines.push(padLine('  RECEBIDO', formatCurrencyValue(payment.receivedAmount), cols));
    }
    if (payment.changeAmount && payment.changeAmount !== '0,00' && payment.changeAmount !== '0.00') {
      lines.push(padLine('  TROCO', formatCurrencyValue(payment.changeAmount), cols));
    }
  }

  lines.push(divider('=', cols));

  // 6. Rodapé
  lines.push(centerText('Obrigado pela preferência!', cols));
  lines.push(centerText('Volte Sempre!', cols));

  return lines.join('\n');
}

export function formatCreditNote(
  data: ThermalCreditNoteData,
  width: ThermalWidth = '58mm'
): string {
  const cols = getThermalColumns(width);
  const lines: string[] = [];

  // Cabeçalho da loja
  lines.push(centerText(data.store.name, cols));
  if (data.store.phone) {
    lines.push(centerText(data.store.phone, cols));
  }

  lines.push(divider('=', cols));
  lines.push(centerText('COMPROVANTE DE FIADO', cols));
  lines.push(centerText('(NOTA PROMISSÓRIA)', cols));
  lines.push(divider('=', cols));

  // Dados do Cliente
  lines.push(padLine('CLIENTE:', '', cols));
  lines.push(...wrapText(data.customer.name, cols));
  lines.push(padLine('Tel: ' + data.customer.phone, '', cols));
  if (data.customer.document) {
    lines.push(padLine('Doc: ' + data.customer.document, '', cols));
  }

  lines.push(divider('-', cols));

  // Dados da Transação
  const dateStr = typeof data.date === 'string' ? data.date : data.date.toLocaleString('pt-BR');
  lines.push(padLine('Data: ' + dateStr, '', cols));
  if (data.saleId) {
    lines.push(padLine('Venda: ' + data.saleId, '', cols));
  }
  if (data.operatorName) {
    lines.push(padLine('Op: ' + data.operatorName, '', cols));
  }

  lines.push(divider('-', cols));

  // Posição Financeira
  lines.push(padLine('Saldo Anterior:', formatCurrencyValue(data.previousDebt), cols));
  lines.push(padLine('Valor da Compra (+):', formatCurrencyValue(data.amount), cols));
  lines.push(divider('-', cols));
  lines.push(padLine('NOVO SALDO DEVEDOR:', formatCurrencyValue(data.newDebt), cols));

  lines.push(divider('=', cols));

  // Declaração de Confissão de Dívida
  const debtConfession =
    'Reconheço a dívida discriminada acima e comprometo-me a efetuar o pagamento integral ao credor.';
  lines.push(...wrapText(debtConfession, cols));

  lines.push('');
  lines.push('');
  lines.push(divider('-', cols));
  lines.push(centerText('Assinatura do Cliente', cols));

  return lines.join('\n');
}
