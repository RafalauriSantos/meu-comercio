# Meu Comércio

Sistema Ponto de Venda (PDV) e Gestão Multi-Tenant para pequenos e médios comércios, projetado para operação rápida de balcão, controle rigoroso de caixa, auditoria imutável, estoque e suporte a contingência offline.

## Arquitetura: Monólito Modular Desacoplado

O projeto adota uma arquitetura em **Monólito Modular (Hexagonal / Ports & Adapters)** rodando sobre o ecossistema nativo da **Vercel** com **Next.js (App Router)** e banco de dados **PostgreSQL Serverless (Neon)**:

- **Domínio Puro**: Módulos de negócio independentes de framework (`src/modules/*`), com regras financeiras, cálculo de troco, travas de estoque e controle de turnos de caixa.
- **Precisão Financeira**: Valores monetários são encapsulados pelo Value Object `Money` com precisão decimal exata e centavos inteiros (`cents`), eliminando erros de ponto flutuante.
- **Isolamento Multi-Tenant**: Toda entidade e operação é delimitada estritamente por `merchant_id`.
- **Entrega / Web Adapters**: As rotas do Next.js (`src/app/api/*`) atuam unicamente como controladores HTTP finos que acionam os Casos de Uso dos módulos.

## Módulos do Sistema

| Módulo | Responsabilidade |
| --- | --- |
| `users` | Autenticação, gestão de operadores, bloqueio por tentativas e PIN de autorização da proprietária |
| `cash` | Abertura e fechamento de sessão de caixa (turno), conferência cega e justificativa de divergências |
| `products` | Catálogo de produtos, leitura de código de barras, busca por nome e precificação |
| `inventory` | Movimentações de estoque, prevenção estrita de saldo negativo e auditoria de reposição |
| `sales` | Checkout, cálculo de totais no servidor, dinheiro com troco, split payments e idempotência |
| `customers` | Cadastro de clientes e gestão de limite de fiado com autorização por PIN |
| `audit` | Registro imutável de eventos sensíveis (descontos, estornos, quebras de caixa) |

## Comandos Principais

```bash
# Instalar dependências
npm install

# Executar suíte de testes (Vitest)
npm test

# Executar testes em modo watch
npm run test:watch

# Iniciar ambiente de desenvolvimento
npm run dev

# Build de produção (Vercel)
npm run build
```

## Governança e Regras

Consulte:
- [`DECISIONS.md`](./DECISIONS.md): Fonte da verdade para todas as decisões de negócio e arquitetura aprovadas.
- [`CLAUDE.md`](./CLAUDE.md): Padrões de revisão de código, qualidade e critérios bloqueantes.
- [`PRODUCT.md`](./PRODUCT.md): Visão do produto, papéis e funcionalidades.
