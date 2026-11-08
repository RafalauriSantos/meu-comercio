import { BrandMark } from './brand-mark';
import { Skeleton } from './skeleton';

// The frame of AppHeader while the session loads: the brand is real, the rest are placeholders.
export function AppHeaderSkeleton() {
  return (
    <header className="app-header" aria-hidden="true">
      <span className="app-brand">
        <BrandMark size={32} />
        Meu Comércio
      </span>
      <div className="app-nav app-nav-skeleton">
        <Skeleton width={52} height={16} />
        <Skeleton width={64} height={16} />
      </div>
      <div className="app-userbox">
        <Skeleton width={110} height={14} />
        <Skeleton width={56} height={34} radius={8} />
      </div>
    </header>
  );
}
