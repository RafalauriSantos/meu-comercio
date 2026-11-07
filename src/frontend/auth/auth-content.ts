interface BrandCopy {
  headline: string;
  claims: readonly string[];
}

// Brand panel copy of the auth screens, in Brazilian Portuguese. One copy for every mode:
// the panel must keep the same height when the user switches between sign in and sign up.
// Allowed claims only: no profit, reports, prices, customers, ratings or testimonials.
const BRAND_COPY: BrandCopy = {
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
  copy: BRAND_COPY,
} as const;
