export interface LandingAction {
  label: string;
  href: string;
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
    shot: {
      src: '/landing/pdv-desktop.webp',
      width: 1920,
      height: 1140,
      alt: 'Tela do PDV no computador: leitor de código de barras, lista de produtos com quantidades e totais, e o resumo da venda com o total a pagar.',
      caption: 'Exemplo: a tela do PDV com produtos e valores de demonstração.',
    },
  },
  losses: {
    title: 'O que o caderno deixa escapar',
    items: [
      {
        loss: 'Fiado esquecido',
        control: 'Cada cliente tem seu extrato e um limite de fiado. Passou do limite, só a dona libera, com o PIN.',
      },
      {
        loss: 'Caixa que não bate',
        control: 'Você conta a gaveta e o sistema compara com o valor esperado. Se houver diferença, ele pede uma justificativa.',
      },
      {
        loss: 'Troco errado',
        control: 'O sistema calcula o troco na hora, a partir do valor que o cliente deu.',
      },
      {
        loss: 'Estoque que some',
        control: 'Cada venda baixa o estoque, e o sistema não deixa vender o que não tem.',
      },
    ],
  },
  steps: {
    title: 'Como funciona',
    items: [
      { title: 'Crie sua conta', text: 'Cadastre sua loja e escolha o PIN da dona, com 6 dígitos.' },
      { title: 'Venda', text: 'Passe os produtos e registre o pagamento: dinheiro, cartão, Pix ou fiado.' },
      { title: 'Feche o dia', text: 'Conte a gaveta, e o sistema mostra se o caixa confere.' },
    ],
  },
  safety: {
    title: 'Quem manda é você',
    items: [
      {
        title: 'PIN da dona',
        text: 'Estornos e fiado acima do limite só passam com o PIN da dona, de 6 dígitos.',
      },
      {
        title: 'Limite de fiado',
        text: 'Você define quanto cada cliente pode dever.',
      },
      {
        title: 'Internet caiu?',
        text: 'A venda simples em dinheiro fica salva no navegador e segue para o sistema quando a conexão volta. Cartão, Pix e fiado precisam de internet.',
      },
    ],
  },
  faq: {
    title: 'Perguntas rápidas',
    items: [
      { question: 'É gratuito?', answer: 'Gratuito por enquanto.' },
      { question: 'Preciso instalar alguma coisa?', answer: 'Não. O Meu Comércio funciona no navegador.' },
      { question: 'Quem pode autorizar o que é arriscado?', answer: 'Só a dona, com o PIN de 6 dígitos.' },
    ],
  },
  finalCall: {
    title: 'Pare de anotar no caderno.',
    text: 'Crie sua conta e comece a registrar hoje.',
    note: 'Gratuito por enquanto.',
  },
  footer: 'PDV e controle de caixa para pequenos comércios.',
} as const;
