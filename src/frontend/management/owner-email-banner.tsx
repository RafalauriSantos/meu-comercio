import type { OwnerEmailStatus } from '@/frontend/lib/api-client';
import { noticeView } from '@/frontend/ui/notice-view';
import { bannerView } from './owner-email-view';

interface OwnerEmailBannerProps {
  status: OwnerEmailStatus | null;
  onOpen: () => void;
}

/** The fixed notice of Gestão while the owner has no confirmed e-mail (AC-62, AC-63). The page decides who sees it. */
export function OwnerEmailBanner({ status, onOpen }: OwnerEmailBannerProps) {
  const view = bannerView(status);
  if (!view) return null;
  return (
    <div {...noticeView({ text: view.text })}>
      <span>{view.text}</span>
      <button type="button" className="soft" onClick={onOpen}>{view.button}</button>
    </div>
  );
}
