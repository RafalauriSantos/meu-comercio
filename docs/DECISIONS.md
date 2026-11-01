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
  3. **Override por PIN da Proprietária (`AuthorizeCreditSaleUseCase`)**:
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
- **Status**: Aprovado e Implementado
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

## ADR-011: Sangria, Suprimento de Caixa, Impressão Térmica Não-Fiscal e Estorno de Vendas

- **Data**: 2026-10-31
- **Status**: Aprovado
- **Contexto**: A rotina real de um mercado de bairro exige flexibilidade operacional para pagamentos avulsos em dinheiro físico (sangrias), entrada de troco/moedas durante o expediente (suprimentos), impressão imediata de cupom para o cliente e canhoto assinado para compras no fiado, além de cancelamento de vendas com devolução de itens ao estoque. Sem sangria e suprimento, o fechamento cego de caixa acusa falsas divergências financeiras. Sem estorno, desistências ou erros de digitação corrompem o saldo de estoque e caixa.
- **Decisão**:
  1. **Movimentações Avulsas de Caixa (`CASH_IN` / `CASH_OUT`)**:
     - Implementar casos de uso para Sangria (`WITHDRAWAL`) e Suprimento (`DEPOSIT`) vinculados obrigatoriamente a uma sessão de caixa aberta.
     - Toda movimentação avulsa exige motivo textual explícito (ex: "Pagamento fornecedor de pão", "Reforço de moedas de R$ 0,50"), identificador do operador autenticado e autorização por PIN caso ultrapasse limite parametrizado.
     - O valor esperado na conferência cega passa a ser calculado rigorosamente como:
       $$\text{Dinheiro Esperado} = \text{Fundo Inicial} + \sum \text{Vendas em Dinheiro} + \sum \text{Quitações Fiado} + \sum \text{Suprimentos} - \sum \text{Sangrias}$$
  2. **Impressão Térmica Não-Fiscal (58mm e 80mm)**:
     - Adotar folha de estilos `@media print` otimizada para impressoras térmicas padrão ESC/POS sem necessidade de drivers proprietários ou softwares intermediários.
     - Disponibilizar dois modelos de comprovante:
       - **Cupom de Venda**: Itens, quantidades, valores unitários, subtotal, descontos, formas de pagamento, troco e data/hora.
       - **Canhoto de Fiado**: Total da compra fiado, saldo devedor atualizado do cliente e linha pontilhada para assinatura física de reconhecimento de débito.
  3. **Estorno e Cancelamento de Venda**:
     - Vendas finalizadas podem ser canceladas exclusivamente mediante validação do PIN da proprietária (`ROLE_OWNER`).
     - A operação de cancelamento é atômica: reverte as baixas de estoque (adicionando de volta a quantidade em `inventory_movements` do tipo `RETURN`), estorna a entrada de dinheiro da gaveta se houver (`CASH_CANCEL`), remove o lançamento no fiado e grava auditoria imutável (`SALE_CANCELLED`).
- **Trade-offs / Consequências**:
  - *Positivo*: Fidelidade total à rotina física do comércio; precisão absoluta na conferência cega do caixa; redução drástica de atrito com clientes em erros de balcão e no controle de fiado.
  - *Negativo*: Aumenta o volume de transações e movimentações na tabela `cash_movements`.




