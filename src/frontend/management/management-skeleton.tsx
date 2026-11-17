import { Skeleton } from '@/frontend/ui/skeleton';

const TABS = [0, 1, 2, 3];
const TABLE_ROWS = [0, 1, 2, 3, 4];

// The management data area while its data loads: tabs, indicators and a table, in gray. The header and the
// title are real on the page. The placeholders are direct children of the page (the wrapper adds no box), so
// the spacing between them is the same as the real content. The tabs and the search field share the row (flex)
// instead of copying the pixel width of today's labels, so a renamed tab does not make the skeleton drift.
// `shape` false (before the delay) keeps the same markup invisible, so the space is reserved.
export function ManagementDataSkeleton({ shape }: { shape: boolean }) {
  return (
    <div style={{ display: 'contents', visibility: shape ? undefined : 'hidden' }}>
      {shape && (
        <span className="sr-only" role="status" aria-busy="true">
          Carregando o painel de gestão…
        </span>
      )}

      <div className="mg-tabs" aria-hidden="true">
        {TABS.map((tab) => (
          <Skeleton key={tab} height={44} radius={12} style={{ flex: '1 1 190px', maxWidth: 241 }} />
        ))}
      </div>

      <section className="mg-section" aria-hidden="true">
        <div className="mg-summary">
          <Skeleton width={260} height={28} />
          <Skeleton width={120} height={40} radius={10} />
        </div>

        <div className="card mg-card-flush">
          <div className="mg-toolbar">
            <Skeleton height={48} radius={12} style={{ flex: '1 1 280px' }} />
            <Skeleton width={141} height={48} radius={12} />
            <Skeleton width={81} height={40} radius={12} />
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
    </div>
  );
}
