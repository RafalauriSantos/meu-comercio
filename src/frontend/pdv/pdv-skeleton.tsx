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
              <Skeleton height={64} radius={12} style={{ flex: 1 }} />
              <Skeleton width={131} height={64} radius={12} />
            </div>
            <Skeleton width={260} height={17} style={{ marginTop: 12 }} />
          </div>

          <div className="card pdv-cart">
            <div className="pdv-cart-head">
              <Skeleton width={157} height={27} />
              <Skeleton width={110} height={17} />
            </div>
            {CART_ROWS.map((row) => (
              <div key={row} className="skeleton-row skeleton-line">
                <Skeleton width="38%" height={19} />
                <Skeleton width={96} height={40} radius={10} />
                <Skeleton width={70} height={19} style={{ marginLeft: 'auto' }} />
              </div>
            ))}
          </div>
        </section>

        <aside className="pdv-col pdv-side">
          <div className="pdv-total-card">
            <Skeleton tone="on-ink" width={110} height={16} />
            <Skeleton tone="on-ink" width={190} height={44} style={{ marginTop: 12 }} />
            <Skeleton tone="on-ink" width={120} height={14} style={{ marginTop: 10 }} />
            <Skeleton tone="on-ink" height={60} radius={12} style={{ marginTop: 16 }} />
            <Skeleton tone="on-ink" height={48} radius={12} style={{ marginTop: 10 }} />
          </div>

          <div className="card pdv-methods-card">
            <Skeleton width={150} height={19} style={{ marginBottom: 12 }} />
            <div className="pdv-quick-methods">
              {METHOD_BUTTONS.map((button) => (
                <Skeleton key={button} height={60} radius={12} />
              ))}
            </div>
          </div>
        </aside>
      </main>

      <footer className="pdv-status" aria-hidden="true">
        <Skeleton width={220} height={17} />
        <span className="pdv-status-actions">
          <Skeleton width={81} height={32} radius={8} />
          <Skeleton width={108} height={32} radius={8} />
        </span>
      </footer>
    </div>
  );
}
