# Registro de Decisões de Arquitetura (ADRs) — Meu Comércio

Este documento registra formalmente as decisões de arquitetura e de produto do projeto **Meu Comércio**, seguindo o formato ADR (Contexto, Decisão e Consequências/Trade-offs).

---

## ADR-001: Monólito Modular Desacoplado (Hexagonal / Ports & Adapters)

- **Data**: 2026-10-31
- **Status**: Aprovado e Implementado
- **Contexto**: O sistema precisa atender pequenos e médios comércios com alta confiabilidade operacional, permitindo evolução rápida sem a sobrecarga operacional e de latência de microsserviços, mas com fronteiras de domínio estritas para evitar acoplamento espaguete.
- **Decisão**: Adotar a arquitetura Monólito Modular baseada em Ports & Adapters (Hexagonal). O código é particionado em módulos por capacidade de negócio (`src/modules/*`), cada um contendo:
  - `domain/`: Entidades, Value Objects e interfaces de saída (Ports). Livre de qualquer dependência externa ou framework.
  - `application/`: Casos de uso e orquestração de regras de negócio, interagindo exclusivamente com o domínio e portas abstratas.
  - `infrastructure/`: Implementação concreta das portas (Drizzle ORM, banco Neon, autenticação, APIs externas).
- **Trade-offs / Consequências**:
  - *Positivo*: Regras de negócio 100% testáveis em memória sem banco de dados; substituição de banco ou provedor externo sem afetar o core; ciclo de desenvolvimento ágil.
  - *Negativo*: Necessidade de mapeamento explícito entre modelos de banco e entidades de domínio; disciplina estrita para não importar infraestrutura dentro da camada de aplicação ou domínio.

---

## ADR-002: Manipulação Monetária Exata via Value Object Money

- **Data**: 2026-10-31
- **Status**: Aprovado e Implementado
- **Contexto**: O padrão IEEE 754 de números de ponto flutuante em JavaScript (`number`) causa erros de arredondamento inaceitáveis no varejo (ex: `0.1 + 0.2 !== 0.3`).
- **Decisão**: É expressamente proibido o uso de `number` de ponto flutuante diretamente para cálculos e persistência de dinheiro. Criou-se o Value Object `Money` baseado em `decimal.js` (com arredondamento comercial *half-up* e 28 dígitos de precisão), armazenando valores monetários como centavos inteiros (`toCents()`) ou decimal exato (`toDecimal()`). No banco PostgreSQL (Neon), os campos utilizam `numeric(19, 4)` ou `numeric(10, 2)`.
- **Trade-offs / Consequências**:
  - *Positivo*: Erro zero em cálculos fiscais, troco, conferência cega de caixa e divisão de pagamentos.
  - *Negativo*: Exige conversão explícita na entrada e saída dos controladores de API.

---

## ADR-003: Multi-tenancy por `merchant_id` com Chave Estrangeira Composta

- **Data**: 2026-10-31
- **Status**: Aprovado e Implementado
- **Contexto**: O Meu Comércio é um SaaS multi-tenant onde múltiplos comerciantes compartilham o mesmo banco de dados PostgreSQL Neon. Nenhum comerciante pode acessar ou interferir em dados de outro.
- **Decisão**: Todas as tabelas de agregação de negócio possuem coluna `merchant_id UUID NOT NULL REFERENCES merchants(id)`. O contexto de execução autenticado extrai obrigatoriamente o `merchant_id` do token de sessão seguro, e todos os repositórios filtram consultas e escritas obrigatoriamente por `merchant_id`. Índices de unicidade (como código de barras, sessão de caixa e idempotência de vendas) são compostos incluindo `merchant_id`.
- **Trade-offs / Consequências**:
  - *Positivo*: Compartilhamento de infraestrutura de baixo custo sem risco de vazamento cruzado quando as portas são respeitadas.
  - *Negativo*: Necessidade de propagar explicitamente o `merchant_id` em todos os casos de uso e consultas SQL.

---

## ADR-004: Sessão Única de Caixa por Comércio e Conferência Cega

- **Data**: 2026-10-31
- **Status**: Aprovado e Implementado
- **Contexto**: O mini mercado opera com turnos de caixa onde divergências entre dinheiro apurado e dinheiro registrado devem ser identificadas e responsabilizadas sem margem para ocultação.
- **Decisão**: 
  1. Apenas uma sessão de caixa pode estar aberta por comércio por vez, garantida no banco de dados via índice único parcial `idx_one_open_cash_session_per_merchant` (`merchant_id, status WHERE status = 'OPEN'`).
  2. O fechamento adota conferência cega: o operador digita o valor contado; o sistema calcula o valor esperado e a diferença em tempo real.
  3. Diferenças exigem justificativa textual obrigatória gravada em auditoria.
  4. O operador que abriu é o único operador autorizado a fechar a sua sessão, mas a proprietária tem poder de fechar qualquer turno aberto.
- **Trade-offs / Consequências**:
  - *Positivo*: Elimina disputas de turno, fechamentos incorretos por terceiros e omissão de divergências financeiras.
  - *Negativo*: Um segundo operador não pode abrir o caixa até que o anterior seja formalmente encerrado.

---

## ADR-005: Imutabilidade Financeira e Trilha de Auditoria Persistente

