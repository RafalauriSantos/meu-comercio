# Backlog de Entregas — Meu Comércio

Este documento rastreia formalmente as fatias verticais de entrega, critérios de aceitação e status de cada etapa de acordo com o protocolo dos 6 agentes.

---

## Fatias Verticais (Slices)

### [x] Slice 0: Fundação & Monólito Modular
- [x] Inicialização do Next.js 16 + TypeScript + Turbopack.
- [x] Estrutura de diretórios desacoplada em `src/modules/*` com `domain`, `application` e `infrastructure`.
- [x] Value Object `Money` baseado em centavos inteiros e precisão decimal comercial *half-up*.
- [x] Suíte de testes unitários com Vitest rodando em modo nativo.
- [x] Registro da governança em `DECISIONS.md` e `PRODUCT.md`.
- **Status:** Concluído ✅ (`db05f44`)

### [x] Slice 1: Setup Neon, Módulo de Usuários e Autenticação
- [x] Configuração do Drizzle ORM e conexão com `@neondatabase/serverless`.
- [x] Schemas relacionais `merchants`, `app_users`, `user_authorities` e `owner_recovery_tokens`.
- [x] Entidade `User` com papéis (`ROLE_OWNER`, `ROLE_OPERATOR`) e capacidades operacionais.
- [x] Hashing seguro de senhas e PINs via `bcryptjs`.
- [x] `InitialOwnerSetupUseCase`: provisionamento da dona inicial e isolamento contra cadastros duplos.
- [x] `AuthenticateUserUseCase`: login com contagem de falhas e bloqueio temporário de 15 minutos após 5 erros.
- [x] Tokens de sessão assinados com HMAC-SHA256 e cookies de segurança `HttpOnly` com prefixo `__Host-`.
- [x] Rotas `/api/setup/status`, `/api/setup/owner`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`.
- **Status:** Concluído e Auditado ✅ (`dd7d650`)

### [x] Slice 2: Módulo de Caixa (Turno de Caixa) e Auditoria Imutável
- [x] Schemas `cash_sessions`, `cash_movements` e `audit_events`.
- [x] Regra de integridade no banco: apenas 1 sessão de caixa aberta por comércio (`idx_one_open_cash_session_per_merchant`).
- [x] Entidade `CashSession` e Value Object de conferência cega.
- [x] `OpenCashSessionUseCase`: abertura com fundo de troco e registro de auditoria.
- [x] `CloseCashSessionUseCase`: conferência cega, autorização restrita (operador que abriu ou proprietária) e justificativa obrigatória de divergência.
- [x] `GetCurrentCashSessionUseCase`: consulta de caixa aberto com cálculo de dinheiro esperado em tempo real.
- [x] Rotas `/api/cash/current`, `/api/cash/open`, `/api/cash/close`.
- **Auditoria PR-Reviewer:** Veredito formal **PASS** (Zero achados Blocking ou Important).
- **Status:** Concluído e Auditado ✅ (`ecaaadf`)

### [x] Slice 3: Catálogo de Produtos e Controle de Estoque
- [x] Schemas `products`, `inventory_items` e `inventory_movements`.
- [x] Leitura de código de barras (`/api/products/barcode/[barcode]`) e busca rápida por nome (`/api/products/search`).
- [x] Prevenção estrita de estoque negativo no domínio (`InsufficientStockError`).
- [x] Reposição de estoque (`/api/inventory/restock`) com rastreamento e registro de auditoria.
- **Status:** Concluído e Auditado ✅

### [x] Slice 4: Vendas, Checkout e Split Payments
- [x] 4.1 Schemas relacionais Drizzle `sales`, `sale_items` e `payments` com multi-tenancy estrito (`merchant_id`), chaves estrangeiras e integridade referencial.
- [x] 4.2 Restrição única parcial para chave de idempotência (`merchant_id, idempotency_key WHERE idempotency_key IS NOT NULL`).
- [x] 4.3 Entidades puras de domínio (`Sale`, `SaleItem`, `Payment`) com invariantes estritas e cálculos imutáveis via Value Object `Money`.
- [x] 4.4 Validação compulsória de sessão de caixa aberta (`findCurrentOpenSession`) antes de autorizar qualquer venda.
- [x] 4.5 Verificação de estoque disponível e dedução atômica por produto vendido com lançamento de movimentação `'SALE'`.
- [x] 4.6 Suporte a pagamentos múltiplos/divididos (Split Payments) em Dinheiro (`CASH`), PIX (`PIX`), Débito (`DEBIT_CARD`) e Crédito (`CREDIT_CARD`), garantindo soma exata do valor da venda.
- [x] 4.7 Cálculo exato de troco para pagamentos em dinheiro com validação de valor recebido >= valor pago.
- [x] 4.8 Registro automático de entrada de dinheiro (`SALE_RECEIPT`) no caixa aberto ativo quando houver componente em dinheiro.
- [x] 4.9 Registro em trilha de auditoria imutável (`audit_events`) do evento `SALE_CONFIRMED`.
- **Status:** Concluído e Auditado ✅ (PR Reviewer: PASS)

### [x] Slice 5: Clientes e Fiado / Crediário com PIN da Proprietária (customers)
- [x] 5.1 Schemas relacionais Drizzle `customers` e `customer_credit_ledger` com multi-tenancy estrito (`merchant_id`), chaves estrangeiras e integridade referencial.
- [x] 5.2 Restrição de unicidade composta por `(merchant_id, phone)` impedindo cadastro duplicado de cliente por comércio.
- [x] 5.3 Entidades de domínio puras `Customer` e `CreditMovement` com cálculos exatos baseados no Value Object `Money`.
- [x] 5.4 `CreateCustomerUseCase`: cadastro de clientes com telefone obrigatório, limite inicial de crédito e emissão do evento de auditoria `CUSTOMER_CREATED`.
- [x] 5.5 `GetCustomerBalanceUseCase`: consulta de saldo devedor consolidado (`SUM(DEBIT) - SUM(CREDIT)`) e crédito disponível em tempo real.
- [x] 5.6 `AuthorizeCreditSaleUseCase`: verificação de limite disponível para compras a prazo; exigência e validação de PIN da proprietária (`ROLE_OWNER` via `bcrypt`) em caso de excesso de limite, com auditoria compulsória `CREDIT_SALE_LIMIT_AUTHORIZED`.
- [x] 5.7 `SettleCustomerDebtUseCase`: quitação total ou parcial de dívida exigindo sessão de caixa aberta (`OPEN`), registrando entrada de dinheiro na gaveta (`DEBT_PAYMENT`), amortização no extrato e auditoria `CUSTOMER_DEBT_SETTLED`.
- [x] 5.8 Tratamento de invariantes de domínio e erros de negócio explícitos (`CustomerNotFoundError`, `CustomerAlreadyExistsError`, `CustomerInactiveError`, `CreditLimitExceededError`, `InvalidOwnerPinError`, `DebtSettlementExceedsBalanceError`, `NoOpenCashSessionError`).
- **Status:** Concluído e Auditado ✅ (109 testes aprovados, Veredito PR-Reviewer PASS) — Commit 33d423c

### [ ] Slice 6: Interface de PDV e Modo Offline (Vercel Deploy)
- [ ] Migração das telas React (`App.tsx`, `Management.tsx`) para o App Router do Next.js.
- [ ] Fila offline para vendas simples em dinheiro.
- [ ] Deploy e homologação na Vercel conectado ao banco Neon.
- **Status:** Planejado ⏳
