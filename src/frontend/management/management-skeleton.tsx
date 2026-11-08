import { AppHeaderSkeleton } from '@/frontend/ui/app-header-skeleton';
import { Skeleton } from '@/frontend/ui/skeleton';

const TAB_WIDTHS = [212, 183, 241, 150];
const KPIS = [0, 1, 2];
const TABLE_ROWS = [0, 1, 2, 3, 4];

// The management panel while its data loads: header, title, tabs, indicators and a table, in gray.
// The placeholders are direct children of the page, like the real content, so the spacing between
// them is the same; each one is hidden from screen readers on its own.
export function ManagementSkeleton() {
  return (
    <>
      <AppHeaderSkeleton />

      <main className="management-page" role="status" aria-busy="true">
        <span className="sr-only">Carregando o painel de gestão…</span>

        <div className="mg-titlebar" aria-hidden="true">
          <div>
            <Skeleton width={300} height={26} />
            <Skeleton width={160} height={17} style={{ marginTop: 6 }} />
          </div>
          <Skeleton width={164} height={48} radius={12} />
        </div>

        <div className="mg-tabs" aria-hidden="true">
          {TAB_WIDTHS.map((width) => (
            <Skeleton key={width} width={width} height={44} radius={12} />
          ))}
        </div>

        <section className="mg-section" aria-hidden="true">
          <div className="mg-kpis">
            {KPIS.map((kpi) => (
              <div key={kpi} className="mg-kpi">
                <Skeleton width={140} height={17} />
                <Skeleton width={90} height={44} style={{ marginTop: 8 }} />
              </div>
            ))}
          </div>

          <div className="card mg-card-flush">
            <div className="mg-toolbar">
              <Skeleton width={341} height={48} radius={12} />
              <Skeleton width={81} height={44} radius={12} />
              <Skeleton width={141} height={44} radius={12} />
            </div>
            {TABLE_ROWS.map((row) => (
              <div key={row} className="skeleton-row skeleton-line">
                <Skeleton width="34%" height={19} />
                <Skeleton width={80} height={19} style={{ marginLeft: 'auto' }} />
                <Skeleton width={60} height={19} />
                <Skeleton width={82} height={40} radius={8} />
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
