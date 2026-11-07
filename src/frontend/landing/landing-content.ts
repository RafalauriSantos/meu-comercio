export interface LandingAction {
  label: string;
  href: string;
}

export interface LandingFigure {
  label: string;
  value: string;
}

// Every user-facing string of the landing page lives here, in Brazilian Portuguese.
// Allowed claims only (see docs/superpowers/specs/2026-11-07-landing-page-design.md):
// no profit, no reports, no prices, no customers, no ratings.
export const LANDING_CONTENT = {
  brand: 'Meu Comércio',
  header: {
    login: { label: 'Entrar', href: '/login' } satisfies LandingAction,
  },
  hero: {
    title: 'Cada real que entra e sai, sob seu controle.',
    subtitle: 'Venda, fiado e caixa registrados na hora. Nada some do caderno.',
    primary: { label: 'Criar minha conta grátis', href: '/login?modo=cadastro' } satisfies LandingAction,
    secondary: { label: 'Já tenho conta', href: '/login' } satisfies LandingAction,
    note: 'Gratuito por enquanto.',
    panel: {
      title: 'Caixa de hoje',
      badge: 'Exemplo',
      label: 'Exemplo do painel do caixa',
      caption: 'Valores de exemplo, não são dados reais.',
      figures: [
        { label: 'Fiado em aberto', value: 'R$ 1.240,00' },
        { label: 'Dinheiro esperado no caixa', value: 'R$ 860,00' },
        { label: 'Conferência do caixa', value: 'confere' },
      ] satisfies LandingFigure[],
    },
  },
} as const;
