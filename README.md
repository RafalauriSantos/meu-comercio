# Meu Comércio

[![CI](https://github.com/RafalauriSantos/meu-comercio/actions/workflows/ci.yml/badge.svg)](https://github.com/RafalauriSantos/meu-comercio/actions)
[![Versão](https://img.shields.io/github/v/release/RafalauriSantos/meu-comercio?label=vers%C3%A3o)](https://github.com/RafalauriSantos/meu-comercio/releases)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Database](https://img.shields.io/badge/Neon-PostgreSQL%20Serverless-00e599)](https://neon.tech/)

Sistema de Ponto de Venda (PDV) e gestão comercial para mini-mercados e pequeno varejo, em modelo SaaS multi-loja. Quem está no caixa vende com leitor de código de barras, busca pelo nome ou atalhos de teclado, registra pagamentos únicos ou divididos (dinheiro, Pix, cartões e fiado) e fecha o caixa com conferência cega. A dona vê quanto a loja vendeu no dia, na semana e no mês, controla o fiado, importa produtos de uma planilha e decide se quer controlar o estoque. O sistema calcula troco e totais em centavos, sem ponto flutuante, vende produtos por peso (mussarela, mortadela), exige o PIN da dona para fiado acima do limite e para cancelar venda, e mantém uma fila local de vendas em dinheiro se a conexão cair. Construído em monólito modular com Next.js 16, Drizzle ORM e Neon PostgreSQL.

## Acesse

- **Aplicação no ar:** [https://meucomercio.vercel.app](https://meucomercio.vercel.app)
- **Versão atual:** a que aparece no rodapé das telas e em [`/api/version`](https://meucomercio.vercel.app/api/version). O histórico está no [`CHANGELOG.md`](CHANGELOG.md) e nas [Releases](https://github.com/RafalauriSantos/meu-comercio/releases).
- **Rotas principais:**
  - `/` — Página inicial (landing), sempre no tema claro.
  - `/login` — Entrar, criar conta (cada comércio se cadastra sozinho) e abrir o caixa.
  - `/pdv` — Terminal de vendas: leitor de código de barras, busca por nome, produto por peso, pagamento dividido, fiado, impressão térmica, sangria e suprimento, **cancelar venda finalizada** e fila offline.
  - `/gestao` — Painel de retaguarda, em abas: **Catálogo & Estoque** (cadastro, importação por planilha, reposição e o interruptor do controle de estoque), **Clientes & Fiado**, **Controle de Caixa**, **Relatórios** e **Operadores** (as duas últimas só para a proprietária).
- **App instalável:** no Chrome ou no Edge, o botão **Instalar app** do cabeçalho (ou o ícone da barra de endereço) cria um atalho na área de trabalho que abre o sistema em janela própria. Não há service worker: a instalação não torna o app offline.
- **Acesso:** novos comércios se cadastram em **Criar conta**, em `/login`. Credenciais de demonstração não são publicadas neste repositório.

## Rodar localmente

Requisitos: Node.js 22, PostgreSQL (instância Neon ou local) e npm.

```bash
npm ci
cp .env.example .env.local   # preencha DATABASE_URL e SESSION_SECRET
npm run dev                  # aplicação em http://localhost:3000
npm run ci:local             # repete localmente os passos do CI: lint, tipos, testes, auditoria e build
```

Banco de dados (Drizzle): `npm run db:generate` gera uma migração a partir do schema e `npm run db:migrate` aplica as migrações a um banco. **Em produção a migração só é aplicada pelo workflow manual `db-migrate`**, com a aprovação da dona; o passo a passo está em [`docs/PROJECT_WORKFLOW.md`](docs/PROJECT_WORKFLOW.md). Testes de integração com Postgres: defina `TEST_DATABASE_URL` com um banco descartável local (o teste recusa qualquer outro) e rode `npm run test:integration`.

## Testes e qualidade

- **620 testes automatizados rodam sempre (Vitest, 83 arquivos)** e **39 testes de integração com Postgres** (7 arquivos) rodam quando há `TEST_DATABASE_URL`, como no job de Postgres do CI. A cobertura inclui cálculo monetário em centavos, venda por peso e arredondamento por linha, estoque opcional, conferência cega de caixa, baixa de estoque, idempotência da venda, fiado com PIN, relatórios por período no horário de Brasília, importação de planilha, fila offline, impressão térmica, estorno de vendas, rate limiting e proteção anti-CSRF. O mapa entre regras e testes está em [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md).
- **Todos os 7 arquivos de integração rodam no CI** (job de Postgres, um arquivo de cada vez, com `npm run test:integration`). Antes só 1 deles rodava; o item 13.7 do [backlog](docs/BACKLOG.md) foi resolvido.
- **ESLint sem erros e sem avisos** e **TypeScript em modo estrito** (`npx tsc --noEmit`).
- **CI no GitHub Actions (`.github/workflows/ci.yml`):** a cada push na `main` e em pull requests roda lint e segurança, tipos, testes, testes de Postgres e build; o deploy de produção na Vercel é a etapa final, só na `main`. **Mesclar na `main` é lançar em produção.**

## O que o app faz hoje

| Requisito | Situação |
|---|---|
| Monólito modular com domínio desacoplado de banco e HTTP | Feito |
| Multi-tenancy por `merchant_id` em todas as tabelas e consultas | Feito |
| Cálculos monetários com centavos via Value Object `Money` (sem float) | Feito |
| Leitor contínuo de código de barras com autofoco | Feito |
| Busca de produto pelo nome, no mesmo campo do código de barras | Feito |
| Produto vendido por peso: preço por quilo, peso digitado na venda, estoque em gramas, linha arredondada ao centavo | Feito |
| Atalhos de teclado no balcão | Parcial: `Esc` limpa a venda (ou fecha a janela aberta), `F2` volta o foco ao leitor e `F4` abre o pagamento; `F3`, `F5`, `F7` e `F10` não existem |
| Pagamento dividido (dinheiro, Pix, débito, crédito e fiado) | Feito |
| Troco calculado no servidor para pagamentos em dinheiro | Feito |
| Idempotência da venda via `Idempotency-Key` (a interface mantém a chave do checkout) | Feito |
| Estoque sem saldo negativo, com baixa atômica na mesma transação da venda (trava de linha `FOR UPDATE`) | Feito; falta um `CHECK` de saldo não negativo no banco |
| Controle de estoque opcional por loja (a dona liga e desliga) | Feito |
| Catálogo, reposição de estoque e importação de produtos por planilha (`.xlsx` ou CSV) | Feito |
| Cadastro de produto com leitura pelo bipador e aviso de código repetido | Feito |
| Sessão de caixa única por loja, garantida por índice parcial no banco | Feito |
| Fechamento de caixa com conferência cega e justificativa de divergência | Feito |
| Entradas em dinheiro registradas na gaveta; sangria e suprimento com motivo e auditoria | Feito |
| Impressão térmica de cupom não fiscal e canhoto de fiado | Parcial: 58 mm; o modelo do cupom conhece 80 mm, mas falta a regra de impressão |
| Cancelar venda finalizada, no PDV, escolhendo na lista das vendas de hoje, com PIN da dona | Feito; a operação ainda não é atômica (escritas em sequência) |
| Relatório de vendas (dia, semana, mês e período escolhido), só para a dona | Feito |
| Total de fiado na rua em tempo real na gestão | Feito |
| Permissões: operador fecha só o seu turno; dona fecha qualquer um | Feito |
| Bloqueio após 5 tentativas: senha do login e PIN da dona (por loja), por 15 minutos | Feito |
| Cadastro de clientes com limite de crédito e extrato de fiado | Feito |
| Venda fiado cria a venda e baixa o estoque; excesso de limite liberado pelo PIN da dona | Feito |
| Quitação de fiado vinculada a caixa aberto, com entrada na gaveta | Parcial: sem transação nem trava; corrida possível |
| Fila offline para vendas em dinheiro, com sincronização automática | Parcial: só dinheiro; ver AC-50 e AC-51 no backlog |
| Trilha de auditoria (`audit_events`) para ações sensíveis | Feito; o banco ainda não bloqueia `UPDATE` e `DELETE` nessa tabela |
| Gestão de operadores pela proprietária | Feito |
| Auto-cadastro multi-loja com isolamento estrito | Feito |
| App instalável na área de trabalho ou na tela inicial | Feito |
| Versão visível no rodapé e em `/api/version`, com Versionamento Semântico | Feito |

## Regras de negócio e comportamentos do sistema

- **Valores monetários sem ponto flutuante:** valores são manipulados pelo Value Object `Money`, com arredondamento comercial *half-up*. Isso evita discrepâncias em divisão de pagamento, desconto e troco.
- **Produto por peso:** o preço é por quilo e a quantidade, na venda e no estoque, é guardada em **gramas inteiras**. O valor da linha é preço por kg × gramas ÷ 1000, **arredondado ao centavo na própria linha**, para a soma das linhas ser sempre o total cobrado e impresso. No PDV, só dígitos são gramas (`350`) e dígitos com vírgula são quilos (`0,350`).
- **Controle de estoque opcional:** com o controle **ligado** (padrão de toda loja), a venda exige saldo e baixa o estoque. **Desligado**, a venda não exige nem baixa nada, e somem da gestão o saldo, as entradas, os alertas e o valor em estoque. Cada venda guarda se tirou do estoque (`sales.stock_tracked`), e o **cancelamento só devolve o que a venda tirou**. Ao ligar de novo, os saldos podem estar desatualizados, e a tela avisa.
- **Relatórios no horário de Brasília:** o dia vai de 00:00 a 23:59 em `America/Sao_Paulo`, não em UTC; o fim do período não entra. A semana vai de segunda a domingo. Cada período é comparado com o período anterior até o mesmo ponto do tempo. Só vendas confirmadas entram no total; as canceladas aparecem à parte. O troco não conta como venda, e "fiado recebido" conta só as quitações, não o estorno de uma venda cancelada.
- **Caixa único por comércio:** o banco impõe o índice parcial `idx_one_open_cash_session_per_merchant` (`merchant_id, status WHERE status = 'OPEN'`).
- **Conferência cega de caixa:** o operador digita o valor contado sem ver o total calculado. Havendo divergência, o sistema exige justificativa e registra em auditoria.
- **Sangria e suprimento:** a sangria exige saldo em dinheiro na gaveta e motivo; o suprimento entra na gaveta com motivo registrado.
- **Vínculo com caixa aberto:** recebimentos em dinheiro (`SALE_RECEIPT`) e quitações de fiado (`DEBT_PAYMENT`) exigem caixa `OPEN` e atualizam a gaveta no mesmo ciclo.
- **Baixa de estoque na venda:** os itens são validados e baixados na mesma transação da venda, com trava de linha (`FOR UPDATE`) em ordem fixa, então duas vendas simultâneas não passam do saldo.
- **Cancelamento de venda:** exige o PIN da dona e um motivo. Devolve os itens ao estoque (se a venda os tirou), estorna o dinheiro da gaveta e desfaz o fiado. As escritas ainda são em sequência, não numa transação.
- **Idempotência:** a venda aceita `Idempotency-Key`, e a interface mantém a mesma chave até a venda ser concluída, então um reenvio depois de falha de rede não duplica a venda.
- **Fiado e PIN:** o saldo devedor sai do histórico de débitos e créditos. Compra acima do limite exige o PIN da dona (hash `bcrypt`); o operador logado digita o PIN da dona e o servidor confere com o da proprietária da loja. A 5ª tentativa errada bloqueia o PIN daquela loja por 15 minutos (ADR-013).
- **Quitação de fiado:** o valor pago não pode passar do saldo devedor e entra como dinheiro no caixa aberto.
- **Contingência offline:** sem internet, vendas em dinheiro ficam no navegador do terminal (por operador e loja) e sincronizam quando a conexão volta, com a chave de idempotência preservada. Cartão, Pix e fiado precisam de internet.
- **Bloqueio por tentativas:** 5 senhas erradas no login bloqueiam o usuário por 15 minutos.
- **Sair:** encerra a sessão apagando o cookie com os mesmos atributos com que ele foi criado (`Secure`, `Path=/`), o que o navegador exige para um cookie `__Host-`.

## Limitações conhecidas e escopo

- **Modo offline restrito a dinheiro:** Pix e cartões dependem de comunicação com adquirentes e não entram na fila offline.
- **Sincronização no terminal local:** vendas offline ficam no navegador onde foram feitas e sincronizam quando a conexão daquele terminal volta.
- **Uma gaveta aberta por loja**, para evitar divergência física entre operadores.
- **Sessão por cookie de servidor:** `HttpOnly`, prefixo `__Host-` e assinatura HMAC-SHA256.
- **Sem maquininha integrada e sem nota fiscal:** a forma de pagamento é registrada à mão e o cupom é não fiscal. O plano está em [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md).
- **O recibo é não fiscal** e o app não emite NFC-e.

## Decisões arquiteturais e governança

Decisões técnicas em Architecture Decision Records, em [`docs/DECISIONS.md`](docs/DECISIONS.md):

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
- **ADR-011**: Sangria, Suprimento de Caixa, Impressão Térmica Não Fiscal e Estorno de Vendas
- **ADR-012**: Endurecimento Integral de Segurança (Defense-in-Depth) em Todos os Níveis
- **ADR-013**: Bloqueio por Tentativas do PIN da Proprietária por Loja
- **ADR-014**: Produto Vendido por Peso (preço por quilo, quantidade em gramas)
- **ADR-015**: Controle de Estoque Opcional por Loja
- **ADR-016**: Relatórios de Vendas no Horário de Brasília
- **ADR-017**: App Instalável sem Service Worker
- **ADR-018**: Versionamento Semântico e Lançamento de Versões
- **ADR-019**: Cancelar Venda Finalizada no PDV

## Mapa da documentação

| Documento | Para quê |
|---|---|
| [`PRODUCT.md`](PRODUCT.md) | Visão do produto, papéis e escopo do MVP |
| [`DESIGN.md`](DESIGN.md) | Sistema visual: cores, tipografia, componentes |
| [`CHANGELOG.md`](CHANGELOG.md) | O que mudou em cada versão |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | Fatias de entrega, o que está feito e o que falta, e os próximos passos |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | As decisões de arquitetura e de produto (ADRs) |
| [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md) | Regras de negócio ligadas aos testes que as cobrem |
| [`docs/PROJECT_WORKFLOW.md`](docs/PROJECT_WORKFLOW.md) | Como trabalhamos: branches, revisão, deploy, banco, versões |
| [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) | Plano para maquininhas e notas fiscais |
