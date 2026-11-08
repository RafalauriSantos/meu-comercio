import Link from 'next/link';
import { BrandMark } from './brand-mark';

export type AppHeaderSection = 'venda' | 'gestao';

interface AppHeaderProps {
  active: AppHeaderSection;
  username?: string;
  isOwner?: boolean;
  // Hora atual já formatada (ex.: "13:16"). Omita para não mostrar relógio.
  clock?: string;
  onLogout: () => void;
}

// Cabeçalho comum do PDV e da gestão: marca, navegação, operador, relógio e saída.
export function AppHeader({ active, username, isOwner, clock, onLogout }: AppHeaderProps) {
  return (
    <header className="app-header">
      <Link href="/pdv" className="app-brand">
        <BrandMark size={32} />
        Meu Comércio
      </Link>

      <nav aria-label="Principal" className="app-nav">
        <Link href="/pdv" aria-current={active === 'venda' ? 'page' : undefined}>
          Venda
        </Link>
        <Link href="/gestao" aria-current={active === 'gestao' ? 'page' : undefined}>
          Gestão
        </Link>
      </nav>

      <div className="app-userbox">
        {username && (
          <span>
            {username} · {isOwner ? 'Dona' : 'Operador'}
          </span>
        )}
        {clock && <span className="app-clock">{clock}</span>}
        <button type="button" className="ghost" onClick={onLogout}>
          Sair
        </button>
      </div>
    </header>
  );
}
