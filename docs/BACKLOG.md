# Backlog de Entregas — Meu Comércio

Este documento rastreia formalmente as fatias verticais de entrega, critérios de aceitação e status de cada etapa de acordo com o protocolo dos 6 agentes.

---

## Fatias Verticais (Slices)

### [x] Slice 0: Fundação & Monólito Modular
- [x] Inicialização do Next.js 16 + TypeScript + Turbopack.
- [x] Estrutura de diretórios desacoplada em `src/modules/*` com `domain`, `application` e `infrastructure`.
- [x] Value Object `Money` baseado em centavos inteiros e precisão decimal comercial *half-up*.
- [x] Suíte de testes unitários com Vitest rodando em modo nativo.
- [x] Registro da governança em `DECISIONS.md`, `CLAUDE.md` e `PRODUCT.md`.
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

### [ ] Slice 3: Catálogo de Produtos e Controle de Estoque
- [ ] Schemas `products`, `inventory_items` e `inventory_movements`.
- [ ] Leitura de código de barras e busca rápida por nome.
- [ ] Prevenção estrita de estoque negativo.
- [ ] Reposição de estoque com autorização e registro de auditoria.
- **Status:** Em Planejamento ⏳

### [ ] Slice 4: Vendas, Checkout e Split Payments
- [ ] Schemas `sales`, `sale_items` e `payments`.
- [ ] Cálculo de totais e troco no servidor.
- [ ] Dedução atômica de estoque na conclusão da venda.
- [ ] Idempotência de vendas (`Idempotency-Key`).
- [ ] Vínculo automático da entrada de dinheiro com o caixa aberto.
- **Status:** Planejado ⏳

### [ ] Slice 5: Clientes e Limite de Fiado
- [ ] Cadastro de clientes (nome e telefone).
- [ ] Limite de crédito e liberação de excesso via PIN da proprietária.
- [ ] Quitação de fiado com entrada no caixa.
- **Status:** Planejado ⏳

### [ ] Slice 6: Interface de PDV e Modo Offline (Vercel Deploy)
- [ ] Migração das telas React (`App.tsx`, `Management.tsx`) para o App Router do Next.js.
- [ ] Fila offline para vendas simples em dinheiro.
- [ ] Deploy e homologação na Vercel conectado ao banco Neon.
- **Status:** Planejado ⏳
