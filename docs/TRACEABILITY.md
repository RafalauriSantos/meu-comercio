# Matriz de Rastreabilidade — Meu Comércio

Mapeamento entre os critérios de negócio aprovados em `DECISIONS.md` e a suíte de testes automatizados.

| Critério de Negócio | Módulo | Arquivo de Teste | Status |
|---|---|---|---|
| Dinheiro exato sem ponto flutuante | `shared` | `src/shared/domain/money.test.ts` | Aprovado (11 testes) |
| Multiplicação por peso de balança de mercado | `shared` | `src/shared/domain/money.test.ts` | Aprovado |
| Provisionamento único da proprietária | `users` | `src/modules/users/application/initial-owner-setup.use-case.test.ts` | Aprovado (4 testes) |
| Hashing de senha e PIN via bcrypt | `users` | `src/modules/users/application/initial-owner-setup.use-case.test.ts` | Aprovado |
| Autenticação, bloqueio após 5 tentativas e reset em sucesso | `users` | `src/modules/users/application/authenticate-user.use-case.test.ts` | Aprovado (5 testes) |
| Bloqueio de operadores desativados | `users` | `src/modules/users/application/authenticate-user.use-case.test.ts` | Aprovado |
| Assinatura de sessão e proteção contra timing attack | `shared` | `src/shared/infrastructure/auth/session.test.ts` | Aprovado (3 testes) |
| Abertura de caixa com fundo de troco | `cash` | `src/modules/cash/application/cash-session.use-case.test.ts` | Aprovado (9 testes) |
| Apenas uma sessão aberta por comércio | `cash` | `src/modules/cash/application/cash-session.use-case.test.ts` | Aprovado |
| Validação de saldo inicial e final não-negativo | `cash` | `src/modules/cash/application/cash-session.use-case.test.ts` | Aprovado |
| Rejeição de fechamento em sessão inexistente ou encerrada | `cash` | `src/modules/cash/application/cash-session.use-case.test.ts` | Aprovado |
| Conferência cega e fechamento regular | `cash` | `src/modules/cash/application/cash-session.use-case.test.ts` | Aprovado |
| Justificativa compulsória para quebra de caixa | `cash` | `src/modules/cash/application/cash-session.use-case.test.ts` | Aprovado |
| Fechamento por operador diferente não autorizado | `cash` | `src/modules/cash/application/cash-session.use-case.test.ts` | Aprovado |
| Fechamento de qualquer turno pela proprietária | `cash` | `src/modules/cash/application/cash-session.use-case.test.ts` | Aprovado |
| Trilha de auditoria em abertura/fechamento | `cash` / `audit` | `src/modules/cash/application/cash-session.use-case.test.ts` | Aprovado |
| Criação de produto com preço em centavos e isolamento por comerciante | `products` | `src/modules/products/application/products.use-case.test.ts` | Aprovado (6 testes) |
| Código de barras duplicado rejeitado | `products` | `src/modules/products/application/products.use-case.test.ts` | Aprovado |
| Busca de produto por código de barras e por termo textual | `products` | `src/modules/products/application/products.use-case.test.ts` | Aprovado |
| Reposição de estoque (restock) com saldo atualizado | `inventory` | `src/modules/products/application/products.use-case.test.ts` | Aprovado |
| Rejeição absoluta de quantidade negativa no estoque | `inventory` | `src/modules/products/application/products.use-case.test.ts` | Aprovado |
| Validação de caixa aberto obrigatório para venda | `sales` / `cash` | `src/modules/sales/application/create-sale.use-case.test.ts` | Aprovado (49 testes) |
| Verificação e baixa atômica de estoque na venda | `sales` / `inventory` | `src/modules/sales/application/create-sale.use-case.test.ts` | Aprovado |
| Cálculo de total, desconto e troco com Money | `sales` / `shared` | `src/modules/sales/application/create-sale.use-case.test.ts` | Aprovado |
| Split payments múltiplos com validação de cobertura total | `sales` | `src/modules/sales/application/create-sale.use-case.test.ts` | Aprovado |
| Registro automático de entrada de dinheiro no caixa aberto | `sales` / `cash` | `src/modules/sales/application/create-sale.use-case.test.ts` | Aprovado |
| Idempotência com rejeição de chave duplicada | `sales` | `src/modules/sales/application/create-sale.use-case.test.ts` | Aprovado |
| Registro imutável de auditoria da venda confirmada | `sales` / `audit` | `src/modules/sales/application/create-sale.use-case.test.ts` | Aprovado |
| Criação de cliente com telefone único e limite de crédito | `customers` | `src/modules/customers/application/customers.use-case.test.ts` | Aprovado (11 testes) |
| Rejeição de telefone de cliente duplicado no mesmo comércio | `customers` | `src/modules/customers/application/customers.use-case.test.ts` | Aprovado |
| Consulta de saldo devedor e crédito disponível com Money | `customers` | `src/modules/customers/application/customers.use-case.test.ts` | Aprovado |
| Autorização de venda fiado dentro do limite sem exigir PIN | `customers` | `src/modules/customers/application/customers.use-case.test.ts` | Aprovado |
| Exigência e validação de PIN da proprietária para excesso de limite | `customers` / `users` | `src/modules/customers/application/customers.use-case.test.ts` | Aprovado |
| Rejeição de autorização com PIN incorreto ou perfil não-proprietária | `customers` / `users` | `src/modules/customers/application/customers.use-case.test.ts` | Aprovado |
| Trilha de auditoria da liberação de limite excepcional | `customers` / `audit` | `src/modules/customers/application/customers.use-case.test.ts` | Aprovado |
| Quitação de fiado vinculada a caixa aberto ativo com DEBT_PAYMENT | `customers` / `cash` | `src/modules/customers/application/customers.use-case.test.ts` | Aprovado |
| Rejeição de quitação de fiado sem sessão de caixa aberta | `customers` / `cash` | `src/modules/customers/application/customers.use-case.test.ts` | Aprovado |
| Rejeição de quitação com valor superior à dívida em aberto | `customers` | `src/modules/customers/application/customers.use-case.test.ts` | Aprovado |
| Trilha de auditoria imutável de quitação de dívida | `customers` / `audit` | `src/modules/customers/application/customers.use-case.test.ts` | Aprovado |
| Enfileiramento seguro de venda em dinheiro no modo offline | `frontend` | `src/frontend/lib/offline-sync.test.ts` | Aprovado (15 testes) |
| Isolamento de fila offline por operador e comércio | `frontend` | `src/frontend/lib/offline-sync.test.ts` | Aprovado |
| Replay/sincronização de vendas com chave de idempotência preservada | `frontend` | `src/frontend/lib/offline-sync.test.ts` | Aprovado |
| Detecção de inconsistência de preço/estoque na sincronização | `frontend` | `src/frontend/lib/offline-sync.test.ts` | Aprovado |
| Cálculo de carrinho, desconto autorizado e troco no frontend | `frontend` | `src/frontend/lib/cart-calculator.test.ts` | Aprovado (23 testes) |
| Validação de split payment somando total exato da venda | `frontend` | `src/frontend/lib/cart-calculator.test.ts` | Aprovado |
| Formatação monetária BRL e conversão de input | `frontend` | `src/frontend/lib/formatters.test.ts` | Aprovado (10 testes) |
| Cadastro de operadores pela dona do comércio | `users` | `src/modules/users/application/create-operator.use-case.test.ts` | Aprovado (3 testes) |
| Verificação de PIN da proprietária com bcrypt e papel ROLE_OWNER | `customers` / `users` | `src/modules/customers/infrastructure/bcrypt-owner-pin-verifier.test.ts` | Aprovado (14 testes) |
| Consulta e recuperação de venda por ID | `sales` | `src/modules/sales/application/get-sale-by-id.use-case.test.ts` | Aprovado (3 testes) |
| Rotas de API integradas de vendas e detalhes | `sales` / `api` | `src/app/api/sales/route.test.ts` | Aprovado (21 testes) |
| Rotas de API integradas de clientes, saldo e quitação | `customers` / `api` | `src/app/api/customers/route.test.ts` | Aprovado (12 testes) |
| Auto-cadastro SaaS de múltiplos comércios com isolamento | `users` | `src/modules/users/application/register-merchant.use-case.test.ts` | Aprovado (5 testes) |
| Rota de auto-cadastro SaaS POST /api/auth/register | `users` / `api` | `src/app/api/auth/register/route.test.ts` | Aprovado (3 testes) |
| Rate Limiting por IP em rotas críticas com HTTP 429 | `security` | `src/shared/infrastructure/security/rate-limiter.test.ts` | Aprovado (5 testes) |
| Validação de origem estrita anti-CSRF (Origin/Host) | `security` | `src/shared/infrastructure/security/origin-guard.test.ts` | Aprovado (6 testes) |
| Middleware integrado Next.js com limitação granular e headers | `security` | `src/middleware.test.ts` | Aprovado (6 testes) |
| Sangria e Suprimento de caixa com validação de saldo, motivo e auditoria | `cash` | `src/modules/cash/application/cash-operations.use-case.test.ts` | Aprovado (13 testes) |
| Conferência cega com fórmula completa (abertura + vendas + fiado + suprimentos - sangrias - estornos) | `cash` | `src/modules/cash/application/cash-operations.use-case.test.ts` | Aprovado |
| Cancelamento de venda autenticado por PIN da dona e estorno atômico de estoque (RETURN) e caixa (CASH_CANCEL) | `sales` | `src/modules/sales/application/cancel-sale.use-case.test.ts` | Aprovado (10 testes) |
| Estorno de fiado com crédito compensatório (CREDIT) no extrato do cliente | `sales` / `customers` | `src/modules/sales/application/cancel-sale.use-case.test.ts` | Aprovado |
| Rejeição de cancelamento para vendas já canceladas, pendentes ou caixa insuficiente | `sales` | `src/modules/sales/application/cancel-sale.use-case.test.ts` | Aprovado |
| Métricas globais de fiado na praça com total em aberto, quitado histórico e devedores | `customers` | `src/modules/customers/application/get-credit-metrics.use-case.test.ts` | Aprovado (3 testes) |
| Isolamento multi-tenant absoluto nas métricas financeiras de fiado | `customers` | `src/modules/customers/application/get-credit-metrics.use-case.test.ts` | Aprovado |
| Formatação de cupom térmico e canhoto de fiado (58mm e 80mm) com confissão de dívida | `frontend` | `src/frontend/lib/thermal-printer.test.ts` | Aprovado (5 testes) |
| Rota HTTP POST /api/cash/withdrawal com Zod, autenticação e erros de gaveta | `cash` / `api` | `src/app/api/cash/withdrawal/route.test.ts` | Aprovado (6 testes) |
| Rota HTTP POST /api/cash/deposit com Zod, autenticação e cálculo de saldo esperado | `cash` / `api` | `src/app/api/cash/deposit/route.test.ts` | Aprovado (5 testes) |
| Rota HTTP POST /api/sales/[id]/cancel com PIN da dona, estorno e Zod | `sales` / `api` | `src/app/api/sales/[id]/cancel/route.test.ts` | Aprovado (8 testes) |
| Rota HTTP GET /api/customers/metrics com consolidação de fiado na praça | `customers` / `api` | `src/app/api/customers/metrics/route.test.ts` | Aprovado (2 testes) |
| Linha de produto por peso arredondada ao centavo; soma das linhas igual ao total | `shared` | `src/shared/domain/product-unit.test.ts` | Aprovado (8 testes) |
| Venda por peso: baixa em gramas, venda mista e peso acima do estoque (seção 4.11) | `sales` | `src/modules/sales/application/create-sale.use-case.test.ts` | Aprovado |
| Peso digitado no PDV: só dígitos são gramas, com vírgula são quilos | `frontend` | `src/frontend/pdv/weight-input.test.ts` | Aprovado (4 testes) |
| Estoque de produto por peso: limite de estoque baixo em gramas, valor em estoque e entradas em quilos | `frontend` | `src/frontend/management/stock-unit.test.ts` | Aprovado (6 testes) |
| Controle de estoque opcional: venda sem saldo e sem baixa, com caixa e auditoria mantidos (seção 4.12) | `sales` | `src/modules/sales/application/create-sale.use-case.test.ts` | Aprovado |
| Cancelamento só devolve ao estoque a venda que tirou do estoque | `sales` | `src/modules/sales/application/cancel-sale.use-case.test.ts` | Aprovado |
| Interruptor de estoque: só a dona muda, com auditoria, e sem gravar quando nada muda | `settings` / `api` | `src/modules/settings/application/update-store-settings.use-case.test.ts` | Aprovado (8 testes) |
| Telas e PDV sem saldo, entradas e alertas quando o controle de estoque está desligado | `frontend` | `src/frontend/management/stock-control.test.tsx` | Aprovado (10 testes) |
| Períodos do relatório no horário de Brasília (venda das 22h no dia certo, fim exclusivo, semana de segunda a domingo) | `reports` | `src/modules/reports/domain/report-period.test.ts` | Aprovado (22 testes) |
| Relatório: totais, ticket médio, comparação com o período anterior, fiado e cancelamentos | `reports` | `src/modules/reports/application/get-sales-report.use-case.test.ts` | Aprovado (15 testes) |
| Relatório: consulta no Postgres (fuso, troco fora das formas de pagamento, fiado recebido sem estorno, isolamento entre lojas) | `reports` | `src/modules/reports/infrastructure/drizzle-report-repository.integration.test.ts` | Integração, exige `TEST_DATABASE_URL` (10 testes) |
| Relatório: tela só da dona e exportação em CSV para o Excel | `frontend` / `api` | `src/frontend/management/sales-report.test.ts` | Aprovado (13 testes) |
| Importação em lote: linhas, códigos repetidos, unidade, estoque e tudo-ou-nada | `products` | `src/modules/products/application/import-products.use-case.test.ts` | Aprovado (17 testes) |
| Importação por Excel (`.xlsx`) e acentos de CSV em UTF-8 e Windows-1252 | `frontend` | `src/frontend/management/spreadsheet-to-csv.test.ts` | Aprovado (6 testes) |
| Importação: gravação de produtos, estoque, movimento e auditoria numa transação | `products` | `src/modules/products/infrastructure/drizzle-product-import-store.integration.test.ts` | Integração, exige `TEST_DATABASE_URL` (4 testes) |
| Busca de produto pelo nome no campo do código de barras (Enter, setas, Esc) | `frontend` | `src/frontend/pdv/product-search.test.ts` | Aprovado (8 testes) |
| Cancelar venda finalizada no PDV: lista de hoje, PIN, motivo e Esc sem limpar a venda | `frontend` | `src/frontend/pdv/cancel-sale.test.tsx` | Aprovado (11 testes) |
| Vendas de hoje no horário de Brasília, mais recentes primeiro | `sales` | `src/modules/sales/application/list-recent-sales.use-case.test.ts` | Aprovado (3 testes) |
| Bipador no cadastro de produto: confere o código e avisa se já existe | `frontend` | `src/frontend/management/barcode-check.test.ts` | Aprovado (8 testes) |
| App instalável: manifesto, ícones que existem com o tamanho declarado e favicon preservado | `app` | `src/app/manifest.test.ts` | Aprovado (7 testes) |
| Versão do `package.json` igual à última do CHANGELOG | `shared` | `src/shared/version.test.ts` | Aprovado (5 testes) |
| Avisos somem sozinhos em 2 segundos, sem um aviso antigo apagar um novo | `frontend` | `src/frontend/lib/use-auto-dismiss.test.ts` | Aprovado (6 testes) |
| Sair apaga o cookie `__Host-` com `Secure` e `Path=/` | `shared` | `src/shared/infrastructure/auth/auth-context.test.ts` | Aprovado (3 testes) |
| Tema só claro: nenhuma regra de tema escuro | `app` | `src/app/globals-tokens.test.ts` | Aprovado (2 testes) |

**Total de Testes Automatizados:** 620 testes aprovados (83 suítes no Vitest, 0 falhas), mais 39 testes de integração com Postgres (7 arquivos) que rodam quando há `TEST_DATABASE_URL`. O CI roda todos eles, com `npm run test:integration`. Contagem conferida em 09/11/2026.
