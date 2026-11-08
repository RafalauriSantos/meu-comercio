import type { CSSProperties } from 'react';

interface SkeletonProps {
  // Any CSS length. Omit it for a block as wide as its container.
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  // "on-ink" is for the dark blue total block, where a surface-colored block would glare.
  tone?: 'default' | 'on-ink';
  style?: CSSProperties;
}

// One gray block that stands in for a piece of content while the data loads. It is decoration:
// the screens that use it announce the loading once, with a visually hidden label.
export function Skeleton({ width = '100%', height = 16, radius = 8, tone = 'default', style }: SkeletonProps) {
  return (
    <span
      className={tone === 'on-ink' ? 'skeleton skeleton-on-ink' : 'skeleton'}
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}
