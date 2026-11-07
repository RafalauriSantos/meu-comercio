export type AuthMode = 'login' | 'register' | 'setup' | 'cash';

interface BrandCopy {
  headline: string;
  claims: readonly string[];
}

// Brand panel copy of the auth screens, in Brazilian Portuguese. Allowed claims only:
// no profit, reports, prices, customers, ratings or testimonials.
const SIGN_IN_COPY: BrandCopy = {
  headline: 'Seu caixa, sob controle.',
  claims: [
    'Fiado com limite por cliente. Passou do limite, só a dona libera.',
    'Fechamento do caixa que compara a contagem com o valor esperado.',
    'Se a internet cair, a venda simples em dinheiro fica salva e segue depois.',
  ],
};

const SIGN_UP_COPY: BrandCopy = {
  headline: 'Do cadastro ao caixa, sem caderno.',
  claims: [
    'PIN da dona de 6 dígitos para estornos e fiado acima do limite.',
    'Limite de fiado por cliente, definido por você.',
    'Fechamento do caixa que compara a contagem com o valor esperado.',
  ],
};

export const AUTH_CONTENT = {
  brand: 'Meu Comércio',
  imageCaption: 'Exemplo: tela do PDV com dados de demonstração.',
  image: { src: '/landing/pdv-desktop.webp', width: 1920, height: 1140 },
  modes: {
    login: SIGN_IN_COPY,
    cash: SIGN_IN_COPY,
    register: SIGN_UP_COPY,
    setup: SIGN_UP_COPY,
  } satisfies Record<AuthMode, BrandCopy>,
} as const;
