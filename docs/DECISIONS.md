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