- **Data**: 2026-10-31
- **Status**: Aprovado e Implementado
- **Contexto**: No varejo, alterações e deleções silenciosas de vendas, movimentações de caixa ou ajustes manuais mascaram fraudes e falhas operacionais.
- **Decisão**: É proibido o uso de `DELETE` físico em tabelas financeiras (`cash_sessions`, `cash_movements`, `sales`, `payments`). Estornos e sangrias são registrados como novas movimentações com efeito inverso. Toda ação sensível (abertura/fechamento de caixa, cancelamento, desconto excepcional, autorização por PIN) gera um registro append-only na tabela `audit_events` com timestamp em UTC, `actor_id`, `merchant_id`, tipo de evento e detalhes em JSON.
- **Trade-offs / Consequências**:
  - *Positivo*: Rastreabilidade jurídica e contábil completa.
  - *Negativo*: Crescimento contínuo da tabela de auditoria, exigindo partições ou retenção a longo prazo no futuro.

---

## ADR-006: Autenticação Segura com Bloqueio Temporário (Lockout)

- **Data**: 2026-10-31
- **Status**: Aprovado e Implementado
- **Contexto**: Terminais de PDV ficam frequentemente expostos no balcão e podem sofrer tentativas repetidas de adivinhação de senhas de operadores ou proprietária.
- **Decisão**: Implementado controle de tentativas falhas no `AuthenticateUserUseCase`. Ao atingir 5 tentativas consecutivas de login incorreto, a conta é bloqueada temporariamente por 15 minutos (`lockedUntil = now + 15 min`). O hash de senhas e PINs utiliza `bcryptjs`. As sessões utilizam tokens assinados criptograficamente com HMAC-SHA256 trafegados em cookies `HttpOnly` com prefixo `__Host-` em produção.
- **Trade-offs / Consequências**:
  - *Positivo*: Proteção efetiva contra ataques de força bruta no balcão e online.
  - *Negativo*: Operadores descuidados podem bloquear a si mesmos por 15 minutos ou precisar que a proprietária redefina a senha.

---

## ADR-007: Vendas no PDV, Split Payments e Idempotência Transacional

- **Data**: 2026-10-31
- **Status**: Aprovado
- **Contexto**: No balcão de um mini mercado, as transações de venda exigem alta integridade, agilidade e resiliência contra falhas de rede. É comum que clientes dividam o pagamento (ex.: parte em dinheiro físico, parte via PIX ou cartão). Além disso, cliques duplos no PDV ou instabilidades na conexão podem reenviar requisições de finalização, gerando o risco de duplicidade de cobranças ou baixas indevidas de estoque. Por fim, a entrada de cédulas e moedas no PDV precisa ser imediatamente computada no saldo esperado da gaveta de dinheiro (turno de caixa ativo).
- **Decisão**:
  1. **Modelagem de Domínio Rica e Exatidão com Money**:
     - O agregado `Sale` é composto por `SaleItem[]` e `Payment[]`.
     - Todos os cálculos (subtotal, desconto, total da venda, valor recebido em dinheiro e troco) são realizados exclusivamente no servidor utilizando o Value Object `Money` (arredondamento comercial *half-up* sem ponto flutuante).
     - Estados ilegais são proibidos no domínio: pagamentos divididos (Split Payments) devem ter a soma exata dos valores alocados igual ao total da venda; pagamentos em dinheiro com valor recebido inferior ao total em dinheiro são rejeitados; parcelamento só é admitido para cartão de crédito.
  2. **Idempotência em Duas Camadas**:
     - O cliente de PDV envia um cabeçalho ou parâmetro `idempotencyKey` (UUID).
     - **Camada de Aplicação**: O `CreateSaleUseCase` consulta o repositório (`saleRepository.findByIdempotencyKey`) antes de processar; caso já exista venda confirmada para o mesmo `merchant_id` e `idempotencyKey`, rejeita a repetição (`DuplicateSaleRequestError`) ou retorna a venda já existente de forma segura.
     - **Camada de Banco (Drizzle ORM / Postgres)**: Criação de índice único parcial `idx_sales_merchant_idempotency` na tabela `sales` (`merchant_id, idempotency_key WHERE idempotency_key IS NOT NULL`), garantindo atomicidade contra condições de corrida concorrentes no nível do banco.
  3. **Vínculo Compulsório com Caixa Aberto**:
     - Nenhuma venda pode ser registrada sem que haja uma sessão de caixa aberta (`status = 'OPEN'`) para o comerciante.
     - Quando houver pagamento com método `CASH`, o caso de uso calcula o valor líquido em dinheiro e emite imediatamente um registro de movimentação de caixa `SALE_RECEIPT` via `cashSessionRepository.addMovement(merchantId, sessionId, 'SALE_RECEIPT', cashAmount, saleId)`, garantindo a conferência cega do caixa.
  4. **Dedução Atômica de Estoque**:
     - Antes de consolidar a venda, o estoque de todos os itens é validado.
     - Se qualquer item possuir saldo menor que o solicitado, a operação é abortada com `InsufficientStockError`.
     - Na consolidação, o estoque é debitado com `inventoryItem.deduct(quantity)` e uma movimentação do tipo `'SALE'` é registrada para cada produto.
  5. **Auditoria Imutável**:
     - Ao concluir a venda, emite-se um evento `SALE_CONFIRMED` na tabela `audit_events` com operador, totais, descontos e métodos de pagamento.
