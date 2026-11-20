import { type ProductItem } from '@/frontend/lib/api-client';
import { formatMoney } from '@/frontend/lib/formatters';
import { Money } from '@/shared/domain/money';
import { formatQuantity, lineSubtotal } from '@/shared/domain/product-unit';

export interface CartLine {
  product: ProductItem;
  quantity: number;
}

// The "Itens da venda" card: the lines of the cart and the empty state. Display only, moved from the page
// as it was; the cart and its changes stay in the page.
export function CartTable({
  cart,
  lastItem,
  itemsSummary,
  onChangeQuantity,
}: {
  cart: CartLine[];
  lastItem: ProductItem | null;
  itemsSummary: string;
  onChangeQuantity: (productId: string, delta: number) => void;
}) {
  return (
    <div className="card pdv-cart">
      <div className="pdv-cart-head">
        <h2 className="pdv-title">Itens da venda</h2>
        <span className="pdv-meta">{itemsSummary}</span>
      </div>

      <div className="pdv-table-wrap">
        <table className="pdv-table">
          <thead>
            <tr>
              <th scope="col">Produto</th>
              <th scope="col" className="pdv-center">
                Qtd
              </th>
              <th scope="col" className="pdv-right pdv-hide-sm">
                Preço
              </th>
              <th scope="col" className="pdv-right">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {cart.map((line) => {
              const isLatest = lastItem?.id === line.product.id;
              const lineTotal = line.product.salePrice
                ? lineSubtotal(Money.fromDecimal(line.product.salePrice), line.quantity, line.product.unit)
                : Money.zero();

              return (
                <tr key={line.product.id} className={isLatest ? 'is-latest' : undefined}>
                  <td className="pdv-product">
                    {line.product.name}
                    {isLatest && <span className="pdv-latest-tag pdv-hide-sm">último lido</span>}
                    <span className="pdv-unit num">
                      {formatMoney(line.product.salePrice)} {line.product.unit === 'KG' ? 'por kg' : 'cada'}
                    </span>
                  </td>
                  <td className="pdv-center">
                    <span className="pdv-qty">
                      <button
                        className="pdv-qbtn"
                        type="button"
                        aria-label={`Diminuir quantidade de ${line.product.name}`}
                        onClick={() => onChangeQuantity(line.product.id, -1)}
                      >
                        −
                      </button>
                      <span className="pdv-qty-value num">{formatQuantity(line.quantity, line.product.unit)}</span>
                      <button
                        className="pdv-qbtn"
                        type="button"
                        aria-label={`Aumentar quantidade de ${line.product.name}`}
                        onClick={() => onChangeQuantity(line.product.id, 1)}
                      >
                        +
                      </button>
                    </span>
                  </td>
                  <td className="pdv-right pdv-hide-sm pdv-price num">{formatMoney(line.product.salePrice)}
                    {line.product.unit === 'KG' ? '/kg' : ''}
                  </td>
                  <td className="pdv-right pdv-line-total num">{lineTotal.formatBrl()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {cart.length === 0 && (
          <div className="pdv-empty">
            <p className="pdv-empty-title">Carrinho vazio</p>
            <p className="muted">Escaneie ou digite o código de barras de um produto para iniciar a venda.</p>
          </div>
        )}
      </div>
    </div>
  );
}
