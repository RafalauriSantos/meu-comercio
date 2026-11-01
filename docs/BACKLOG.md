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

### [x] Slice 6: Interface de PDV, Painel de Gestão e Modo Offline
- [x] 6.1 Adaptação de Estilos Visuais (`src/frontend/styles/`): migração de `pdv.css` e `management.css` preservando tema de alto contraste, responsividade e layout em grid do terminal PDV.
- [x] 6.2 Cliente HTTP Tipado (`src/frontend/lib/api-client.ts`): cliente `fetch` com `credentials: 'include'` conectado aos endpoints dos Slices 1 a 5 (`/api/auth/*`, `/api/cash/*`, `/api/products/*`, `/api/sales/*`, `/api/customers/*`).
- [x] 6.3 Mecanismo de Contingência Offline (`src/frontend/lib/offline-sync.ts`): adaptação do `offlineStore.ts` com fila de vendas em dinheiro no `localStorage`, cache de produtos, chaves de idempotência e sincronização automática ao restabelecer conexão.
- [x] 6.4 Fluxo de Acesso e Abertura de Caixa (`src/app/login/page.tsx`): verificação de setup inicial (`/api/setup/status` e `/api/setup/owner`), autenticação de operador/dona (`/api/auth/login`) e abertura de caixa com saldo inicial (`/api/cash/open`).
- [x] 6.5 Terminal de PDV e Checkout com Atalhos (`src/app/page.tsx`): leitura de código de barras ou busca por nome, controle do carrinho sem permitir estoque negativo, atalhos de teclado (`Enter`, `Esc`, `F2`–`F5`, `F7`, `F10`, `Ctrl+L`), split checkout e venda a fiado com PIN da proprietária.
- [x] 6.6 Painel de Gestão (`src/app/gestao/page.tsx`): catálogo de produtos e reposição de estoque (`/api/inventory/restock`), clientes e extrato de fiado com quitação em caixa aberto (`/api/customers/[id]/settle`), e fechamento cego de caixa com justificativa de divergência (`/api/cash/close`).
- [x] 6.7 Suíte de Testes Unitários de Frontend e Fila Offline: cobertura de testes para lógica de sincronização offline, cálculos do carrinho, regras de atalhos e split payment.
- [x] 6.8 Gestão e Cadastro de Operadores de Caixa: caso de uso `CreateOperatorUseCase`, endpoint `POST /api/users/operators` e aba dedicada em `/gestao` permitindo à proprietária criar acessos para funcionários do balcão (PR #5).
- [x] 6.9 Paralelização e Otimização de Carregamento: consultas iniciais otimizadas via `Promise.all` em `/`, `/gestao` e `/login` reduzindo o tempo de carregamento perceptível.
- [x] 6.10 Pipeline de CI/CD com Deploy Final na Vercel: automação com GitHub Actions executando o deploy em produção estritamente como 5ª etapa após Lint, Typecheck, 167 Testes e Build passarem verdes na `main` (PR #6 e PR #7).
- [x] 6.11 Auto-Cadastro SaaS Multi-Tenant com Isolamento Rigoroso: caso de uso `RegisterMerchantUseCase`, rota `POST /api/auth/register`, testes de isolamento e interface de login com alternador de abas (`Entrar` e `Cadastrar Nova Loja`) (PR #8).
- **Status:** Concluído e Auditado ✅ (167 testes aprovados, Veredito PR-Reviewer PASS)

---

## 🔮 Roadmap de Evolução (Planejado a partir dos Projetos de Referência)

### [ ] Slice 7: PWA Instalável & Perímetro de Borda (Modelado a partir de `barbearia.js`)
- [ ] 7.1 Manifesto Web (`manifest.json`) e ícones de aplicação para instalação do PDV como aplicativo desktop/tablet em modo tela cheia (*standalone*).
- [ ] 7.2 Service Worker para cache avançado de assets e casca da aplicação (App Shell) acelerando abertura instantânea.
- [ ] 7.3 Proteção perimetral no Login e Verificação de PIN contra ataques de força bruta com Cloudflare Turnstile.
- [ ] 7.4 Ambiente containerizado `docker-compose.yml` para desenvolvimento e testes locais com um único comando (`npm run docker:up`).
- [ ] 7.5 Scanner de vulnerabilidades CodeQL (SAST) e Gitleaks integrados no GitHub Actions.

### [ ] Slice 8: Integridade Criptográfica com Hash Chaining (Modelado a partir de `casa-de-leiloes`)
- [ ] 8.1 Encadeamento criptográfico SHA-256 no ledger de fiado (`customer_credit_ledger`) gravando `previous_hash` e `hash` a cada lançamento de compra ou quitação.
- [ ] 8.2 Hash chaining na trilha imutável de auditoria (`audit_events`) fornecendo prova matemática contra adulteração ou exclusão de registros de fechamento de caixa e sangrias.
- [ ] 8.3 Trava de concorrência pessimista (`SELECT FOR UPDATE`) na dedução de estoque para impedir venda simultânea da mesma unidade por múltiplos terminais.

### [ ] Slice 9: Bot de Observabilidade e Alertas no Telegram para a Proprietária (Modelado a partir de `argus`)
- [ ] 9.1 Webhook de saída no fechamento de caixa emitindo o resumo consolidado do turno (dinheiro, PIX, cartões, fiado e divergências) diretamente no Telegram da dona.
- [ ] 9.2 Alertas imediatos de estoque mínimo para produtos críticos em tempo real.
- [ ] 9.3 Comandos interativos no Telegram (`/saldo`, `/caixa`, `/vendas_hoje`) permitindo à dona consultar o faturamento de onde estiver sem abrir o navegador.

### [ ] Slice 10: Integração de Maquininha de Cartão Smart POS / TEF (Stone Connect / POS Cloud)
- [ ] 10.1 Adaptador de Gateway de Pagamento para API Cloud da maquininha da loja (ex: Stone Connect / PagBank).
- [ ] 10.2 Disparo automático do valor da venda para o visor da maquininha no balcão sem digitação manual pelo operador.
- [ ] 10.3 Confirmação síncrona via Webhook/Polling com gravação de NSU/TID e baixa automática do carrinho.
- [ ] 10.4 Alternador transparente para modo manual quando a maquininha perder sinal de internet.

### [x] Slice 11: Operações de Balcão do Mundo Real & Gestão Financeira Essencial
- [x] 11.1 **Sangria (WITHDRAWAL) e Suprimento (DEPOSIT) de Caixa**:
  - [x] 11.1.1 Suporte a tipos `'WITHDRAWAL'`, `'DEPOSIT'` e `'CASH_CANCEL'` em `CashMovementType` e `cash_movements`.
  - [x] 11.1.2 Fórmula exata de conferência cega: `Dinheiro Esperado = Fundo Inicial + Vendas Dinheiro (SALE_RECEIPT) + Quitações Fiado (DEBT_PAYMENT) + Suprimentos (DEPOSIT) - Sangrias (WITHDRAWAL) - Estornos (CASH_CANCEL)`.
  - [x] 11.1.3 `RecordCashWithdrawalUseCase`: validação de caixa aberto, valor não-negativo, saldo em dinheiro suficiente, motivo textual obrigatório (mín. 3 caracteres) e auditoria compulsória `CASH_WITHDRAWAL_RECORDED`.
  - [x] 11.1.4 `RecordCashDepositUseCase`: validação de caixa aberto, valor positivo, motivo textual obrigatório (mín. 3 caracteres) e auditoria `CASH_DEPOSIT_RECORDED`.
  - [x] 11.1.5 Endpoints HTTP e rotas de API `/api/cash/withdrawal` e `/api/cash/deposit`.
- [x] 11.2 **Cancelamento e Estorno Atômico de Venda (CancelSaleUseCase)**:
  - [x] 11.2.1 Autorização mandatória via PIN da proprietária com reaproveitamento do `OwnerPinVerifier`.
  - [x] 11.2.2 Reversão atômica: marca venda como `'CANCELLED'` e impede re-cancelamento.
  - [x] 11.2.3 Retorno dos itens ao estoque físico com movimentação de inventário do tipo `'RETURN'`.
  - [x] 11.2.4 Estorno de dinheiro na gaveta via movimentação `'CASH_CANCEL'` no caixa ativo (se houve pagamento em dinheiro e com validação de saldo).
  - [x] 11.2.5 Amortização automática de fiado no extrato do cliente com movimento compensatório `'CREDIT'` (se a venda teve lançamento em fiado).
  - [x] 11.2.6 Trilha de auditoria imutável compulsória do evento `'SALE_CANCELLED'`.
  - [x] 11.2.7 Rota de API `POST /api/sales/[id]/cancel`.
- [x] 11.3 **Métricas de Fiado na Rua (GetCreditMetricsUseCase)**:
  - [x] 11.3.1 Cálculo de fiado em aberto em toda a loja (`totalOutstandingCredit`: soma dos saldos devedores de todos os clientes do comércio).
  - [x] 11.3.2 Cálculo de total quitado historicamente (`totalSettledCredit`: soma de todos os pagamentos/créditos amortizados).
  - [x] 11.3.3 Contagem de devedores ativos (`activeDebtorsCount`).
  - [x] 11.3.4 Rota de API `GET /api/customers/metrics`.
- [x] 11.4 **Estrutura de Impressão Térmica (58mm e 80mm)**:
  - [x] 11.4.1 Modelagem tipada para cupom não-fiscal de venda com cabeçalho, itens, totais, pagamentos, troco e rodapé.
  - [x] 11.4.2 Modelagem tipada para canhoto de fiado (nota promissória de caderneta) com histórico do débito e declaração de confissão de dívida para assinatura física.
  - [x] 11.4.3 Folha de estilos `@media print` otimizada para bobinas de 58mm (32 colunas) e 80mm (48 colunas) sem quebra indevida de página.
- **Auditoria PR-Reviewer:** Veredito formal **PASS** (Zero apontamentos, 231 testes aprovados).
- **Status:** Concluído e Auditado ✅
- [ ] 11.5 **Importação de Produtos em Lote (Excel/CSV)** (Próxima etapa).
- [ ] 11.6 **Recuperação de Acesso e Redefinição de PIN da Proprietária** (Próxima etapa).

### [x] Slice 12: Endurecimento Integral de Segurança (Defense-in-Depth)
- [x] 12.1 **Cabeçalhos de Segurança HTTP OWASP**: Configuração em `next.config.ts` com CSP estrito, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` e HSTS.
- [x] 12.2 **Rate Limiting Granular por IP**: Middleware de limitação de requisições com 5 req/min para autenticação (`/api/auth/*`), 20 req/min para checkout/venda (`POST /api/sales`), 30 req/min para caixa/fiado (`/api/cash/*`, `/api/customers/*`) e 60 req/min para catálogo (`/api/products/*`).
- [x] 12.3 **Guardião de Origem Anti-CSRF**: Validação de cabeçalhos `Origin` e `Host` em todas as mutações (`POST`, `PUT`, `DELETE`).
- [x] 12.4 **Honeypot Anti-Bot em Formulários**: Campo invisível para captura passiva de robôs de submissão automática em `/login`.
- [x] 12.5 **Sanitização de Payloads e Limite de 1 MB**: Proteção estrita contra poluição de protótipo (`__proto__`, `constructor`) via Zod `strip`.




