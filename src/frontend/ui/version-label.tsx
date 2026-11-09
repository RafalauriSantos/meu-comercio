import { formatVersionLabel, getVersionInfo } from '@/shared/version';

// The running version, small and quiet, for the screens where someone checks what is installed.
export function VersionLabel() {
  const info = getVersionInfo();
  const title = info.builtAt ? `Versão ${info.version}, publicada em ${info.builtAt}` : `Versão ${info.version}`;

  return (
    <span className="app-version" title={title}>
      {formatVersionLabel(info)}
    </span>
  );
}
