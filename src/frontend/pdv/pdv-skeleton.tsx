import { AppHeaderSkeleton } from '@/frontend/ui/app-header-skeleton';
import { Skeleton } from '@/frontend/ui/skeleton';

const CART_ROWS = [0, 1, 2];
const METHOD_BUTTONS = [0, 1, 2, 3];

// The PDV while the session and the cash register load: the same layout as the sale screen,
// drawn with gray blocks, so the page does not jump when the data arrives.
export function PdvSkeleton() {
  return (
    <div className="pdv-app" role="status" aria-busy="true">
      <span className="sr-only">Carregando o terminal de vendas…</span>
      <AppHeaderSkeleton />

      <main className="pdv-main" aria-hidden="true">
        <section className="pdv-col">
          <div className="card">
            <Skeleton width={150} height={19} />
            <div className="pdv-scan-row" style={{ marginTop: 10 }}>
              <span className="skeleton skeleton-pdv-scan-input" aria-hidden="true" />
              <span className="skeleton skeleton-pdv-scan-button" aria-hidden="true" />
            </div>
            <span className="skeleton pdv-hide-sm" aria-hidden="true" style={{ width: 260, height: 17, marginTop: 12 }} />
          </div>

          <div className="card pdv-cart">
            <div className="pdv-cart-head">
              <Skeleton width={157} height={27} />
              <Skeleton width={110} height={17} />
            </div>
            <div className="skeleton-row skeleton-line" style={{ paddingBlock: 15 }}>
              <Skeleton width={60} height={14} />
              <Skeleton width={28} height={14} style={{ marginLeft: 'auto' }} />
              <Skeleton width={44} height={14} />
            </div>
            <div className="skeleton-pdv-cart-rows">
              {CART_ROWS.map((row) => (
                <div key={row} className="skeleton-row skeleton-line">
                  <Skeleton width="38%" height={19} />
                  <Skeleton width={96} height={40} radius={10} />
                  <Skeleton width={70} height={19} style={{ marginLeft: 'auto' }} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="pdv-col pdv-side">
          <div className="pdv-total-card">
            <Skeleton tone="on-ink" width={110} height={16} />
            <span className="skeleton skeleton-on-ink skeleton-pdv-total-value" aria-hidden="true" style={{ marginTop: 12 }} />
            <Skeleton tone="on-ink" width={120} height={14} style={{ marginTop: 10 }} />
            <Skeleton tone="on-ink" height={60} radius={12} style={{ marginTop: 16 }} />
            <Skeleton tone="on-ink" height={48} radius={12} style={{ marginTop: 10 }} />
          </div>

          <div className="card pdv-methods-card">
            <Skeleton width={150} height={19} style={{ marginBottom: 12 }} />
            <div className="pdv-quick-methods">
              {METHOD_BUTTONS.map((button) => (
                <span key={button} className="skeleton skeleton-pdv-method" aria-hidden="true" />
              ))}
            </div>
          </div>
        </aside>
      </main>

      <footer className="pdv-status" aria-hidden="true">
        <span className="skeleton pdv-hide-sm" aria-hidden="true" style={{ width: 220, height: 17 }} />
        <span className="pdv-status-actions">
          <Skeleton width={81} height={32} radius={8} />
          <Skeleton width={108} height={32} radius={8} />
        </span>
      </footer>
    </div>
  );
}
