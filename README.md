# Meu Comércio

[![CI](https://github.com/RafalauriSantos/meu-comercio/actions/workflows/ci.yml/badge.svg)](https://github.com/RafalauriSantos/meu-comercio/actions)
[![Tests](https://img.shields.io/badge/Vitest-157%20passed%20(100%25)-brightgreen)](./docs/TRACEABILITY.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16%20Turbopack-black)](https://nextjs.org/)
[![Database](https://img.shields.io/badge/Neon-PostgreSQL%20Serverless-00e599)](https://neon.tech/)

> Sistema de Ponto de Venda (PDV) e Gestão Comercial para pequenos comércios e mini-mercados de bairro, desenvolvido para operação rápida de balcão, precisão financeira matemática sem floats, controle rigoroso de caixa cego, fiado com PIN da dona e contingência offline. Arquitetura em Monólito Modular Hexagonal (Ports & Adapters) sobre Next.js 16 App Router com Turbopack, Drizzle ORM e PostgreSQL Neon Serverless.

## Acesse

- **Rotas principais:**
  - `/` — Terminal de PDV com leitura contínua, atalhos de teclado (F2/F3/F4/F5/F7/F10/Esc), split checkout e fila offline.
  - `/gestao` — Painel de retaguarda (catálogo de produtos, reposição de estoque, extrato de fiado e fechamento de caixa).
  - `/login` — Autenticação segura, setup inicial da dona e abertura de turno de caixa.
- **Contas de demonstração** (senha padrão `demo-comercio-2026`):
  - **Proprietária:** `dona@demo.example` (PIN de liberação: `1234`) — acesso irrestrito ao PDV, retaguarda, override de fiado e fechamento forçado de qualquer caixa.
  - **Operador de caixa:** `operador@demo.example` — abertura de caixa, vendas de balcão e fechamento do seu próprio turno.
- No primeiro acesso em ambiente limpo, o sistema detecta ausência de lojistas e redireciona automaticamente para o assistente de provisionamento da proprietária (`/login`).

## Rodar localmente

Requisitos: Node.js 22 (`.nvmrc`), PostgreSQL (instância Neon Serverless ou Postgres local) e npm.

```bash
npm ci             # Instala as dependências exatas do projeto
cp .env.example .env.local  # Configura as variáveis de ambiente (banco e sessão)
npm run dev        # Inicia o servidor de desenvolvimento em http://localhost:3000
npm test           # Executa os 157 testes automatizados da suíte (Vitest)
npm run build      # Valida e compila a aplicação de produção com Turbopack
```

- Configure `DATABASE_URL` e `SESSION_SECRET` (gerado com `openssl rand -base64 32`) em `.env.local`.
- As migrações do banco e a criação de índices são gerenciadas pelo Drizzle Kit (`npx drizzle-kit push` ou migrações SQL).

## Testes e Qualidade

- **157 testes automatizados aprovados (Vitest, 15 arquivos de teste)** cobrindo 100% dos fluxos críticos: aritmética de centavos do Value Object `Money`, abertura/fechamento de caixa com conferência cega, checagem e dedução atômica de estoque, idempotência transacional de checkout, liberação de excesso de fiado por PIN da dona, quitação de dívidas e fila de sincronização offline.
- **ESLint com 0 erros e 0 avisos:** checagem rigorosa de código em conformidade com os padrões estabelecidos do Next.js e TypeScript.
- **TypeScript em modo estrito (`strict: true`):** compilação validada com `npx tsc --noEmit` sem qualquer violação de tipos.
- **CI Pipeline no GitHub Actions (`.github/workflows/ci.yml`):** validação automatizada em cada push e pull request na branch `main`, executando `npm ci`, ESLint, suíte completa de testes no Vitest, checagem de tipos estrita e build de produção com Turbopack.

## O que foi feito

| Requisito | Situação |
|---|---|
| Monólito Modular Hexagonal com domínio puro desacoplado de frameworks e banco | Feito |
| Multi-tenancy nativo por `merchant_id` com isolamento completo e chaves compostas | Feito |
| Manipulação monetária exata via Value Object `Money` (28 dígitos de precisão, zero floats) | Feito |
| Terminal de PDV com ergonomia de alta produtividade e leitura contínua de código de barras | Feito |
| Atalhos de teclado no balcão (`F2` Dinheiro, `F3` Pix, `F4` Débito, `F5` Crédito, `F7` Desconto, `F10` Finalizar, `Esc` Limpar) | Feito |
| Split checkout (divisão de pagamento entre dinheiro, PIX, débito e crédito) | Feito |
| Cálculo automático e exato de troco em pagamentos em dinheiro | Feito |
| Proteção contra vendas duplicadas via chave de idempotência (`Idempotency-Key` UUID v4) | Feito |
| Prevenção estrita de estoque negativo com validação e baixa atômica de saldo | Feito |
| Catálogo de produtos com busca textual, leitura de código de barras e reposição de estoque | Feito |
| Turno de caixa único por comércio garantido por índice parcial no banco (`idx_one_open_cash_session_per_merchant`) | Feito |
| Fechamento de caixa com conferência cega e justificativa textual compulsória de divergência | Feito |
| Lançamento automático de entradas em dinheiro (`SALE_RECEIPT` e `DEBT_PAYMENT`) na gaveta física do caixa ativo | Feito |
| Permissões de caixa: operador só fecha o próprio turno; dona pode fechar qualquer turno da loja | Feito |
| Autenticação com lockout temporário após 5 tentativas incorretas e cookies seguros `HttpOnly` (`__Host-`) | Feito |
| Cadastro de clientes com limite de crédito e ledger imutável de fiado (`customer_credit_ledger`) | Feito |
| Venda fiado dentro do limite sem fricção e autorização de excesso via senha e PIN da proprietária (bcrypt) | Feito |
| Quitação de fiado vinculada compulsoriamente a turno de caixa aberto com entrada imediata na gaveta | Feito |
| Fila de contingência offline no frontend para vendas em dinheiro com sincronização automática | Feito |
| Trilha de auditoria imutável append-only (`audit_events`) para todas as ações sensíveis do sistema | Feito |
| Painel de retaguarda unificado (`/gestao`) com abas para Catálogo/Estoque, Fiado/Clientes e Fechamento de Caixa | Feito |

## Regras de negócio e comportamentos do sistema

- **Manipulação Monetária Exata via Money (Zero Floats):** É expressamente proibido o uso do tipo de ponto flutuante `number` para armazenar ou calcular valores monetários. Todo o sistema utiliza o Value Object `Money` apoiado na biblioteca `decimal.js`, operando com 28 dígitos de precisão, arredondamento comercial *half-up* e persistência em centavos inteiros (`toCents()`) ou tipos SQL `numeric(19, 4)` / `numeric(10, 2)`. Garante exatidão absoluta em descontos, divisões de split, troco e conferência de caixa.
- **Sessão Única de Caixa por Comércio no Banco:** Uma loja só pode manter um turno de caixa aberto por vez. Essa regra é blindada a nível físico pelo PostgreSQL via índice único parcial `idx_one_open_cash_session_per_merchant` (`merchant_id, status WHERE status = 'OPEN'`), impedindo condições de corrida e duplicidade de gavetas abertas mesmo sob requisições concorrentes.
- **Conferência Cega de Caixa:** No encerramento do turno, o operador não visualiza o saldo apurado pelo sistema. Ele realiza a contagem física das cédulas e moedas na gaveta e digita o valor contado. O sistema calcula a divergência; caso haja quebra (positiva ou negativa), o fechamento exige justificativa textual compulsória, gravando a auditoria com os valores esperado, apurado e a declaração do operador.
- **Vínculo Compulsório entre Dinheiro e Caixa Ativo:** Qualquer transação envolvendo dinheiro físico — seja o recebimento de uma venda (`SALE_RECEIPT`) ou a quitação de uma dívida de fiado (`DEBT_PAYMENT`) — exige obrigatoriamente um caixa com status `OPEN`. A movimentação na gaveta física é registrada no mesmo ciclo transacional.
- **Prevenção Estrita de Estoque Negativo:** O domínio valida a disponibilidade de todos os itens do carrinho antes de efetivar qualquer baixa. Se qualquer produto não possuir estoque suficiente, a venda é cancelada integralmente com `InsufficientStockError`, eliminando qualquer possibilidade de saldo negativo ou débito parcial de itens.
- **Idempotência Transacional em Duas Camadas:** O PDV gera um UUID v4 por tentativa de checkout. A camada de aplicação rejeita duplicidades via repositório e o banco impõe índice único parcial `idx_sales_merchant_idempotency` na tabela `sales`. Cliques duplos acidentais ou retransmissões por lentidão de rede retornam a venda existente de forma segura, sem gerar cobrança duplicada ou dupla baixa de estoque.
- **Ledger Imutável de Fiado e Liberação por PIN:** O saldo devedor do cliente é computado via agregação de eventos contábeis imutáveis (`DEBIT` para novas compras e `CREDIT` para quitações). Vendas dentro do limite são aprovadas diretamente pelo operador. Vendas que excedam o limite disponível disparam a exigência de autorização da proprietária: é exigida autenticação com usuário e PIN numérico, validado contra hash `bcrypt`. A liberação excepcional grava registro detalhado em `audit_events`.
- **Quitação de Fiado com Teto de Saldo:** O valor amortizado ou quitado não pode ser superior à dívida total em aberto do cliente (`DebtSettlementExceedsBalanceError`). A quitação entra imediatamente como dinheiro físico no caixa aberto do operador.
- **Contingência Offline para Vendas em Dinheiro:** Quando o navegador perde conexão (`!navigator.onLine` ou queda transitória da API), o PDV permite registrar vendas em dinheiro físico (`CASH`), salvando a transação assinada com UUID no armazenamento isolado do navegador por operador e loja (`miniMarketOfflineSales:${merchantId}:${username}`). Ao restabelecer a conectividade, o processo assíncrono envia os dados à API idempotentemente e limpa a fila.
- **Proteção contra Força Bruta (Lockout):** Tentativas repetidas de acesso indevido no balcão são contidas pelo bloqueio automático da conta após 5 falhas consecutivas de senha por 15 minutos (`lockedUntil = now + 15 min`).

## Limitações conhecidas e escopo

- **Contingência Offline Exclusiva para Dinheiro Físico:** Vendas parceladas ou processadas por meios eletrônicos (PIX, Cartão de Crédito e Cartão de Débito) requerem comunicação online ativa com os serviços financeiros e adquirentes; portanto, não entram na fila de contingência offline.
- **Sincronização Vinculada ao Terminal Local:** As vendas offline em dinheiro ficam protegidas no `localStorage` isolado do navegador do terminal. A sincronização automática é efetuada assim que a internet do próprio terminal for restaurada.
- **Turno Único por Estabelecimento:** A governança atual do banco de dados assegura uma única gaveta de caixa ativa simultaneamente por loja, eliminando furos de conciliação física entre operadores no mesmo turno.
- **Sessão Segura por Cookies de Servidor:** A persistência da sessão utiliza tokens criptograficamente assinados com HMAC-SHA256 trafegados em cookies seguros `HttpOnly` com prefixo `__Host-` em produção, protegendo os terminais de PDV contra ataques de XSS e extração indevida de credenciais.

## Decisões arquiteturais e governança

Todas as decisões arquiteturais, padrões de design e salvaguardas de negócio estão formalmente documentadas em Architecture Decision Records (ADRs):

- [docs/DECISIONS.md](docs/DECISIONS.md):
  - **ADR-001**: Monólito Modular Desacoplado (Hexagonal / Ports & Adapters)
  - **ADR-002**: Manipulação Monetária Exata via Value Object Money (zero floats)
  - **ADR-003**: Multi-tenancy por `merchant_id` com Chave Estrangeira Composta
  - **ADR-004**: Sessão Única de Caixa por Comércio e Conferência Cega
  - **ADR-005**: Imutabilidade Financeira e Trilha de Auditoria Persistente
  - **ADR-006**: Autenticação Segura com Bloqueio Temporário (Lockout)
  - **ADR-007**: Vendas no PDV, Split Payments e Idempotência Transacional
  - **ADR-008**: Modelo de Fiado / Crediário, Override por PIN da Proprietária e Quitação em Caixa Aberto
  - **ADR-009**: Adaptação da Interface do PDV no Next.js App Router, Fila Offline e Integração com Slices 1 a 5
- [docs/TRACEABILITY.md](docs/TRACEABILITY.md): Matriz de rastreabilidade vinculando todos os critérios de negócio aos 157 testes automatizados da suíte.