- **Trade-offs / Consequências**:
  - *Positivo*: Erro zero em cálculos financeiros e troco; prevenção integral de vendas duplicadas por timeout ou duplo clique; rastreabilidade completa entre venda, estoque e gaveta de dinheiro.
  - *Negativo*: Requer que o turno de caixa esteja formalmente aberto antes da realização de qualquer venda pelo operador.

---

## ADR-008: Modelo de Fiado / Crediário, Override por PIN da Proprietária e Quitação em Caixa Aberto

- **Data**: 2026-10-31
- **Status**: Aprovado
- **Contexto**: O fiado (crediário próprio) é uma prática comercial vital para fidelização em pequenos mercados de bairro, mas constitui a principal fonte de perdas por inadimplência e vulnerabilidade operacional. No balcão, operadores de caixa comuns não possuem autoridade discricionária para permitir que clientes excedam seus limites pré-definidos de crédito. Exceções só podem ser autorizadas pela proprietária (`ROLE_OWNER`) através de autenticação por PIN seguro. Além disso, quando o cliente comparece para pagar sua conta fiado (total ou parcialmente em dinheiro), essa entrada de recursos deve repercutir imediatamente no saldo esperado da gaveta física de dinheiro (turno de caixa ativo), prevenindo desvios ou esquecimentos de lançamento.
- **Decisão**:
  1. **Ledger Imutável de Crédito (`customer_credit_ledger`)**:
     - Abandona-se a mutação destrutiva de saldo em favor de um ledger financeiro append-only.
     - Lançamentos do tipo `DEBIT` registram compras fiado (aumentam a dívida).
     - Lançamentos do tipo `CREDIT` registram pagamentos e amortizações (diminuem a dívida).
     - O saldo devedor acumulado é calculado rigorosamente via agregação `SUM(DEBIT) - SUM(CREDIT)`.
  2. **Domínio Rico com Value Object `Money`**:
     - Entidade `Customer`: armazena `creditLimit` e métodos puros `calculateAvailableCredit(currentDebt)` e `wouldExceedCreditLimit(currentDebt, saleAmount)`.
     - Invariantes monetárias: limite de crédito nunca negativo; valores de movimentação estritamente maiores que zero; pagamentos superiores à dívida total em aberto são sumariamente rejeitados no domínio (`DebtSettlementExceedsBalanceError`).
  3. **Override por PIN da Proprietária (`CreateSaleUseCase`, pagamento `TAB`)**:
     - Vendas dentro do limite disponível de crédito são autorizadas diretamente pelo operador.
     - Vendas que excedam o limite disponível disparam a exigência de credenciais da dona (`ownerUsername` e `ownerPin`).
     - A validação consulta a autoridade do usuário (`isOwner()`) e compara o PIN fornecido contra o hash `authorization_pin_hash` armazenado no banco via `bcrypt`.
     - Toda autorização de exceção registra evento compulsório na trilha de auditoria (`CREDIT_SALE_LIMIT_AUTHORIZED`) com os valores envolvidos e identificação da autorizadora.
  4. **Quitação de Dívida Vinculada a Caixa Aberto (`SettleCustomerDebtUseCase`)**:
     - É estritamente vedada a quitação de fiado sem uma sessão de caixa aberta (`NoOpenCashSessionError`).
     - A operação registra um crédito (`CREDIT`) no extrato do cliente e, no mesmo fluxo transacional, adiciona uma entrada de dinheiro do tipo `DEBT_PAYMENT` na sessão de caixa ativa do operador, alimentando a conferência cega.
     - Gera registro de auditoria imutável `CUSTOMER_DEBT_SETTLED`.
  5. **Unicidade e Isolamento Multi-tenant**:
     - Restrição de unicidade composta `(merchant_id, phone)` impedindo telefones duplicados para o mesmo lojista.
- **Trade-offs / Consequências**:
  - *Positivo*: Blindagem total contra desvios de fiado no balcão; garantia matemática de que nenhum fiado sem limite seja concedido sem ciência expressa da proprietária; conciliação contábil entre baixas de dívida e dinheiro físico na gaveta.
  - *Negativo*: Requer presença ou digitação explícita do PIN da dona para transações que estourem o teto; exige caixa aberto mesmo que o pagamento do cliente seja feito fora de uma venda convencional.

---

