# Meu Comércio

[![CI](https://github.com/RafalauriSantos/meu-comercio/actions/workflows/ci.yml/badge.svg)](https://github.com/RafalauriSantos/meu-comercio/actions)
[![Tests](https://img.shields.io/badge/Vitest-231%20passed%20(100%25)-brightgreen)](./docs/TRACEABILITY.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16%20Turbopack-black)](https://nextjs.org/)
[![Database](https://img.shields.io/badge/Neon-PostgreSQL%20Serverless-00e599)](https://neon.tech/)

Sistema de Ponto de Venda (PDV) e gestão comercial para mini-mercados e pequeno varejo em modelo SaaS multi-tenant. Operadores realizam vendas com leitor de código de barras ou atalhos de teclado, registram pagamentos únicos ou divididos (dinheiro, Pix, cartões e fiado) e fecham o caixa com conferência cega. O sistema impede estoque negativo, calcula troco em centavos sem ponto flutuante, exige PIN da dona para compras que excedam o limite de fiado e mantém fila local de vendas em dinheiro caso a conexão caia. Construído em monólito modular com Next.js 16, Drizzle ORM e Neon PostgreSQL.

## Acesse

- **Aplicação no ar:** [https://meu-comercio-rho.vercel.app](https://meu-comercio-rho.vercel.app)
- **Rotas principais:**
  - `/` — Terminal de PDV com leitura contínua, atalhos de teclado, split checkout, impressão térmica, estorno de vendas e fila offline.
  - `/gestao` — Painel de retaguarda: catálogo de produtos, reposição de estoque, extrato e total de fiado na rua, operações de caixa (sangria/suprimento), controle de equipe/operadores e fechamento de caixa.
  - `/login` — Autenticação de operador e dona, auto-cadastro de novos comércios SaaS e abertura de caixa.
- **Contas de demonstração** (senha `demo-comercio-2026`):
  - **Proprietária:** `dona@demo.example` (PIN de liberação: `1234`) — acesso total, cadastro de operadores, liberação de excesso de fiado e fechamento de qualquer caixa.
  - **Operador de caixa:** `operador@demo.example` — abertura de caixa, vendas e fechamento do seu próprio turno.
- Novos comércios podem se cadastrar de forma autônoma e imediata na aba **Cadastrar Nova Loja** em `/login`.

## Rodar localmente

Requisitos: Node.js 22, PostgreSQL (instância Neon ou local) e npm.

```bash
npm ci
cp .env.example .env.local  # configure DATABASE_URL e SESSION_SECRET
npm run dev                 # aplicação em http://localhost:3000
npm test                    # executa a suíte de 231 testes (Vitest)
npm run build               # compila o build de produção (Turbopack)
```

## Testes e Qualidade

- **231 testes automatizados aprovados (Vitest, 29 arquivos):** cobertura para cálculo monetário com centavos inteiros, conferência cega de caixa, baixa atômica de estoque, idempotência de checkout, limite de fiado com PIN, quitação de dívidas, fila offline, sangria e suprimento de caixa, impressão térmica (58mm/80mm), estorno de vendas com devolução atômica de estoque e gaveta, total de fiado na rua, gestão de operadores, auto-cadastro multi-tenant SaaS, rate limiting por IP e proteção anti-CSRF por cabeçalhos de origem.
- **ESLint com 0 erros e 0 avisos:** checagem estrita sem violações.
- **TypeScript em modo estrito (`strict: true`):** validado com `npx tsc --noEmit`.
- **CI Pipeline no GitHub Actions (`.github/workflows/ci.yml`):** executado a cada push na `main` e em pull requests, com jobs para lint, tipos, testes, build e deploy de produção como etapa final.

## O que foi feito

| Requisito | Situação |
|---|---|
| Monólito modular com domínio desacoplado de banco e HTTP | Feito |
| Multi-tenancy por `merchant_id` em todas as tabelas e consultas | Feito |
| Cálculos monetários com centavos inteiros via Value Object `Money` (sem float) | Feito |
| Leitor contínuo de código de barras com autofoco | Feito |
| Atalhos de teclado no balcão (`F2` Dinheiro, `F3` Pix, `F4` Débito, `F5` Crédito, `F7` Desconto, `F10` Finalizar, `Esc` Limpar) | Feito |
| Split checkout (divisão de pagamento entre múltiplos métodos) | Feito |
| Troco calculado no servidor para pagamentos em dinheiro | Feito |
| Idempotência de venda via cabeçalho `Idempotency-Key` (UUID) | Feito |
| Prevenção de estoque negativo com validação e baixa atômica | Feito |
| Catálogo de produtos com busca por nome, código de barras e reposição | Feito |
| Sessão de caixa única por loja garantida por índice parcial no banco | Feito |
| Fechamento de caixa com conferência cega e justificativa de divergência | Feito |
| Entradas em dinheiro registradas automaticamente na gaveta do caixa ativo | Feito |
| Sangria e Suprimento de caixa com justificativa e impacto auditado no saldo em dinheiro | Feito |
| Impressão térmica de cupom não-fiscal e canhoto de fiado (58mm e 80mm) | Feito |
| Estorno de venda no PDV com recomposição de estoque e gaveta | Feito |
| Total de Fiado na Rua agregado em tempo real no painel de gestão | Feito |
| Permissões: operador fecha apenas seu turno; dona fecha qualquer turno | Feito |
| Lockout de autenticação após 5 tentativas incorretas por 15 minutos | Feito |
| Cadastro de clientes com limite de crédito e extrato de fiado | Feito |
| Venda fiado com bloqueio de excesso de limite, liberável por PIN da dona | Feito |
| Quitação de fiado vinculada a caixa aberto com entrada na gaveta | Feito |
| Fila offline para vendas em dinheiro com sincronização automática | Feito |
| Trilha de auditoria imutável (`audit_events`) para ações sensíveis | Feito |
| Painel de retaguarda (`/gestao`) com produtos, fiado, caixa e métricas financeiras | Feito |
| Gestão de operadores com controle de equipe pela proprietária | Feito |
| Auto-cadastro SaaS multi-tenant com isolamento estrito por loja | Feito |

## Regras de negócio e comportamentos do sistema

- **Valores monetários sem ponto flutuante:** valores são manipulados exclusivamente pelo Value Object `Money` com centavos inteiros e arredondamento commercial *half-up*. Previne discrepâncias em divisões de pagamento, descontos e troco.
- **Caixa único por comércio:** o banco impõe índice único parcial `idx_one_open_cash_session_per_merchant` (`merchant_id, status WHERE status = 'OPEN'`), impedindo mais de uma sessão aberta simultaneamente por loja.
- **Conferência cega de caixa:** o operador digita o valor físico contado sem ver o total calculado pelo sistema. Se houver divergência (quebra ou sobra), o sistema exige justificativa textual e registra o evento em auditoria.
- **Sangria e Suprimento de caixa:** retiradas (sangrias) exigem saldo suficiente em dinheiro na gaveta e justificativa obrigatória; aportes (suprimentos) aumentam a gaveta com motivo registrado.
- **Vínculo com caixa aberto:** recebimentos em dinheiro de vendas (`SALE_RECEIPT`) ou quitações de fiado (`DEBT_PAYMENT`) exigem caixa com status `OPEN` e atualizam o saldo da gaveta no mesmo ciclo.
- **Prevenção de estoque negativo:** o sistema valida todos os itens do carrinho antes da baixa. Falta de estoque em qualquer item cancela a operação inteira sem débitos parciais.
- **Estorno seguro de venda:** cancelamento devolve integralmente o estoque movimentado e, caso tenha havido pagamento em dinheiro, deduz da gaveta do caixa ativo ou, se fiado, debita o crédito restaurando o limite.
- **Idempotência em duas camadas:** checkout utiliza UUID gerado pelo cliente. Tentativas duplicadas são identificadas na aplicação e barradas pelo índice único parcial no banco.
- **Fiado e autorização por PIN:** o saldo devedor é calculado pelo histórico de débitos e créditos. Compras que ultrapassem o limite exigem usuário e PIN da dona (validado contra hash `bcrypt`), gravando autorização na auditoria.
- **Quitação de fiado:** o valor pago não pode exceder o saldo devedor. O montante entra diretamente como dinheiro no caixa aberto.
- **Contingência offline:** quedas de conexão permitem registrar vendas em dinheiro físico, armazenadas localmente no navegador por operador e loja (`miniMarketOfflineSales:${merchantId}:${username}`). Na volta da rede, a sincronização envia os registros com a chave de idempotência preservada.
- **Bloqueio por tentativas:** 5 falhas consecutivas de senha bloqueiam o usuário temporariamente por 15 minutos.

## Limitações conhecidas e escopo

- **Modo offline restrito a dinheiro:** pagamentos eletrônicos (Pix e cartões) dependem de comunicação com adquirentes e não entram na fila offline.
- **Sincronização no terminal local:** vendas offline ficam no armazenamento local do navegador onde foram emitidas e sincronizam assim que a conexão daquele terminal retorna.
- **Uma gaveta aberta por loja:** a governança do banco mantém uma única sessão de caixa ativa por comércio para evitar divergências físicas entre operadores no mesmo turno.
- **Sessão por cookies de servidor:** autenticação utiliza cookies seguros `HttpOnly` com prefixo `__Host-` e assinatura HMAC-SHA256.

## Decisões arquiteturais e governança

Decisões técnicas documentadas em Architecture Decision Records (ADRs):

- [docs/DECISIONS.md](docs/DECISIONS.md):
  - **ADR-001**: Monólito Modular Desacoplado (Hexagonal / Ports & Adapters)
  - **ADR-002**: Manipulação Monetária Exata via Value Object Money
  - **ADR-003**: Multi-tenancy por `merchant_id` com Chave Estrangeira Composta
  - **ADR-004**: Sessão Única de Caixa por Comércio e Conferência Cega
  - **ADR-005**: Imutabilidade Financeira e Trilha de Auditoria Persistente
  - **ADR-006**: Autenticação Segura com Bloqueio Temporário (Lockout)
  - **ADR-007**: Vendas no PDV, Split Payments e Idempotência Transacional
  - **ADR-008**: Modelo de Fiado, Override por PIN da Proprietária e Quitação em Caixa Aberto
  - **ADR-009**: Adaptação da Interface do PDV no Next.js App Router e Fila Offline
  - **ADR-010**: Modelo SaaS Multi-Tenant Autônomo e Integração Planejada de Observabilidade e Perímetro
  - **ADR-011**: Sangria, Suprimento de Caixa, Impressão Térmica Não-Fiscal e Estorno de Vendas
  - **ADR-012**: Endurecimento Integral de Segurança (Defense-in-Depth) em Todos os Níveis
- [docs/TRACEABILITY.md](docs/TRACEABILITY.md): Matriz vinculando regras de negócio aos 231 testes automatizados.

