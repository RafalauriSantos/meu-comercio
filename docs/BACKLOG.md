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
- [x] 4.5 Verificação de estoque disponível e dedução atômica por produto vendido com lançamento de movimentação `'SALE'`. *PR #30: dedução com `FOR UPDATE` em ordem fixa, na mesma transação da venda (ADR-008). Com o controle de estoque desligado (ADR-015), a venda não confere nem baixa.*
- [x] 4.6 Suporte a pagamentos múltiplos/divididos (Split Payments) em Dinheiro (`CASH`), PIX (`PIX`), Débito (`DEBIT_CARD`) e Crédito (`CREDIT_CARD`), garantindo soma exata do valor da venda.
- [x] 4.7 Cálculo exato de troco para pagamentos em dinheiro com validação de valor recebido >= valor pago.
- [x] 4.8 Registro automático de entrada de dinheiro (`SALE_RECEIPT`) no caixa aberto ativo quando houver componente em dinheiro. *Na transação da venda desde o PR #30.*
- [x] 4.9 Registro em trilha de auditoria imutável (`audit_events`) do evento `SALE_CONFIRMED`.
- **Status:** Concluído (PR #30). A dedução e o recibo de caixa estão na transação da venda. O veredito do revisor fica em `docs/reviews/30.md`.

### [ ] Slice 5: Clientes e Fiado / Crediário com PIN da Proprietária (customers)
- [x] 5.1 Schemas relacionais Drizzle `customers` e `customer_credit_ledger` com multi-tenancy estrito (`merchant_id`), chaves estrangeiras e integridade referencial.
- [x] 5.2 Restrição de unicidade composta por `(merchant_id, phone)` impedindo cadastro duplicado de cliente por comércio.
- [x] 5.3 Entidades de domínio puras `Customer` e `CreditMovement` com cálculos exatos baseados no Value Object `Money`.
- [x] 5.4 `CreateCustomerUseCase`: cadastro de clientes com telefone obrigatório, limite inicial de crédito e emissão do evento de auditoria `CUSTOMER_CREATED`.
- [x] 5.5 `GetCustomerBalanceUseCase`: consulta de saldo devedor consolidado (`SUM(DEBIT) - SUM(CREDIT)`) e crédito disponível em tempo real.
- [x] 5.6 a verificação de crédito dentro de `CreateSaleUseCase` (pagamento `TAB`); o caso de uso separado e a rota `POST /api/customers/[id]/authorize-credit` foram removidos: verificação de limite disponível para compras a prazo; exigência e validação de PIN da proprietária (`ROLE_OWNER` via `bcrypt`) em caso de excesso de limite, com auditoria compulsória `CREDIT_SALE_LIMIT_AUTHORIZED`.
- [ ] 5.7 `SettleCustomerDebtUseCase`: quitação total ou parcial de dívida exigindo sessão de caixa aberta (`OPEN`), registrando entrada de dinheiro na gaveta (`DEBT_PAYMENT`), amortização no extrato e auditoria `CUSTOMER_DEBT_SETTLED`. *Reaberto: sem transação nem trava sobre o saldo; ver AC-12.*
- [x] 5.8 Tratamento de invariantes de domínio e erros de negócio explícitos (`CustomerNotFoundError`, `CustomerAlreadyExistsError`, `CustomerInactiveError`, `CreditLimitExceededError`, `InvalidOwnerPinError`, `DebtSettlementExceedsBalanceError`, `NoOpenCashSessionError`).
- **Status:** Reaberto (5.7). Sem artefato de PR Reviewer em `docs/reviews/`. Commit 33d423c.

### [ ] Slice 6: Interface de PDV, Painel de Gestão e Modo Offline
- [x] 6.1 Adaptação de Estilos Visuais (`src/frontend/styles/`): migração de `pdv.css` e `management.css` preservando tema de alto contraste, responsividade e layout em grid do terminal PDV.
- [x] 6.2 Cliente HTTP Tipado (`src/frontend/lib/api-client.ts`): cliente `fetch` com `credentials: 'include'` conectado aos endpoints dos Slices 1 a 5 (`/api/auth/*`, `/api/cash/*`, `/api/products/*`, `/api/sales/*`, `/api/customers/*`).
- [ ] 6.3 Mecanismo de Contingência Offline (`src/frontend/lib/offline-sync.ts`): adaptação do `offlineStore.ts` com fila de vendas em dinheiro no `localStorage`, cache de produtos, chaves de idempotência e sincronização automática ao restabelecer conexão. *Reaberto: a interface gera nova chave a cada envio e o cache de produtos é sobrescrito; ver AC-50 e AC-51.*
- [x] 6.4 Fluxo de Acesso e Abertura de Caixa (`src/app/login/page.tsx`): verificação de setup inicial (`/api/setup/status` e `/api/setup/owner`), autenticação de operador/dona (`/api/auth/login`) e abertura de caixa com saldo inicial (`/api/cash/open`).
- [ ] 6.5 Terminal de PDV e Checkout com Atalhos (`src/app/pdv/page.tsx`): leitura de código de barras ou busca por nome, controle do carrinho sem permitir estoque negativo, atalhos de teclado (`Enter`, `Esc`, `F2`–`F5`, `F7`, `F10`, `Ctrl+L`), split checkout e venda a fiado com PIN da proprietária. *Reaberto: só `Esc`, `F2` e `F4` têm atalho; o carrinho não checa estoque (a venda confere no servidor). **Resolvido:** a busca por nome no PDV (PR #46) e a venda fiado criando a venda (PR #30). Ver AC-11, AC-52, AC-55, AC-59.*
- [x] 6.6 Painel de Gestão (`src/app/gestao/page.tsx`): catálogo de produtos e reposição de estoque (`/api/inventory/restock`), clientes e extrato de fiado com quitação em caixa aberto (`/api/customers/[id]/settle`), e fechamento cego de caixa com justificativa de divergência (`/api/cash/close`).
- [ ] 6.7 Suíte de Testes Unitários de Frontend e Fila Offline: cobertura de testes para lógica de sincronização offline, cálculos do carrinho, regras de atalhos e split payment. *Reaberto: há testes de `src/frontend/lib` apenas; não há testes de atalhos, `page.tsx`, `gestao`, `login` ou `api-client`. Ver AC-56.*
- [x] 6.8 Gestão e Cadastro de Operadores de Caixa: caso de uso `CreateOperatorUseCase`, endpoint `POST /api/users/operators` e aba dedicada em `/gestao` permitindo à proprietária criar acessos para funcionários do balcão (PR #5).
- [x] 6.9 Paralelização e Otimização de Carregamento: consultas iniciais otimizadas via `Promise.all` em `/`, `/gestao` e `/login` reduzindo o tempo de carregamento perceptível.
- [x] 6.10 Pipeline de CI/CD com Deploy Final na Vercel: automação com GitHub Actions executando o deploy em produção estritamente como 5ª etapa após Lint, Typecheck, 167 Testes e Build passarem verdes na `main` (PR #6 e PR #7).
- [x] 6.11 Auto-Cadastro SaaS Multi-Tenant com Isolamento Rigoroso: caso de uso `RegisterMerchantUseCase`, rota `POST /api/auth/register`, testes de isolamento e interface de login com alternador de abas (`Entrar` e `Cadastrar Nova Loja`) (PR #8).
- **Status:** Concluído e Auditado ✅ (167 testes aprovados, Veredito PR-Reviewer PASS)

---

## 🔮 Roadmap de Evolução (Planejado a partir dos Projetos de Referência)

### [ ] Slice 7: PWA Instalável & Perímetro de Borda (Modelado a partir de `barbearia.js`)
- [x] 7.1 Manifesto Web (`manifest.json`) e ícones de aplicação para instalação do PDV como aplicativo desktop/tablet em modo tela cheia (*standalone*). *Feito no PR #49: manifesto, ícones 192/512 e maskable, ícone da Apple e botão "Instalar app" no cabeçalho. Sem service worker, de propósito.*
- [ ] 7.2 Service Worker para cache avançado de assets e casca da aplicação (App Shell) acelerando abertura instantânea. *Decidido não fazer por enquanto (ADR-017): a instalação do app não torna o PDV offline e evita servir tela antiga depois de um deploy.*
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
> Plano detalhado, opções e perguntas para a dona: [`docs/INTEGRATIONS.md`](INTEGRATIONS.md). A escolha do adquirente depende da maquininha que a loja já usa.
- [ ] 10.1 Adaptador de Gateway de Pagamento para API Cloud da maquininha da loja (ex: Stone Connect / PagBank).
- [ ] 10.2 Disparo automático do valor da venda para o visor da maquininha no balcão sem digitação manual pelo operador.
- [ ] 10.3 Confirmação síncrona via Webhook/Polling com gravação de NSU/TID e baixa automática do carrinho.
- [ ] 10.4 Alternador transparente para modo manual quando a maquininha perder sinal de internet.

### [ ] Slice 11: Real-World Counter Operations & Essential Financial Management
- [x] 11.1 **Sangria (WITHDRAWAL) e Suprimento (DEPOSIT) de Caixa**:
  - [x] 11.1.1 Suporte a tipos `'WITHDRAWAL'`, `'DEPOSIT'` e `'CASH_CANCEL'` em `CashMovementType` e `cash_movements`.
  - [x] 11.1.2 Fórmula exata de conferência cega: `Dinheiro Esperado = Fundo Inicial + Vendas Dinheiro (SALE_RECEIPT) + Quitações Fiado (DEBT_PAYMENT) + Suprimentos (DEPOSIT) - Sangrias (WITHDRAWAL) - Estornos (CASH_CANCEL)`.
  - [x] 11.1.3 `RecordCashWithdrawalUseCase`: validação de caixa aberto, valor não-negativo, saldo em dinheiro suficiente, motivo textual obrigatório (mín. 3 caracteres) e auditoria compulsória `CASH_WITHDRAWAL_RECORDED`.
  - [x] 11.1.4 `RecordCashDepositUseCase`: validação de caixa aberto, valor positivo, motivo textual obrigatório (mín. 3 caracteres) e auditoria `CASH_DEPOSIT_RECORDED`.
  - [x] 11.1.5 Endpoints HTTP e rotas de API `/api/cash/withdrawal` e `/api/cash/deposit`.
- [x] 11.2 **Cancelamento e Estorno Atômico de Venda (CancelSaleUseCase)**:
  - [x] 11.2.1 Autorização mandatória via PIN da proprietária com reaproveitamento do `OwnerPinVerifier`.
  - [ ] 11.2.2 Reversão atômica: marca venda como `'CANCELLED'` e impede re-cancelamento. *Reaberto: escritas sequenciais sem transação e sem update condicional (AC-10).*
  - [x] 11.2.3 Retorno dos itens ao estoque físico com movimentação de inventário do tipo `'RETURN'`.
  - [x] 11.2.4 Estorno de dinheiro na gaveta via movimentação `'CASH_CANCEL'` no caixa ativo (se houve pagamento em dinheiro e com validação de saldo).
  - [ ] 11.2.5 Amortização automática de fiado no extrato do cliente com movimento compensatório `'CREDIT'` (se a venda teve lançamento em fiado). *Reaberto: só roda com `externalReference`, que o PDV nunca envia. A venda fiado do PDV passa a criar venda no PR #30 (AC-11).*
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
  - [ ] 11.4.3 Folha de estilos `@media print` otimizada para bobinas de 58mm (32 colunas) e 80mm (48 colunas) sem quebra indevida de página. *Reaberto: há `@media print`, mas nenhuma regra de 80mm (AC-62).*
- **PR-Reviewer audit (items 11.1–11.4, historical):** Formal verdict **PASS** (zero findings, 231 tests passing).
- **Status:** Em andamento. A 11.6 (recuperação de acesso e redefinição do PIN da proprietária) segue aberta; as demais estão entregues.
- [x] 11.5 **Importação de Produtos em Lote (Excel/CSV)**: planilha `.xlsx` ou CSV, prévia com erros por linha, tudo ou nada em uma transação, coluna opcional `Unidade` (PRs #41, #42, #44 e #48).
- [ ] 11.6 **Recuperação de Acesso e Redefinição de PIN da Proprietária** (Próxima etapa).
- [x] 11.7 **Produto vendido por peso** (mussarela, mortadela): preço por quilo, peso digitado no PDV, estoque em gramas, linha arredondada ao centavo (PR #48; migração `0002` no PR #47, aplicada em produção em 09/11/2026).
- [x] 11.8 **Busca de produto pelo nome no PDV**, no mesmo campo do código de barras (PR #46).
- [x] 11.9 **Bipador no cadastro de produto**: o código lido preenche o campo, o Enter vai para o nome e um código repetido é avisado na hora. *PR #52.*
- [x] 11.10 **Versão inicial `0.1.0`** (Versionamento Semântico, CHANGELOG, versão visível no rodapé e em `/api/version`). *PR #51; tag e Release v0.1.0.*
- [x] 11.11 **Controle de estoque opcional** (pedido da cliente: vender sem estoque por enquanto, mantendo o controle como opção): interruptor da loja só para a proprietária; desligado, a venda não exige saldo nem baixa estoque, e as telas de estoque somem. Cada venda guarda se tirou do estoque (`sales.stock_tracked`), para o cancelamento só devolver o que saiu. Migração `0003`.
- [x] 11.12 **Cancelar venda finalizada no PDV**: o botão saiu da gestão e foi para a barra de baixo do PDV; a venda é escolhida na lista das vendas de hoje (`GET /api/sales/recent`), sem digitar código, e o PIN da proprietária continua obrigatório (PR #56, ADR-019).

### [ ] Slice 12: Endurecimento Integral de Segurança (Defense-in-Depth)
- [ ] 12.1 **Cabeçalhos de Segurança HTTP OWASP**: Configuração em `next.config.ts` com `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` e HSTS. *Reaberto: não há CSP em nenhum lugar do código (AC-32).*
- [ ] 12.2 **Rate Limiting Granular por IP**: Middleware de limitação de requisições com 5 req/min para autenticação (`/api/auth/*`), 20 req/min para checkout/venda (`POST /api/sales`), 30 req/min para caixa/fiado (`/api/cash/*`, `/api/customers/*`) e 60 req/min para catálogo (`/api/products/*`). *Parcial: confia no primeiro `X-Forwarded-For` (AC-30); store em memória (AC-31); cancelamento com PIN cai no bucket de catálogo (AC-29).*
- [ ] 12.3 **Guardião de Origem Anti-CSRF**: Validação de cabeçalhos `Origin` e `Host` em todas as mutações (`POST`, `PUT`, `DELETE`). *Reaberto: requisição sem `Origin` e sem `Referer` passa (AC-39).*
- [ ] 12.4 **Honeypot Anti-Bot em Formulários**: Campo invisível para captura passiva de robôs de submissão automática em `/login`. *Reaberto: a checagem existe só no navegador; o servidor não valida (AC-34).*
- [ ] 12.5 **Sanitização de Payloads e Limite de 1 MB**: Proteção contra poluição de protótipo via Zod `strip`. *Reaberto: não há limite de 1 MB nem resposta 413 (AC-33).*





### [ ] Slice 13: Landing Page, Login e Cadastro (Design: `docs/superpowers/specs/2026-11-07-landing-page-design.md`)
- [x] 13.1 Landing em `/` (versão provisória, fase 1): topo com a tela real do PDV (dados de demonstração, rotulada "Exemplo"), as quatro perdas, passos, segurança, perguntas e chamada final; estática, sem chamadas externas. Plano: `docs/superpowers/plans/2026-11-07-landing-page.md`.
- [x] 13.2 PDV movido para `/pdv`; login e links apontam para `/pdv`. O link "Criar minha conta grátis" abre `/login?modo=cadastro`.
- [x] 13.3 Metadados, `robots.txt` e `noindex` em `/login`, `/pdv` e `/gestao`.
- [x] 13.4 Redesenho visual de login e cadastro no mesmo mundo visual (desktop primeiro, duas colunas; componentes em `src/frontend/auth/`). A rota `/cadastro` não foi necessária: `/login?modo=cadastro` já abre o cadastro.
- [ ] 13.5 Capturas reais do produto na landing, a partir de uma loja de demonstração criada pela dona (fase 2).
- [ ] 13.6 Termos de uso e política de privacidade (LGPD), canal de ajuda e logo (fase 2). Primeiro item da fase 2: o cadastro já coleta nome, e-mail e senha sem aviso de privacidade.
- [x] 13.7 Rodar todos os `*.integration.test.ts` no job de Postgres do CI. *Feito: o job roda `npm run test:integration` (todos os arquivos, um de cada vez). Antes rodava só `drizzle-owner-pin-attempt-store.integration.test.ts`. Conferido em 09/11/2026: os 7 arquivos (39 testes) passam num Postgres 18.*


---

## Ordem de prioridade (definida em 17/11/2026, aprovada pela dona)
> Critério: primeiro o que protege dinheiro e o uso real da loja, depois o que a dona pediu, depois portfólio e melhorias.

1. **Conferir no ar** o que só a prática mostra (a dona e o leitor de verdade): painéis, operadora logada, bloqueio de fiado, cadastro na venda (22.10d, 22.15, 22.16, 22.19, 23.5).
2. **Quitação de fiado numa transação só** (19.5): hoje grava o caixa e o saldo em passos separados, sem trava. Mexe em dinheiro: aprovação da dona.
3. **Brecha da operadora no cadastro de cliente** (22.9f, servidor feito pela D-29): cadastra com limite zero, só a dona libera. Feito no 22.10c (Novo cliente em painel).
4. **Monitor de site no ar e passo a passo de reverter** (21.1, 21.2).
5. **Extrato do cliente** (22.20): API de leitura e tela.
6. **Desativar produto e cliente** (22.17, 22.18).
7. **Venda offline parada quando o preço muda** (23.4).
8. **README em inglês**, conferido no código, depois do extrato; tirar da landing e do README qualquer promessa que não exista (22.21).
9. **Saldos de fiado em lote** (17.1, 19.4): o backlog diz que a Gestão com mais de uns 30 clientes dá 429; reproduzir antes.
10. **Auditar os itens antigos (slices 5 a 13)**, vários marcados como não feitos mas existentes no código (22.22), e depois os itens técnicos (testes de tela, acessibilidade dos modais, tela de erro por rota, source maps do Sentry, regras de arquitetura no CI).

## ⭐ Próximos passos (pedidos pela dona do comércio)

### [x] Slice 14: Relatórios de vendas
*Entregue na aba **Relatórios** da gestão (só a proprietária), em `/api/reports/sales`.* A dona queria saber **quanto vendeu no dia, na semana e no mês**. Antes o app mostrava o fechamento do caixa e o fiado em aberto, mas não tem um relatório de vendas por período.

- [x] 14.1 **Resumo do período** com seletor: Hoje, Ontem, Esta semana, Este mês e Período personalizado. Mostra o **total vendido**, o **número de vendas**, o **ticket médio** e a comparação com o período anterior equivalente (por exemplo, esta semana contra a semana passada, em % e em reais).
- [x] 14.2 **Por forma de pagamento**: dinheiro, Pix, débito, crédito e fiado, com valor e percentual. O troco não conta como venda.
- [x] 14.3 **Por dia** dentro do período (tabela e gráfico simples), destacando o melhor e o pior dia.
- [x] 14.4 **Produtos mais vendidos** (10 primeiros), por quantidade e por valor. Produto vendido por peso aparece em kg.
- [x] 14.5 **Por operador**: quanto cada pessoa do caixa vendeu.
- [x] 14.6 **Cancelamentos e fiado**: vendas canceladas listadas à parte e **fora** do total; fiado vendido e fiado recebido (quitações) no período.
- [x] 14.7 **Exportar** o relatório em CSV (abre no Excel).
- [x] 14.8 **Acesso só da proprietária** (`ROLE_OWNER`): o operador de caixa não vê.

**Regras e cuidados**
- **Fuso horário:** o dia vai de 00:00 a 23:59 no horário de Brasília (`America/Sao_Paulo`), não em UTC. Uma venda às 22h não pode cair no dia seguinte. Teste com vendas perto da meia-noite.
- **Os números precisam bater com o fechamento do caixa** do mesmo dia: o dinheiro do relatório é o dinheiro que o caixa conferiu.
- Só vendas confirmadas entram; as canceladas não.
- **Sem mudança de banco prevista**: são somas sobre `sales`, `payments` e `sale_items`. Se for preciso um índice (por exemplo, loja e data da venda), a migração vai em PR própria, com a aprovação da dona.
- É **dinheiro** (cálculo e exibição de valores): pelo fluxo do projeto, a PR pede a aprovação da dona.
- Testes: períodos (dia, semana de segunda a domingo, mês), fuso, cancelamento, fiado, venda por peso, loja sem vendas e isolamento entre lojas.

**Depois dos relatórios:** o resumo diário no Telegram da dona (Slice 9) reaproveita as mesmas contas.

### [ ] Slice 15: Notas fiscais (NFC-e)
> Plano, opções de fornecedor, requisitos fiscais e perguntas para o contador: [`docs/INTEGRATIONS.md`](INTEGRATIONS.md).

- [ ] 15.0 **Decisão com o contador:** a loja é obrigada a emitir NFC-e? Qual o regime tributário e o estado? Qual emissor?
- [ ] 15.1 **Cadastro fiscal do produto** (NCM, CFOP, CEST, origem, situação tributária e alíquotas), inclusive na importação em lote. Migração em PR própria.
- [ ] 15.2 **Porta `FiscalDocumentIssuer`** e adaptador do emissor escolhido, com credenciais por loja guardadas cifradas.
- [ ] 15.3 **Emissão em segundo plano** depois da venda, com nova tentativa e estados `PENDENTE`, `AUTORIZADA`, `REJEITADA`, `CONTINGÊNCIA` e `CANCELADA`. A emissão nunca trava o caixa.
- [ ] 15.4 **Homologação:** emitir no ambiente de testes da SEFAZ antes de qualquer nota real.
- [ ] 15.5 **Cupom com QR Code** da NFC-e e marcação "com nota" nos relatórios.
- [ ] 15.6 **Cancelamento** da nota junto com o cancelamento da venda (dentro do prazo), inutilização de numeração e contingência sem internet.

### [ ] Slice 16: Reorganização do front end (urgente, para manutenção)
> `src/app/pdv/page.tsx` (1.600 linhas) e `src/app/gestao/page.tsx` (1.454) misturam dados, estado, regras de venda e tela. Análise: `.dev-team/architecture-frontend.md` (local). Escrever a spec desta fase antes de começar.

- [ ] 16.1 **Rede de segurança:** os testes de tela leem o texto de `page.tsx`. Criar um jeito de testar a tela inteira (pasta da área) antes de mover código.
- [ ] 16.2 **Peças sem dinheiro primeiro:** cabeçalho, avisos e modais simples, movidos sem editar o corpo.
- [ ] 16.3 **Gestão por aba:** um componente e um hook de dados por aba (Produtos, Fiado, Caixa, Operadores).
- [ ] 16.4 **PDV por partes:** hooks de sessão e de carrinho, depois o checkout. O checkout mexe em dinheiro e PIN: PR próprio e aprovação sua.
- Regra: um PR por passo, código movido sem reescrever, `git diff -w` conferido e as mesmas requisições antes e depois.
- Fora de escopo por enquanto: CSS, `api-client.ts`, Login, rota por aba, e unificar duplicações de duas cópias.

### [ ] Slice 17: Carga enxuta das telas
> Região `gru1` já feita (PR #67): a primeira visita à Gestão caiu de 3,0 s para 0,6 s. Os itens abaixo só valem se a medição com muitos clientes ainda mostrar lentidão.

- [ ] 17.1 **Saldos de fiado em lote** (uma consulta em vez de uma por cliente). Mexe em dinheiro: aprovação sua. Também evita o limite de 30 requisições por minuto.
- [ ] 17.2 **Gestão carrega só a aba aberta**; o resto ao clicar.
- [ ] 17.3 **Produtos em uma consulta** (hoje `/api/products` faz uma consulta de estoque por produto).
- [ ] 17.4 **PDV usável assim que sessão e caixa chegarem**, sem esperar clientes e configurações.

### [ ] Slice 18: Testes de tela por comportamento
> Cerca de 200 dos ~730 testes leem o texto do código (`readFileSync`, `readScreenSource`) em vez de montar a tela. Eles conferem que certo texto existe, não que a tela funciona, e quebram quando o código é movido. São a rede de segurança da reorganização (Slice 16), então ficam até ela terminar.

- [ ] 18.1 Decidir e adicionar a ferramenta de teste de tela (jsdom e Testing Library). É dependência nova: só com aprovação do dono do repositório.
- [ ] 18.2 Testar o comportamento do PDV (carrinho, pagamento, ações bloqueadas até a carga) e da Gestão (abas, avisos, "Tentar de novo") com a tela montada.
- [ ] 18.3 Trocar os testes de texto pelos de comportamento aos poucos e remover os que ficarem redundantes. Mostrar a lista antes de apagar.

### [ ] Slice 19: Preparar para crescer (problemas das auditorias, em ordem de prioridade)
> Vem das auditorias de back end, front end e escala (leitura do código; nada foi executado). Etiquetas: **[fato]** visto no código, **[reproduzir]** reproduzir com teste antes de corrigir, **[hipótese]** conta ainda não medida. **[$]** dinheiro, **[P]** permissão ou PIN, **[A]** aprovação do dono do repositório por PR. Itens 19.1 a 19.9 doem hoje ou logo; do 19.10 em diante é melhoria.

- [ ] 19.1 **Conferir o ambiente (só olhar):** plano da Vercel e do Neon, uso do pooler, backup com recuperação por ponto no tempo, versão do Postgres e se o staging tem banco próprio.
- [ ] 19.2 **Monitoramento e alertas:** rastreio de erros (sem dado sensível), monitor de site no ar e alerta de 5xx. Hoje só há Vercel Analytics. [fato]
- [ ] 19.3 **Testes de permissão nas rotas, sem mudar código:** nenhuma das 7 rotas "só dona", nem `cash/open` e `cash/close`, testa permissão; só 8 de 29 rotas têm teste. [fato]
- [ ] 19.4 **Saldos de fiado em lote e produtos em uma consulta** (= 17.1 e 17.3). A Gestão com mais de ~30 clientes dá 429 (30 chamadas/min) e `/api/products` faz até 1 consulta de estoque por produto. [$][A] [fato; o 429 é conta, não observado]
- [ ] 19.5 **Transação nos fluxos de dinheiro,** um PR por fluxo e teste de banco antes: cancelamento de venda, quitação de fiado, fechamento de caixa, sangria e suprimento. Criar venda já faz certo (`commitSale`). Candidata a ADR em `docs/DECISIONS.md`. [$][A] [fato] **Feito só a quitação de fiado:** `commitDebtSettlement` grava ledger, entrada `DEBT_PAYMENT` e auditoria numa transação, com o saldo lido sob `FOR UPDATE` do cliente (ADR-021); faltam fechamento de caixa, sangria e suprimento, e o cancelamento já estava feito.
- [ ] 19.6 **Estoque sob concorrência:** reposição e cancelamento leem, somam e gravam sem travar a linha; uma venda ao mesmo tempo pode se perder. [$][A] [reproduzir]
- [ ] 19.7 **PIN de cancelamento:** o usuário padrão `'owner'` é fixo e o verificador está no módulo errado (`customers` lendo `users`). Mover para `users/infrastructure` e tirar o padrão. [P][A] [reproduzir] — parte 1 feita (PR 88): sem nome, o cancelamento aceita o PIN de qualquer dona. Falta a parte 2: mover o verificador de `customers` para `users/infrastructure`.
- [ ] 19.8 **Não devolver SQL em mensagem de erro** (4 rotas) e um tratamento de erro comum para as rotas (`handleRouteError`, `parseJsonBody`); 22 a 26 das 29 rotas repetem o mesmo bloco. [fato; se o Drizzle sempre põe o SQL na mensagem: reproduzir]
- [x] 19.9 **Erro de rede não vira logout:** só 401 vai para `/login`; `apiClient` ganha tempo limite e mensagem clara. Hoje qualquer erro no PDV leva ao login e perde o carrinho. [P][A] [fato] **Feito no PR #112:** classificação central de erros (sessão expirada, rede, tempo esgotado, 429, 5xx, regra de negócio), tempo limite de 15 s nas leituras e 30 s nas demais escritas, e só 401 vai ao login na carga inicial da Gestão e do PDV (erro de rede mostra faixa com "Tentar de novo"). Venda, cancelamento e escritas de dinheiro (abrir e fechar caixa, sangria, suprimento, baixa de fiado) ficam **sem** limite de tempo no cliente, porque abortar só para a espera e a pessoa não saberia se gravou.
- [ ] 19.10 **Limitador de requisições:** hoje é um `Map` por instância (não protege em escala), nunca limpa a memória, confia no primeiro `X-Forwarded-For` e lojas atrás do mesmo IP dividem o balde. Mover para armazenamento compartilhado, limitar por usuário e renomear `middleware.ts` para `proxy.ts`. [fato]
- [ ] 19.11 **LGPD:** texto de privacidade e termos, e um procedimento para pedido de titular (= 13.6). O cadastro coleta e-mail sem aviso. [fato]
- [ ] 19.12 **Duplicações:** 3 pares de classes de erro com o mesmo nome, validação de dinheiro copiada em 8 arquivos, `requireOwnerSession` no lugar de 8 checagens, `aggregateType` da auditoria com variações. [P][A nos de permissão] [fato]
- [ ] 19.13 **Joins de relatório e de vendas recentes com `merchant_id`,** conferindo com `EXPLAIN` numa branch do Neon. Sem migração. [hipótese]
- [ ] 19.14 **`getExpectedCash` somando no banco,** e `max` e `idleTimeout` no Pool. Sessão de caixa aberta por semanas deixa a venda lenta. [$] [hipótese]
- [ ] 19.15 **Financeiro apagado fisicamente:** salvar uma venda apaga e recria `sale_items` e `payments`, contra a regra do projeto. [$][A] [fato]
- [ ] 19.16 **Painéis pesados sob demanda** (`next/dynamic`: relatórios, importação) e CSP em modo Report-Only. [fato]

**Quando chegar em X (não fazer antes):** pooler do Neon com ~200 lojas ou primeiro erro de conexão; teste de carga com ~500 lojas; chave de idempotência obrigatória no PDV com 500 a 1 mil lojas; política de retenção de `audit_events` com o banco acima de 20 a 50 GB; usuário por loja ou login por e-mail com ~1 mil lojas ou "usuário já existe" acima de 2% (hoje `username` é único no mundo todo; pede ADR e migração); réplica de leitura e resumo diário com relatório anual lento; partição de tabelas com ~10 mil lojas.

**Não fazer antes da hora:** microserviços, sharding, fila para a venda, cache de dinheiro, estoque, saldo ou sessão (nunca), Row Level Security, Redis ou CDN de API antes de medir, trocar Neon, Drizzle ou Vercel por precaução, e planejar para 1 milhão de lojas.

### [ ] Slice 20: Fundações do front end (para o front crescer sem apodrecer)
> Decisão de arquitetura no ADR-020 (`docs/DECISIONS.md`). Este slice torna essa arquitetura imposta, medida e testada, além de organizada. Vem junto com o Slice 16 (reorganização), o 18 (testes por comportamento) e o 19 (problemas das auditorias); itens que se repetem apontam para eles. Etiquetas: **[$]** dinheiro, **[P]** permissão ou PIN, **[A]** aprovação do dono do repositório por PR.

- [ ] 20.1 **Regras de arquitetura impostas no CI:** limite de linhas por arquivo da tela (meta ~400) e fronteiras de importação do ADR-020 (`ui` e `lib` não importam de funcionalidade; uma funcionalidade não importa de outra). Hoje só são combinadas.
- [ ] 20.2 **Camada de dados do front decidida:** tempo limite nas chamadas e mensagem clara de erro; erro de rede sem logout, só 401 vai para `/login` (= 19.9) [P][A]; critério de quando entra cache ou uma biblioteca de dados (3 ou mais telas lendo o mesmo dado). ADR próprio. **Parte feita no PR #112:** tempo limite e erro de rede sem logout. Falta decidir o critério de cache ou biblioteca de dados e o ADR.
- [ ] 20.3 **Testes de comportamento no lugar dos que leem texto do código** (= Slice 18).
- [ ] 20.4 **Orçamento de desempenho:** tamanho máximo do JS por tela (hoje ~204 KB comprimido) e uma medição repetível do tempo de carga, com o resultado registrado a cada PR de carga. Painéis pesados sob demanda (`next/dynamic`, = 19.16).
- [ ] 20.5 **Tratamento de erro padrão:** uma tela de erro por rota (`error.tsx`) para um erro não derrubar a página inteira.
- [ ] 20.6 **Acessibilidade dos modais:** `role="dialog"`, `aria-modal`, foco preso dentro e devolvido ao fechar, e Esc. Hoje quase nenhum modal tem.
- [ ] 20.7 **Contratos de tipos entre o front e o back end:** hoje `salePrice` é `number` no tipo do front e a API devolve texto (`toDecimal()`); tipos escritos à mão podem divergir. Conferir quanto já divergem e escolher uma fonte única. Dinheiro como `number` no cliente: conferir `pdv/page.tsx` (`Number(...) * 100`) em PR próprio. [$][A]
- [ ] 20.8 **Monitoramento de erros do front em produção** (= 19.2), sem dado sensível.

### [ ] Slice 21: Operação segura em produção (saber que está no ar e voltar rápido)
> Hoje o deploy termina verde, mas ninguém confere se o site funciona em produção, e não há alerta se ele cair. Ordem de prioridade: monitoramento, reversão, verificação depois do deploy. O lançamento gradual (Rolling Releases) fica de fora por depender de plano pago. O que o plano Hobby da Vercel inclui **não foi verificado**: confirmar no painel antes de contar com cada recurso. Etiqueta: **[A]** aprovação do dono do repositório (dependência nova).

- [ ] 21.1 **Monitor de disponibilidade e rastreio de erros** (= 19.2): alerta no celular ou e-mail se o site cair ou os erros subirem, sem dado sensível nos logs. Escolher a ferramenta, de preferência com plano gratuito. [A]
  - Andamento: erros do servidor no Sentry feitos e confirmados em produção (PR 84; rota temporária nos PRs 85 e 86, já removida; decisão no ADR-022). Falta o monitor de disponibilidade (UptimeRobot, `/api/version` e `/login`, 5 min, timeout 10 s), que o dono cria.
- [ ] 21.2 **Como reverter rápido:** escrever um passo a passo curto em `docs/` de como voltar a versão anterior na Vercel (painel e comando), e testar uma vez com a loja fora do horário.
- [ ] 21.3 **Verificação depois do deploy** (smoke test no `ci.yml`, depois do passo de deploy): conferir que `/login` responde, que `/api/version` responde e que a versão publicada é a que acabou de ir. Só lê páginas públicas, sem tocar em dados nem dinheiro. Se falhar, o CI fica vermelho e avisa; reverter sozinho fica para depois.
- [ ] 21.4 **Sentry: source maps e captura de 500 nas rotas**: enviar os source maps para o stack trace sair legível; capturar explicitamente os 500 tratados em `catch` (um helper único). Rotas de dinheiro e login pedem aprovação do dono.
- [ ] 21.5 **Higiene de testes e CI:** (a) [x] os testes de integração passam a ter limite de 30 s, porque um teste do cancelamento de venda estourou os 5 s padrão por milissegundos no CI (PR #105); (b) [ ] fazer o vitest ignorar `.claude/worktrees`, pois cópias antigas de trabalho dentro da pasta do projeto são varridas e fazem o gate local falhar; (c) [ ] testar e mergear o PR #82 do Dependabot (versão do `claude-code-action`), que mexe no próprio robô de review; (d) [ ] o `ci:local` falha com `TEST_DATABASE_URL` definida (arquivos de integração em paralelo na mesma base): passar a variável só ao passo de integração. Atualizações de pacotes do Dependabot já mergeadas: PR #106 (Next 16.4.6, driver do banco, leitura de planilhas).
- [ ] 21.6 **Exceção temporária no `npm audit` (picomatch, GHSA-fc5q-39xc-vjpf):** em 17/11/2026 saiu um aviso de gravidade alta sem versão corrigida (`picomatch` até a 4.0.7, negação de serviço com padrão de arquivo malicioso). Só ferramentas de build e teste usam o pacote (vite, vitest, eslint, carregador de build do Sentry); nenhuma rota no ar o carrega e nenhum dado de usuário vira padrão. O gate passou a ser `scripts/audit-gate.mjs`, igual ao `--audit-level=high`, menos esse aviso, e a exceção **vence em 17/12/2026** (depois disso volta a barrar). **Remover a exceção** quando sair um `picomatch` corrigido e os pacotes que o usam forem atualizados.

### [ ] Slice 22: Catálogo, clientes e cadastros (pedidos da dona, uso real da loja)
> Surgiu do uso: mais de 100 produtos cadastrados, preço digitado com vírgula à mão, bipar o produto no cadastro. O controle de estoque opcional já existe (11.11): cada loja liga ou desliga. Spec e análise de arquitetura da lista paginada: `.dev-team/` (local).

- [x] 22.1 **Máscara de centavos no preço do produto:** digitar `125` mostra `1,25`. Só a digitação; `Money` e API não mudaram (PR #90).
- [x] 22.2 **Bipar abre o cadastro:** na aba Catálogo e Estoque, o bip abre o formulário com o código preenchido e o cursor no Nome; código já cadastrado mostra o aviso (PR #91). Os 50 ms e os 4 caracteres do reconhecimento são valores de partida, sem teste com leitor físico.
- [ ] 22.3 **Lista de produtos paginada** (hoje mostra só 100, sem ordem; GET `/api/products` tem limite fixo): em passos pequenos, sem migração.
  - [x] 22.3a API: ordem por nome e id, `page`, `pageSize` e `hasMore`, estoque na mesma consulta (acaba com a consulta por produto). Compatível: sem `page`, devolve a primeira página de 100. (PR #93).
  - [x] 22.3b Cliente da API e endpoint de resumo (total, "Precisam de reposição", "Valor em estoque", este com `Money`). Os números do topo hoje contam só os 100 carregados. (PR #94).
  - [x] 22.3c Tela: botão "Carregar mais" (50 por vez), busca em todos os produtos, indicadores corretos, produto novo limpa a busca e avisa o nome. Extrair `use-products-list.ts` (ADR-020). (PR #96).
  - [ ] 22.3d (fase 2, se medir lento) Filtros "Estoque baixo" e "Sem estoque" no servidor. Hoje valem só para o que está carregado.
- [x] 22.4 **Produto sem código de barras** (feito pela 22.11): hoje o código é obrigatório (tela, validação e banco). Decidido (D-23): código EAN-13 gerado pelo servidor quando o produto é salvo sem código (prefixo 29, 10 dígitos aleatórios e dígito verificador), sem mudar o banco. Substitui o formato `SEM-000123`.
- [ ] 22.5 **Máscara de centavos nos outros campos de dinheiro:** só o preço do produto foi feito. Há outros `type="number"` em `gestao/page.tsx`, `pdv/page.tsx`, `customers-tab.tsx` e `cash-open-screen.tsx` (saldo de abertura). Listar quais são dinheiro antes de mexer.
- [x] 22.6 **Editar produto** (nome, preço e código; a unidade não muda; só a proprietária): API `PATCH /api/products/[id]` com proteção contra edição simultânea, auditoria do antes e depois e regra D-20 (PR #98); `updatedAt` na lista e `updateProduct` no cliente da API (PR #99); `updated_at` estritamente crescente, que corrigiu um teste que falhava por milissegundos (PR #101); tela de edição (PR #100). **Pendente (fase 2):** venda feita offline com o preço antigo fica parada na fila sem aviso quando o preço muda (hoje só há um aviso na tela de edição).
- [x] 22.7 **Novo layout do Catálogo e Estoque** (protótipo aprovado pela dona): faixa de resumo e barra de ferramentas (PR #102), lista densa com o Editar à direita (PR #103), painel lateral de edição (PR #104), lista em cartões no celular (PR #107), Novo Produto no mesmo painel (PR #108) e entrada e saída do painel deslizando pela lateral, com `prefers-reduced-motion` (PR #109). **Pendente:** conferir no celular de verdade (cartões, painel em tela cheia, bip real com o leitor); o botão "+ Novo Produto" não ficou fixo embaixo (`sticky` não gruda dentro do cartão com `overflow:hidden`); os botões de filtro de estoque não ganharam altura mínima no celular.
- [x] 22.8 **Avisos de sucesso em verde** na Gestão e no caixa, com `role="status"` e erros mantidos em vermelho (PR #97).
- [ ] 22.9 **Clientes e Fiado: editar e validar o telefone** (pedido da dona; o telefone aceitava número gigante e não havia como editar cliente):
  - [x] 22.9a Regra do telefone (D-21): só dígitos, 10 ou 11, DDD + 8 ou 9; aceita máscara e `+55`; telefone repetido conferido pelos dígitos; limites de tamanho no cadastro (nome 160, telefone 32); erro de banco deixa de vazar para a tela; clientes antigos fora do padrão continuam lidos e usados (PR #113).
  - [x] 22.9b Editar nome e telefone, `PATCH /api/customers/[id]`, só proprietária, com proteção contra edição simultânea e auditoria (D-22, PR #114).
  - [x] 22.9c Editar o limite de fiado (dinheiro; teto de R$ 100.000,00, sem PIN, pode ficar abaixo da dívida; desde a D-22 revisada em 2026-11-18 o teto é R$ 500,00 e aumentar pede o PIN da proprietária, servidor feito), só proprietária (PR #117).
  - [x] 22.9d Cliente da API, máscara de telefone `(11) 99999-8888` e regra de "fora do padrão" no front, mais mover `priceToDigits` para `lib` (ADR-020) (PR #116).
  - [x] 22.9e Tela de edição de clientes (painel lateral com animação, no molde do produto), marca "Telefone fora do padrão" nos antigos e aviso quando o limite fica abaixo da dívida (PR #121; o botão Editar só aparece para a proprietária).
  - [x] 22.9f **Brecha de permissão (parte do servidor feita, D-29):** a operadora hoje cadastra cliente e define o limite de fiado (o cadastro só exige estar logada). Decisão da dona: a operadora continua cadastrando, com **limite zero**, e só a proprietária libera valor. Servidor: o `POST /api/customers` recusa limite maior que zero da operadora (400) e grava zero; a tela fica no 22.10c.
  - [x] 22.9g Janela de milissegundos em que a venda no fiado usa o limite lido antes da trava do cliente (risco baixo; mexe em dinheiro, PR próprio). **Fechado pela 22.16b** (leitura sob a trava).
- [ ] 22.10 **Novo layout de Clientes e Fiado** (protótipo aprovado pela dona; spec em `.dev-team/spec-customers-layout.md`):
  - [x] 22.10a Faixa de resumo, busca, filtros (Todos, Devendo, Acima do limite), lista no computador e cartões no celular, selos de situação e Receber (PR #119).
  - [x] 22.10b Painel lateral de edição do cliente, igual ao de produtos (PR #121).
  - [x] 22.10c Novo cliente no mesmo painel (hoje é formulário na página); a operadora cadastra com limite zero (junto com 22.9f). A tela também precisa do teto de R$ 500,00 (hoje R$ 100.000,00 em `src/frontend/management`) e do campo do PIN da proprietária ao aumentar o limite (cadastro e edição), com o `code: OWNER_PIN_REQUIRED`.
  - [ ] 22.10d Conferir no navegador e no celular (largura de 1280 e 390 px, animação, foco): só foi testado por HTML estático. O ponto de quebra entre linhas e cartões ficou em 600 px (a spec sugeria 768 px).
- [x] 22.11 **Código de barras gerado pelo sistema** (22.4, D-23), em 3 PRs: (1) decisão e gerador puro (PR #123); (2) API: `barcode` opcional no cadastro, geração e nova tentativa em colisão (até 5) (PR #125); (3) tela: campo "Gerado automaticamente" e código mostrado no aviso de sucesso (PR #126). Fora: etiqueta, CSV e filtro. O prefixo 29 evita a faixa 2 das balanças.
- [x] 22.12 **Bipar na tela de vendas:** qualquer bipada põe o produto no carrinho, sem clicar antes no campo de busca. A bipada vale só para a tela aberta (cadastro e venda não podem receber a bipada um do outro) e o código gerado (22.11) tem de ser achado como qualquer outro. Conferir a troca de aba na tela real e com o leitor físico. O leitor passou para `src/frontend/lib` e ouve só com a tela montada; ignora a bipada com qualquer janela aberta.
- [ ] 22.13 **Venda por peso** (ex.: mussarela a R$ 62,00 o kg): propor antes de implementar. Ideia inicial: unidade do produto (unidade ou kg), peso digitado ou vindo da balança no caixa, total calculado com `Money`, estoque em quilos. Mexe em dinheiro e em estoque: spec e arquitetura primeiro.
- [x] 22.14 **Time e robôs em Sonnet, esforço médio:** os 8 agentes especialistas (arquivos em `~/.claude/agents`) e o review do Claude no CI (`--model claude-sonnet-5-5`, PR #122). O review só comenta de novo se o PR for novo: PR que já tem comentário dele e é reaberto fica com o check vermelho; PR que muda o próprio workflow também (o action recusa).
- [ ] 22.15 **Trocar códigos `SEM-` por gerados** (D-24; spec em `.dev-team/spec-replace-sem-codes.md`), em fatias: (1) [x] botão "Gerar código" na edição do produto, só da proprietária: API (`PATCH /api/products/[id]` com `generateBarcode: true`, PR #128) e tela (PR #129); falta conferir o botão no ar; (2) levantamento somente de leitura dos códigos `SEM-` e dos fora do padrão, por loja; (3) migração dos `SEM-` em massa, PR próprio, com backup do Neon e aprovação da dona. Só `SEM-` é trocado em massa; o resto só é listado.

- [ ] 22.20 **Extrato do cliente** (decisão D-28 escrita em `DECISIONS.md`; spec em `.dev-team/spec-customer-statement.md`), em fatias: (1) API de leitura `GET /api/customers/[id]/statement` paginada por cursor (tipo, valor, saldo depois, operador, data), com o teste de que o saldo da linha mais nova é igual ao saldo atual; (2) tela: botão "Extrato" e painel lateral com "Carregar mais", data em horário de Brasília; (3) imprimir, depois. A operadora também vê. Sem migração. O README e a landing só podem prometer o extrato depois da fatia 2.
  - [x] 22.20a API somente leitura: `GET /api/customers/[id]/statement?limit=&cursor=` (qualquer usuária logada), paginada por cursor, com tipo (PURCHASE, PAYMENT, REVERSAL), valor e saldo depois travado em zero; o saldo da linha mais nova é igual ao `currentDebt` de `/balance`. Sem migração. Abre dado financeiro à operadora: espera a dona.
  - [x] 22.20b Tela: botão Extrato na lista de clientes (linha e cartão, todas as usuárias) e painel lateral (ADR-020) com tipo em português, saldo depois de cada linha, data em horário de Brasília e Carregar mais. README e landing ficam para outro PR.
- [ ] 22.21 **README novo em inglês**, no estilo curto do zapgate (frase única, animação SVG do fluxo, "por que usar", telas, como foi feito, rodar local, índice da documentação), com tudo conferido no código. Corrigir já conferido: o cancelamento de venda é transação única (ADR-021); faltam as ADR-020 a 022; os testes são 1.641 (145 arquivos, mais 167 de integração em 20 arquivos). Tirar a promessa de extrato da landing enquanto ele não existir.
- [ ] 22.22 **Auditar o backlog antigo (slices 5 a 13):** vários itens aparecem como não feitos, mas o código tem a função (fila offline, impressão de 58 mm, cabeçalhos de segurança, limite por IP). Conferir um a um no código e marcar.

### [ ] Slice 23: Sessão e erros de rede (pedidos da dona, uso real da loja)
> A sessão caía a cada 30 minutos fixos, mesmo com a dona usando, e a tela ficava parada com "Não autorizado". As regras D-09 e D-16 já diziam "até fechar o caixa, teto de 12 h", e o código não as cumpria.

- [x] 23.1 **Sessão deslizante:** expira após 2 horas sem uso, renova com o uso e tem teto de 12 horas desde o login; token antigo sem `startedAt` vale até o prazo e não é renovado (PR #95, D-09 e D-16). Efeito aceito: mudar permissão ou desativar usuário só vale quando o token vence (até 12 h).
- [x] 23.2 **Sessão expirada manda para o login e volta:** aviso "Sua sessão expirou. Você será levada ao login.", ida ao `/login?voltar=<caminho>` na mesma aba (só caminho interno seguro, sem redirecionamento aberto), volta para a tela de origem; carrinho do PDV guardado no `sessionStorage` e devolvido só para a mesma pessoa e loja em até 12 h; a fila offline para no 401 e sincroniza ao abrir o PDV. A primeira versão (PR #110, "Entrar de novo" em outra aba e "Já entrei") não funcionou na prática e foi substituída (PR #111). Testado no ar: aviso, ida ao login com `voltar`.
- [x] 23.3 **Erro de rede, lentidão e 429 não viram logout** (= 19.9, PR #112).
- [ ] 23.4 **Venda offline parada quando o preço muda** (= fase 2 do 22.6): o servidor recalcula com o preço atual e recusa a venda se o pagamento não bate; a venda fica na fila sem aviso. Corrigir com aviso no caixa e tratamento da recusa por preço.
- [ ] 23.5 **Conferir no ar o que ainda não foi testado:** carrinho voltando depois do login (mesma pessoa) e **não** voltando com outro usuário ou outra loja; erro de rede na Gestão e no PDV (DevTools, aba Rede, "Offline"); lentidão (Slow 3G) mostrando "A conexão está lenta".
- [x] 22.16 **Bloquear o fiado do cliente** (PRs #131, #132 e #133; falta conferir no ar) (D-26; spec em `.dev-team/spec-block-deactivate.md`), em fatias:
  - [x] 22.16a Migração sozinha (PR #131; aplicada em produção em 17/11/2026 pelo `db-migrate`, com o backup `backup-antes-migracao-0004` no Neon; conferida: 2 clientes, nenhum bloqueado): coluna `customers.credit_blocked boolean NOT NULL DEFAULT false`, sem mudança de comportamento; aplicada pelo workflow `db-migrate` com a aprovação da dona, antes da 22.16b.
  - [x] 22.16b API: `PATCH /api/customers/[id]` aceita `creditBlocked`, auditoria `CUSTOMER_UPDATED`, venda no fiado recusada com 409 `CUSTOMER_CREDIT_BLOCKED` dentro da transação, sob a trava (fecha o 22.9g: bloqueio e limite lidos da linha travada). Pré-check antes do PIN e checagem definitiva na transação; a mensagem é "Este cliente está com o fiado bloqueado. A venda só pode ser feita à vista." Mexe na regra do fiado: espera a dona.
  - [x] 22.16c Tela: interruptor "Fiado bloqueado" na edição do cliente (enviado no PATCH só se mudou), selo na lista de clientes e, no caixa, aviso e fiado barrado para cliente bloqueado (a venda à vista segue livre); a recusa 409 `CUSTOMER_CREDIT_BLOCKED` mostra a mensagem do servidor e mantém o carrinho. Sem selo na busca do caixa: o caixa escolhe o cliente numa lista, e o aviso fica nela. Mexe na regra do fiado: espera a dona.
- [ ] 22.17 **Excluir produto** (D-27; spec em `.dev-team/spec-block-deactivate.md`, fatia 2). Na tela a palavra é "Excluir", mas nada é apagado: o produto é desativado e dá para restaurar.
  - [x] 22.17a Servidor: `PATCH /api/products/[id]` aceita `active` (junto ou separado dos outros campos; só a proprietária; auditoria `PRODUCT_UPDATED` com `changes.active`); `GET /api/products?active=false` lista só os excluídos (só a proprietária, 403 para a operadora; o padrão e o resumo seguem só ativos); bipar o código de produto excluído responde 404 `PRODUCT_INACTIVE` com a mensagem 'Produto "<nome>" está desativado.'. Código de barras continua reservado. Muda a resposta da bipada do caixa: espera a dona.
  - [x] 22.17b Telas: "Excluir produto" no fim do painel de edição, com confirmação que mostra o estoque (controle ligado e saldo maior que zero); filtro "Ativos (n)" / "Excluídos (n)" na Gestão e botão "Restaurar" (sem PIN e sem confirmação). Produto não pede PIN. A lista de excluídos traz os 100 primeiros, só é lida quando a dona abre o filtro (o número usa o tamanho da lista, com "+" se houver mais) e a busca dela filtra por nome ou código só nesses 100. Falta conferir no navegador.
  - [ ] 22.17c Em aberto: aviso "Produto … está desativado" ao bipar no caixa e no cadastro, e tirar o produto do cache local ao receber `PRODUCT_INACTIVE`.
- [ ] 22.18 **Excluir cliente** (D-27; spec em `.dev-team/spec-block-deactivate.md`, fatia 3). Na tela a palavra é "Excluir", mas nada é apagado: o cliente é desativado e dá para restaurar. Só com dívida zero.
  - [x] 22.18a Servidor: `PATCH /api/customers/[id]` aceita `active` (só a proprietária; auditoria `CUSTOMER_UPDATED` com `changes.active`); excluir confere a dívida sob a trava da linha do cliente e recusa com 409 `CUSTOMER_HAS_DEBT` e o valor devido; a venda no fiado também confere o cliente ativo sob a trava; a busca do caixa passa a filtrar só ativos; `GET /api/customers?active=false` lista só os excluídos (só a proprietária). Restaurar não muda limite nem bloqueio (D-26). Mexe em permissão e no fiado: espera a dona.
  - [x] 22.18d Servidor: excluir cliente exige o PIN da proprietária (`ownerPin`, mesmo mecanismo do aumento de limite; restaurar e produto não pedem). (PR #144).
  - [x] 22.18b Telas: "Excluir cliente" no fim do painel de edição (só a proprietária); com dívida o botão fica travado e mostra "Este cliente deve R$ X. Receba o valor para poder excluir." (sem saldo carregado: "Aguarde o saldo carregar."; o servidor confere de novo); janela de confirmação (`alertdialog`) com o PIN da proprietária (6 dígitos; o servidor já exige, PR #144); filtro "Excluídos (n)" junto dos chips da aba Clientes, com "Restaurar" direto (sem PIN e sem confirmação). A lista de excluídos só é lida quando a dona abre o filtro (o primeiro carregamento da Gestão não ganha pedido), então o número aparece depois da primeira leitura. Falta conferir no navegador.
  - [ ] 22.18c Em aberto: recusa de telefone repetido dizendo que o cliente está excluído (critério 35 da spec).
- [x] 22.19 **Cadastrar produto na venda** (PRs #135, #134 e #136; falta conferir no ar com o leitor e com a operadora. Com o controle de estoque ligado, o produto novo nasce com estoque zero e a venda é recusada até a proprietária dar entrada no estoque) (D-25; spec em `.dev-team/spec-pdv-register-on-scan.md`): bipar um código desconhecido no caixa abre o painel de Novo Produto com o código preenchido; ao salvar, o produto entra no carrinho. Em fatias:
  - [x] 22.19a Servidor: `POST /api/products` aceita qualquer usuária logada; a operadora só cadastra com preço maior que zero e sem estoque inicial (400 se enviar). Editar e importar seguem só da proprietária. Muda permissão: espera a dona.
  - [x] 22.19b Painel de Novo Produto compartilhado (PR #134) (`src/frontend/ui` e `src/frontend/lib`), só mover, sem reescrever; refatoração pura.
  - [x] 22.19c Ligação no caixa (`src/frontend/pdv`): código 404 abre o painel, salvar põe no carrinho (KG abre a janela de peso). Sem internet mantém o aviso; 409 de código repetido mostra a mensagem do servidor no painel. O painel usa o CSS da Gestão (`management.css`, escopo `.management-page`). Só entra em produção depois da 22.19a; conferir no navegador e com o leitor físico.
