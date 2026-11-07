import type { Metadata } from 'next';

const SITE = 'https://meucomercio.vercel.app';
const TITLE = 'Meu Comércio: controle de caixa, fiado e estoque';
const DESCRIPTION =
  'PDV gratuito por enquanto para mercadinhos, empórios e padarias. Venda, fiado e caixa registrados na hora, com o caixa conferido no fim do dia.';

// No image is declared on purpose: none exists yet, and the page must not claim one.
export const LANDING_METADATA: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: SITE },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Meu Comércio',
    url: SITE,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
};
