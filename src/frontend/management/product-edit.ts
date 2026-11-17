import { ApiError, type ProductItem, type ProductPatch } from '@/frontend/lib/api-client';
import { getErrorMessage } from '@/frontend/lib/formatters';
import { priceToDigits } from '@/frontend/lib/currency-mask';

// Pure rules of editing a product (the hook only holds the state and passes the api call in).
export interface EditDraft {
  name: string;
  /** Masked text ("25,50"), never a number. */
  price: string;
  barcode: string;
}

export interface EditError {
  text: string;
  reload: boolean;
}

export type EditResult = { kind: 'nochange' } | { kind: 'saved'; item: ProductItem } | ({ kind: 'failed' } & EditError);

export const BARCODE_CHANGE_WARNING =
  'Você está trocando o código de barras. As etiquetas impressas com o código antigo deixam de funcionar: imprima de novo ou cole o código novo.';
export const PRICE_CHANGE_WARNING =
  'Caixas sem internet ainda vendem pelo preço antigo. Essas vendas podem ficar paradas na fila. Antes de mudar o preço, deixe os caixas sincronizarem.';
export const SCAN_DURING_EDIT_NOTICE = 'Termine ou cancele a edição antes de cadastrar um produto novo.';

export function draftFromProduct(product: ProductItem): EditDraft {
  return { name: product.name, price: priceToDigits(product.salePrice), barcode: product.barcode };
}

export function barcodeChanged(target: ProductItem, draft: EditDraft): boolean {
  return draft.barcode.trim() !== target.barcode;
}

export function priceChanged(target: ProductItem, draft: EditDraft): boolean {
  return draft.price !== priceToDigits(target.salePrice);
}

/** Only what changed, or null when nothing did. The price goes as text with a dot ("25.50"). */
export function buildProductPatch(target: ProductItem, draft: EditDraft): ProductPatch | null {
  const patch: ProductPatch = {};
  if (draft.name.trim() !== target.name) patch.name = draft.name.trim();
  if (priceChanged(target, draft)) patch.salePrice = draft.price.replace(',', '.');
  if (barcodeChanged(target, draft)) patch.barcode = draft.barcode.trim();
  if (Object.keys(patch).length === 0) return null;
  if (target.updatedAt) patch.expectedUpdatedAt = target.updatedAt;
  return patch;
}

/** A price of zero masks to an empty text, so an empty price covers zero too. */
export function isDraftValid(draft: EditDraft): boolean {
  return draft.name.trim().length >= 2 && draft.barcode.trim() !== '' && draft.price !== '';
}

export function editErrorMessage(err: unknown): EditError {
  if (err instanceof ApiError) {
    if (err.code === 'PRODUCT_CHANGED') {
      return { text: 'Este produto foi alterado por outra pessoa depois que você abriu a edição. Recarregue a lista e edite de novo.', reload: true };
    }
    if (err.status === 404) return { text: 'Este produto não existe mais na lista. Recarregue a lista.', reload: true };
    if (err.status === 403) return { text: 'Só a proprietária pode editar produtos.', reload: false };
  }
  return { text: getErrorMessage(err, 'Erro ao editar produto.'), reload: false };
}

/** Builds the patch and sends it with the given update function (the api call is injected, so this runs without a screen). */
export async function submitProductEdit(
  update: (id: string, patch: ProductPatch) => Promise<ProductItem>,
  target: ProductItem,
  draft: EditDraft
): Promise<EditResult> {
  const patch = buildProductPatch(target, draft);
  if (!patch) return { kind: 'nochange' };
  try {
    return { kind: 'saved', item: await update(target.id, patch) };
  } catch (err) {
    return { kind: 'failed', ...editErrorMessage(err) };
  }
}