**Atualização (PR #30): atomicidade da venda com fiado.** A venda, a baixa de estoque, o débito no extrato do cliente, o recibo de caixa (`SALE_RECEIPT`) e a auditoria são gravados em uma única transação (`SaleRepository.commitSale`). A dedução de estoque trava as linhas com `FOR UPDATE` em ordem fixa de `productId`, e o limite de crédito é reavaliado com a linha do cliente travada. Qualquer falha desfaz tudo.

## ADR-009: Adaptação da Interface do PDV no Next.js App Router, Fila Offline e Integração com Slices 1 a 5

- **Data**: 2026-10-31
- **Status**: Aprovado
- **Contexto**: O sistema de frente de caixa e retaguarda requer uma interface de alta produtividade para o balcão do pequeno varejo de bairro, adaptando a interface validada do projeto legado em `/home/rafael-lauri/projetos/sistema-mini-mercado/frontend`. O design original já possui ergonomia testada com atalhos de teclado (F2, F3, F4, F5, F7, F10, Esc, Enter), leitor de código de barras simulado, split checkout, autorização de desconto com PIN, controle de caixa e fila de contingência para vendas em dinheiro quando a rede oscilar. A migração precisa adotar a arquitetura Next.js 16 App Router com páginas dedicadas (`/`, `/gestao`, `/login`), garantindo consumo exclusivo dos endpoints reais implementados nos Slices 1 a 5 (`/api/auth/*`, `/api/cash/*`, `/api/products/*`, `/api/sales/*`, `/api/customers/*`) com `credentials: 'include'`.
- **Decisão**:
  1. **Adaptação Direta da Interface Validada (Zero Reescrita Desnecessária)**:
     - Reaproveitamento do design visual de alto contraste e layout funcional dos arquivos legados `pdv.css` e `management.css` alocados em `src/frontend/styles/`.
     - Preservação integral do layout em duas colunas no PDV (`.pdv-grid`): coluna de escaneamento, último item lido e status da operação à esquerda; lista de itens do carrinho ao centro; resumo financeiro, formas de pagamento, troco e botões de ação à direita.
  2. **Estrutura de Rotas no App Router (`src/app/`)**:
     - `src/app/page.tsx` (`'use client'`): Terminal de PDV focado em velocidade operacional, manipulação do carrinho com prevenção de estoque negativo, atalhos de teclado (`F2` Dinheiro, `F3` Pix, `F4` Débito, `F5` Crédito, `F7` Desconto, `F10` Finalizar, `Esc` Limpar), suporte a split payments e autorização de fiado com PIN da proprietária.
     - `src/app/gestao/page.tsx` (`'use client'`): Painel de gestão unificado para a dona e operadores autorizados, cobrindo:
       - Catálogo e Estoque (busca rápida, criação de novos produtos via `POST /api/products`, reposição manual de estoque via `POST /api/inventory/restock`).
       - Clientes e Fiado (busca de clientes, cadastro via `POST /api/customers`, consulta de saldo devedor via `GET /api/customers/[id]/balance`, quitação total/parcial via `POST /api/customers/[id]/settle`).
       - Turno de Caixa (conferência do caixa atual via `GET /api/cash/current` e fechamento de caixa cego com justificativa via `POST /api/cash/close`).
     - `src/app/login/page.tsx` (`'use client'`): Tela de acesso que verifica `/api/setup/status`, provê fluxo de setup inicial da dona caso necessário (`/api/setup/owner`), autenticação com credenciais (`/api/auth/login`) e verificação de abertura de caixa (`/api/cash/open`).
  3. **Mecanismo de Contingência Offline (`src/frontend/lib/offline-sync.ts`)**:
     - Vendas em dinheiro (`CASH`) simples podem ser registradas mesmo sem conexão à internet (`!navigator.onLine` ou falha transitória de rede).
     - As vendas em contingência são assinadas com chave de idempotência (`Idempotency-Key` UUID v4), salvas de forma segura no `localStorage` isoladas por tenant e operador (`miniMarketOfflineSales:${merchantId}:${username}`).
     - Produtos consultados enquanto online são mantidos em cache local (`miniMarketCachedProducts:${merchantId}:${username}`) com preço de venda e quantidade disponível.
     - Ao restabelecer a conectividade (`window.addEventListener('online')`), um processo assíncrono idempotente envia as vendas enfileiradas para `POST /api/sales`, tratando divergências de catálogo e limpando a fila com sucesso.
  4. **Segurança e Comunicação de API Sem CSRF Legado**:
     - A comunicação com o backend em Next.js utiliza cookies de sessão seguros `HttpOnly` com prefixo `__Host-` geridos nos Slices 1 a 5. Todas as requisições `fetch` utilizam `credentials: 'include'`.
     - Elimina a dependência de token CSRF manual do legado, utilizando o modelo nativo de rotas Next.js com proteção de cabeçalhos de origem e SameSite.
- **Trade-offs / Consequências**:
  - *Positivo*: Continuidade total da experiência operacional e usabilidade validada; zero retrabalho em reinventar layouts ou regras de teclado; robustez contra quedas de internet no caixa do mercado; integração perfeita com os contratos de API já testados e aprovados.
  - *Negativo*: Armazenamento em `localStorage` é limitado por navegador/dispositivo, exigindo que a sincronização ocorra no mesmo terminal onde as vendas offline foram originadas.

---

## ADR-010: Modelo SaaS Multi-Tenant Autônomo e Integração Planejada de Observabilidade e Perímetro

- **Data**: 2026-10-31
- **Status**: Aprovado; auto-cadastro SaaS implementado. Observabilidade e perímetro (Slices 7–9) pendentes.
- **Contexto**: O sistema originalmente possuía um "Setup Inicial" concebido para appliances on-premise de lojista único (`InitialOwnerSetupUseCase`), travando novos cadastros caso qualquer usuário existisse no banco. Para permitir que a dona do comércio e novos lojistas possam criar suas contas de forma independente, sem colisão de dados com contas de teste ou de desenvolvimento, fez-se necessária a evolução para um modelo SaaS com auto-cadastro. Adicionalmente, identificaram-se padrões de excelência nos projetos de referência do desenvolvedor (`argus`, `casa-de-leiloes` e `barbearia.js`) para guiar a evolução do sistema.
- **Decisão**:
  1. **Auto-Cadastro SaaS Multi-Tenant (`RegisterMerchantUseCase`)**:
     - Criação do caso de uso `RegisterMerchantUseCase` e da rota `POST /api/auth/register`, permitindo que qualquer comerciante registre sua loja fornecendo nome do comércio, usuário da dona, senha e PIN de autorização.
     - Cada cadastro cria um registro em `merchants` gerando um `merchant_id` UUID isolado, e um registro em `app_users` com autoridade `ROLE_OWNER` associado a esse tenant.
     - A interface de login (`src/app/login/page.tsx`) passa a dispor de navegação em abas (`Entrar no PDV` e `Cadastrar Nova Loja`), garantindo acesso imediato sem interferência entre lojistas.
  2. **Arquitetura de Integração Futura (Hub & Spoke / Modular Event-Driven)**:
     - **Padrão Barbearia.js (Perímetro & PWA)**: O PDV será empacotado como Progressive Web App (PWA) instalável em tela cheia com Service Worker e proteção de borda anti-bruteforce (Cloudflare Turnstile) no login/PIN.
     - **Padrão Casa de Leilões (Ledger Criptográfico)**: O ledger de fiado (`customer_credit_ledger`) e a tabela de auditoria (`audit_events`) adotarão encadeamento de hash SHA-256 (`hash = SHA256(previous_hash + payload)`), fornecendo prova matemática contra adulteração retroativa.
     - **Padrão Argus (Observabilidade e Alertas)**: O Meu Comércio atuará como emissor de eventos via webhooks seguros para um worker satélite de mensageria, enviando relatórios de fechamento de caixa e alertas de estoque baixo diretamente no Telegram pessoal da proprietária.
- **Trade-offs / Consequências**:
  - *Positivo*: O sistema torna-se um SaaS comercializável completo; dados de testes e dados de produção reais coexistem com isolamento matemático garantido; roteiro de evolução claro baseado em componentes já validados nos outros projetos.
  - *Negativo*: Requer governança de nomes de usuário globais únicos no sistema para evitar colisões no login simples.

---

## ADR-011: Operações de Balcão do Mundo Real & Gestão Financeira Essencial (Slice 11)

- **Data**: 2026-10-31
- **Status**: Aprovado
- **Contexto**: A rotina real de um mercado de bairro exige flexibilidade operacional para pagamentos avulsos em dinheiro físico (sangrias), entrada de troco/moedas durante o expediente (suprimentos), impressão imediata de cupom para o cliente e canhoto assinado para compras no fiado, métricas globais de fiado na praça e cancelamento seguro de vendas com devolução de itens ao estoque. Sem sangria e suprimento, o fechamento cego de caixa acusa falsas divergências financeiras. Sem estorno controlado por PIN, desistências ou erros de digitação corrompem o saldo de estoque e caixa.
- **Decisão**:
  1. **Sangria (`WITHDRAWAL`) e Suprimento (`DEPOSIT`) de Caixa**:
     - Estender `CashMovementType` para suportar explicitamente `'WITHDRAWAL'`, `'DEPOSIT'` e `'CASH_CANCEL'`.
     - Invariantes estritas de domínio:
       - Caixa precisa estar em status `'OPEN'`.
       - Motivo textual (`reason`) obrigatório com tamanho mínimo de 3 caracteres.
       - Sangria (`WITHDRAWAL`): valor estritamente positivo e limitado ao dinheiro disponível em caixa (`amount <= expectedCash`). Lança `InsufficientCashForWithdrawalError` se exceder.
       - Suprimento (`DEPOSIT`): valor estritamente positivo.
       - Auditoria compulsória via `AuditPort` gravando `CASH_WITHDRAWAL_RECORDED` e `CASH_DEPOSIT_RECORDED`.
     - Fórmula exata da conferência cega:
       $$\text{Dinheiro Esperado} = \text{Fundo Inicial} + \sum \text{SALE\_RECEIPT} + \sum \text{DEBT\_PAYMENT} + \sum \text{DEPOSIT} - \sum \text{WITHDRAWAL} - \sum \text{CASH\_CANCEL}$$
  2. **Cancelamento e Estorno Atômico de Venda (`CancelSaleUseCase`)**:
     - Exclusivamente autorizado mediante validação de PIN da proprietária (`OwnerPinVerifier`).
     - Apenas vendas no status `'CONFIRMED'` podem ser canceladas; tentativa em venda já cancelada resulta em `SaleAlreadyCancelledError`.
     - Reversão atômica de múltiplos agregados:
       - Venda: transiciona status para `'CANCELLED'`.
       - Estoque: para cada item, restabelece a quantidade disponível em `InventoryItem` e grava movimentação em `inventory_movements` do tipo `'RETURN'`.
       - Caixa (Dinheiro): se `sale.cashPaid.isPositive()`, valida se há sessão de caixa aberta e dinheiro suficiente na gaveta, gravando movimentação `'CASH_CANCEL'`.
       - Fiado (Caderneta): se a venda originou lançamento em débito em `customer_credit_ledger`, emite movimento compensatório do tipo `'CREDIT'` amortizando integralmente o débito daquela venda no extrato do cliente.
       - Trilha de auditoria: gravação compulsória do evento `'SALE_CANCELLED'`.
  3. **Métricas de Fiado na Rua (`GetCreditMetricsUseCase`)**:
     - Agregação por comerciante calculando:
       - `totalOutstandingCredit`: soma de `greatest(0, sum(DEBIT) - sum(CREDIT))` agrupada por cliente (montante total que o comércio tem a receber na praça).
       - `totalSettledCredit`: soma de todos os pagamentos e amortizações (`CREDIT`) históricos.
       - `activeDebtorsCount`: total de clientes distintos com saldo devedor positivo.
  4. **Estrutura de Impressão Térmica (58mm e 80mm)**:
     - Adotar folha de estilos `@media print` sem dependência de drivers proprietários ou serviços externos.
     - Suporte responsivo a larguras térmicas padrão:
       - **58mm**: ~32 colunas monoespaçadas, largura útil ~48mm / ~190-210px.
       - **80mm**: ~48 colunas monoespaçadas, largura útil ~72mm / ~280-300px.
     - Dois formatos padronizados:
       - **Cupom Não-Fiscal de Venda**: Cabeçalho do comércio, itens detalhados (qtd x unitário), subtotal, descontos, total líquido, formas de pagamento, troco e rodapé institucional.
       - **Canhoto de Fiado**: Identificação do cliente, débito contraído, histórico financeiro (dívida anterior e novo saldo devedor total) e linha pontilhada com declaração de reconhecimento de dívida para assinatura manual.
- **Trade-offs / Consequências**:
  - *Positivo*: Fidelidade total à rotina física do comércio; precisão absoluta na conferência cega do caixa; proteção contra fraudes via PIN da dona; visibilidade gerencial do fiado na praça.
  - *Negativo*: Cancelamento exige orquestração de múltiplos agregados de domínio (`sales`, `inventory`, `cash`, `customers`), demandando atomicidade e validações defensivas.

---

## ADR-012: Endurecimento Integral de Segurança (Defense-in-Depth) em Todos os Níveis

- **Data**: 2026-10-31
- **Status**: Aprovado. Implementado: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS e rate limit por IP (em memória). Não implementado: Content-Security-Policy, limite de 1 MB no body, honeypot validado no servidor e bloqueio de requisição sem `Origin` e sem `Referer`. Ver `docs/BACKLOG.md`, Slice 12.
- **Contexto**: Como aplicação SaaS multi-tenant que processa transações financeiras reais, dinheiro em caixa e estoque, o sistema precisa de proteção robusta contra ameaças cibernéticas da web aberta (ataques de força bruta, DoS em APIs de autenticação, Clickjacking, MIME sniffing, injeção de scripts XSS, CSRF e automações maliciosas de bots).
- **Decisão**:
  1. **Camada Frontend & Borda do Navegador**:
     - Configuração de cabeçalhos estritos de segurança HTTP (OWASP Top 10) em `next.config.ts`:
       - `Content-Security-Policy (CSP)`: restringe origens confiáveis para scripts, estilos e conexões.
       - `X-Frame-Options: DENY`: bloqueia Clickjacking impedindo iframes de terceiros.
       - `X-Content-Type-Options: nosniff`: impede ataques de MIME sniffing.
       - `Referrer-Policy: strict-origin-when-cross-origin`: protege o sigilo de caminhos de URLs.
       - `Permissions-Policy`: desativa recursos de hardware não utilizados (câmera, microfone, geolocalização).
       - `Strict-Transport-Security (HSTS)`: força tráfego sob HTTPS por 2 anos com subdomínios.
     - Campo Honeypot invisível em formulários de registro e login para captura passiva e rejeição imediata de bots automatizados.
  2. **Camada Backend & Middleware HTTP**:
     - Middleware de **Rate Limiting** granular por IP (Sliding Window):
       - Autenticação e Registro (`/api/auth/*`, `/api/setup/*`): 5 requisições por minuto por IP com resposta `429 Too Many Requests` e cabeçalho `Retry-After`.
       - Finalização de Vendas (`POST /api/sales`): 20 requisições por minuto por IP (impede rajadas automatizadas e sobrecarga no banco).
       - Movimentações de Caixa e Fiado (`/api/cash/*`, `/api/customers/*`): 30 requisições por minuto por IP.
       - Consultas do Catálogo / PDV (`/api/products/*`): 60 requisições por minuto por IP (suficiente para operadores rápidos e inviabiliza raspagem).
     - Validação estrita de cabeçalho `Origin` / `Host` em mutações (`POST`, `PUT`, `DELETE`), bloqueando ataques CSRF vindos de domínios externos.
     - Limite de 1 MB para payloads JSON e sanitização de schemas Zod (`strip`) para eliminar riscos de Prototype Pollution.
  3. **Camada de Banco de Dados**:
     - Conexões com o Neon PostgreSQL exigindo TLS criptografado (`sslmode=require`).
     - Preservação estrita de integridade referencial e chaves compostas por `merchant_id`.
- **Trade-offs / Consequências**:
  - *Positivo*: Nível corporativo/bancário de proteção; blindagem contra bots e ataques em massa; zero impacto na velocidade de operação de vendas no caixa.
  - *Negativo*: Requer manutenção de limites de taxa calibrados para não bloquear redes corporativas ou Wi-Fi com múltiplos caixas sob o mesmo IP público (limite generoso em rotas normais).






---

## ADR-013: Bloqueio por tentativas do PIN da proprietária por loja

- **Data**: 2026-11-05
- **Status**: Aprovado e implementado (PR #31). A tabela `owner_pin_attempts` (migração `0001`) foi criada no banco de produção em 09/11/2026, quando o `db-migrate` rodou pela primeira vez.
- **Contexto**: O PIN da proprietária autoriza descontos, estornos e vendas fiado acima do limite. Sem limite de tentativas, um operador logado pode testar PINs pela rota de vendas. O bloqueio de login (ADR-006) não cobre esse PIN.
- **Decisão**:
  1. Cada loja tem um contador de tentativas do PIN da proprietária, na tabela `owner_pin_attempts`.
  2. Cada tentativa é contada antes da comparação. A regra de bloqueio fica só em `reserveOwnerPinAttempt` (domínio). O store trava a linha da loja com `SELECT ... FOR UPDATE` dentro de uma transação, aplica a regra e grava o resultado. Assim, requisições concorrentes não ultrapassam o limite.
  3. A 5ª tentativa ativa o bloqueio de 15 minutos para todas as operações daquela loja. Se a 5ª tentativa estiver correta, ela ainda é aceita, e a contagem é zerada.
  4. Um PIN correto zera o contador.
  5. Ao expirar o bloqueio, o contador não zera. Um PIN errado bloqueia de novo na hora, e só um PIN correto limpa a contagem.
  6. O bloqueio é por loja, não por usuário. Um operador pode, portanto, bloquear o PIN da dona por 15 minutos, mas não consegue burlá-lo. Essa troca precisa de aprovação do dono.
- **Trade-offs / Consequências**:
  - *Positivo*: impede teste de força bruta do PIN de 6 dígitos pela rota de vendas.
  - *Negativo*: operador mal-intencionado pode atrasar vendas que dependem do PIN da dona por 15 minutos.


---

## ADR-014: Produto Vendido por Peso (preço por quilo, quantidade em gramas)

- **Data**: 2026-11-09
- **Status**: Aprovado e implementado (PR #47, migração `0002`; PR #48).
- **Contexto**: A loja pesa mussarela, mortadela e outros itens, e a balança não imprime etiqueta. O sistema só conhecia quantidade inteira de unidades, na venda e no estoque.
- **Decisão**:
  1. Cada produto tem uma unidade, `UN` (por unidade) ou `KG` (por peso), em `products.unit`. A venda guarda a unidade do item em `sale_items.unit`.
  2. Para `KG`, o preço é **por quilo** e a quantidade (na venda e no estoque) é um número **inteiro de gramas**. Assim o resto do sistema segue com quantidades inteiras.
  3. O valor de uma linha é `preço por kg × gramas ÷ 1000`, **arredondado ao centavo na própria linha** (*half-up*). A mesma função (`lineSubtotal`, em `src/shared/domain/product-unit.ts`) calcula a linha no servidor, no carrinho e no recibo, e a soma das linhas é sempre o total cobrado.
  4. No PDV, o peso é digitado na hora: só dígitos são gramas (`350`) e dígitos com vírgula ou ponto são quilos (`0,350`). A tela mostra o valor da linha antes de adicionar.
  5. A unidade de um produto que já existe não muda por upsert.
- **Trade-offs / Consequências**:
  - *Positivo*: nenhuma coluna de quantidade fracionária; nenhum centavo que aparece só no total; cancelamento e estoque continuam em inteiros.
  - *Negativo*: o estoque de um produto por peso é lido em gramas por quem consulta o banco; a tela converte para kg. Não há integração com balança: o peso é digitado.

---

## ADR-015: Controle de Estoque Opcional por Loja

- **Data**: 2026-11-09
- **Status**: Aprovado e implementado (PR #57, migração `0003`; PR #58).
- **Contexto**: A cliente quer vender sem controlar estoque por enquanto, mas manter o controle como opção para depois.
- **Decisão**:
  1. Um interruptor por loja, `merchants.stock_control_enabled` (padrão **ligado**), que só a proprietária muda, por `PATCH /api/store/settings`. Qualquer usuário logado lê (`GET`). Cada mudança grava `STORE_SETTINGS_CHANGED` na auditoria.
  2. **Desligado:** a venda não exige saldo e não baixa o estoque (nem grava movimentação); somem da gestão o saldo, as entradas, os alertas de estoque baixo, os filtros e o valor em estoque; o cadastro não pede o estoque inicial; a importação ignora a coluna Estoque; o PDV não mostra o saldo.
  3. Cada venda guarda se tirou do estoque, em `sales.stock_tracked`. O **cancelamento só devolve ao estoque a venda que tirou**; o estorno do dinheiro e do fiado não muda.
  4. As lojas que já existem ficam com o controle **ligado**: nada muda até a dona desligar.
- **Trade-offs / Consequências**:
  - *Positivo*: onboarding simples (produto só precisa de nome, código e preço); o controle volta quando a dona quiser; cancelar nunca infla o saldo.
  - *Negativo*: ao ligar de novo, os saldos podem estar desatualizados, porque as vendas feitas sem controle não baixaram nada. A tela avisa e pede confirmação; o ajuste fica por conta da dona. O interruptor é da loja, não de cada produto.

---

## ADR-016: Relatórios de Vendas no Horário de Brasília

- **Data**: 2026-11-09
- **Status**: Aprovado e implementado (PR #55).
- **Contexto**: A dona quer saber quanto vendeu no dia, na semana e no mês.
- **Decisão**:
  1. O **dia é o dia do comércio**, em `America/Sao_Paulo`, não em UTC. Cada limite de período é um instante que é meia-noite lá, e o **fim é exclusivo**: uma venda às 22h do dia 9 é do dia 9 (já é dia 10 em UTC) e uma venda exatamente à meia-noite é do dia seguinte. A semana vai de segunda a domingo.
  2. Cada período é comparado com o anterior **até o mesmo ponto do tempo** (hoje às 12h contra ontem às 12h; a semana até quarta contra a semana passada até quarta).
  3. O total é a soma das vendas **confirmadas**; as canceladas aparecem à parte. As formas de pagamento somam o **valor do pagamento**, nunca o dinheiro entregue (o troco não é venda). O **fiado recebido** conta só as quitações no balcão (crédito sem venda), e não o estorno de uma venda cancelada.
  4. O dinheiro é somado **no banco** e arredondado ao centavo na aplicação; nenhuma soma usa número de ponto flutuante.
  5. **Só a proprietária** vê os relatórios (`403` para os demais). A loja vem sempre da sessão.
  6. Somente leitura, sem mudança de banco.
- **Trade-offs / Consequências**:
  - *Positivo*: os números batem com o dia da loja e com o fechamento do caixa; a regra de fuso fica num só lugar (`report-period.ts`) e é testada nas bordas.
  - *Negativo*: o fuso é fixo; uma loja em outro fuso exigiria guardar o fuso por loja. Sem índice por loja e data, consultas de períodos longos podem ficar lentas com muito histórico.

---

## ADR-017: App Instalável sem Service Worker

- **Data**: 2026-11-09
- **Status**: Aprovado e implementado (PR #49).
- **Contexto**: A dona quer o sistema como um atalho na área de trabalho, em janela própria.
- **Decisão**:
  1. Um **manifesto web** (`/manifest.webmanifest`, `display: standalone`, abre em `/login`, atalhos para o PDV e a gestão), ícones PNG de 192 e 512 px, um ícone *maskable* e o ícone da Apple, todos desenhados a partir da marca. O favicon continua o `icon.svg`.
  2. Um botão **Instalar app** no cabeçalho, que só aparece quando o Chrome ou o Edge avisam que dá para instalar.
  3. **Sem service worker**, de propósito: a instalação não torna o app offline (o PDV mantém a fila offline que já tinha) e nenhuma tela antiga fica presa depois de um deploy.
- **Trade-offs / Consequências**:
  - *Positivo*: instalação sem o risco de servir versão velha do app; nada a invalidar a cada deploy.
  - *Negativo*: não abre sem internet por ser instalado. Se isso for desejado, é uma decisão à parte, com estratégia de atualização do cache.

---

## ADR-018: Versionamento Semântico e Lançamento de Versões

- **Data**: 2026-11-09
- **Status**: Aprovado e implementado (PR #51); versão `0.1.0` lançada em 2026-11-09.
- **Contexto**: Mesclar na `main` já publica em produção, e não havia como saber qual versão estava no ar nem o que mudou entre elas.
- **Decisão**:
  1. **Versionamento Semântico** (`MAJOR.MINOR.PATCH`), com a versão num só lugar, o `package.json`. `0.x` quer dizer "em produção, mas ainda crescendo"; vira `1.0.0` quando a lojista opera o dia no sistema e a dona aceita os fluxos principais.
  2. **`CHANGELOG.md`** no formato Keep a Changelog, com a seção "Não lançado" sempre no topo. Um teste falha se o `package.json` e o CHANGELOG discordarem.
  3. **Mesclar não é lançar**: a versão é cortada de propósito, por uma PR `chore(release): vX.Y.Z`, seguida da tag e da Release no GitHub.
  4. A versão e o commit publicados aparecem no rodapé das telas e em `GET /api/version` (público, sem segredo).
- **Trade-offs / Consequências**:
  - *Positivo*: dá para dizer exatamente o que está no ar e o que mudou.
  - *Negativo*: um passo manual a mais por versão; o commit só aparece no rodapé quando a Vercel informa a variável do deploy.

---

## ADR-019: Cancelar Venda Finalizada no PDV

- **Data**: 2026-11-09
- **Status**: Aprovado e implementado (PR #56).
- **Contexto**: O botão de cancelar uma venda já feita ficava na gestão, longe de quem está no caixa, e pedia o código da venda (UUID de 36 caracteres), que o cupom nem mostra inteiro.
- **Decisão**:
  1. O botão **Cancelar venda finalizada** fica na barra de baixo do **PDV**, ao lado de Sangria e Suprimento, e só funciona com o caixa aberto e com internet. Saiu da gestão.
  2. Em vez de digitar o código, a pessoa **escolhe a venda na lista das vendas de hoje** (até 30, da mais recente para a mais antiga, no dia de Brasília), por `GET /api/sales/recent`. A rota exige login, só enxerga a loja da sessão e nunca é guardada em cache.
  3. O cancelamento em si não muda: **PIN da proprietária e motivo continuam obrigatórios**; os itens voltam ao estoque (se a venda os tirou), o dinheiro é estornado e o fiado é desfeito.
  4. O botão que limpa a venda em andamento ("Cancelar venda · Esc") continua como estava; é outra coisa.
- **Trade-offs / Consequências**:
  - *Positivo*: o caixa cancela sem digitar código nenhum, e só vendas de hoje aparecem.
  - *Negativo*: o operador passa a ver a lista das vendas de hoje, com valores (o PIN da dona continua sendo exigido para cancelar). Cancelar vendas de dias anteriores deixa de ter tela.
