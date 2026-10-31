# Meu Comércio

> **PDV e Gestão Financeira para Pequeno Varejo**  
> Arquitetura **Hexagonal (Modular Monolith)** com domínio puro, precisão financeira exata e isolamento multi-tenant.

[![Tests](https://img.shields.io/badge/Vitest-72%20passed%20(100%25)-brightgreen)](./docs/TRACEABILITY.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16%20Turbopack-black)](https://nextjs.org/)
[![Database](https://img.shields.io/badge/Neon-PostgreSQL%20Serverless-00e599)](https://neon.tech/)
[![ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F)](https://orm.drizzle.team/)

---

## ⚡ Visão Rápida (5 Segundos)

- **Zero Floats em Dinheiro**: Todo cálculo monetário utiliza o Value Object `Money` baseado em centavos inteiros com arredondamento comercial *half-up*.
- **Caixa com Conferência Cega**: Trava no banco garantindo apenas 1 sessão aberta por loja (`idx_one_open_cash_session_per_merchant`) e justificativa compulsória de divergência.
- **Checkout & Split Payments**: Divisão de pagamento (Dinheiro, PIX, Débito, Crédito), troco exato, dedução atômica de estoque e proteção contra duplicidade via `Idempotency-Key`.
- **Prevenção Estrita de Estoque Negativo**: Regra de negócio no domínio que rejeita vendas antes de efetivar qualquer débito parcial.
- **Multi-Tenancy por Design**: 100% das tabelas e consultas são isoladas por `merchant_id`.

---

## 🏛️ Estrutura Hexagonal

O domínio é TypeScript puro (`src/modules/*`), completamente desacoplado de frameworks e banco de dados:

```
src/
├── modules/
│   ├── users/        # Autenticação, papéis (Owner/Operator), lockout e PIN
│   ├── cash/         # Turnos de caixa, suprimento, sangria e conferência cega
│   ├── products/     # Catálogo, busca por nome e leitura de código de barras
│   ├── inventory/    # Controle de estoque com trava de saldo negativo
│   ├── sales/        # Checkout, split payments, cálculo de troco e idempotência
│   └── audit/        # Trilha de auditoria imutável (audit_events)
├── shared/
│   ├── domain/       # Value Objects (Money)
│   └── infrastructure/ # Sessões HMAC-SHA256, cookies __Host- e Drizzle DB
└── app/
    └── api/          # Controladores HTTP finos (Next.js App Router)
```

---

## 🚀 Como Executar

```bash
# 1. Instalar dependências
npm install

# 2. Executar suíte de testes (72 testes unitários e de integração)
npm test

# 3. Executar build de produção (Next.js 16 Turbopack)
npm run build

# 4. Iniciar ambiente de desenvolvimento
npm run dev
```

---

## 📋 Governança & Decisões Arquiteturais

Todas as decisões técnicas e regras de negócio estão formalmente documentadas em Architecture Decision Records (ADRs):

- [`docs/DECISIONS.md`](./docs/DECISIONS.md): ADR-001 a ADR-007 (Money, Multi-Tenancy, Idempotência, Caixa Cego, Estoque).
- [`docs/TRACEABILITY.md`](./docs/TRACEABILITY.md): Matriz de rastreabilidade vinculando critérios de negócio à suíte de testes.
- [`docs/BACKLOG.md`](./docs/BACKLOG.md): Fatias verticais de entrega (Slices).

---

## 📄 Licença
Distribuído sob a licença MIT.
