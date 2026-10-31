# Matriz de Rastreabilidade — Meu Comércio

Mapeamento entre os critérios de negócio aprovados em `DECISIONS.md` e a suíte de testes automatizados.

| Critério de Negócio | Módulo | Arquivo de Teste | Status |
|---|---|---|---|
| Dinheiro exato sem ponto flutuante | `shared` | `src/shared/domain/money.test.ts` | Aprovado (11 testes) |
| Multiplicação por peso de balança de mercado | `shared` | `src/shared/domain/money.test.ts` | Aprovado |
| Provisionamento único da proprietária | `users` | `src/modules/users/application/initial-owner-setup.use-case.test.ts` | Aprovado (3 testes) |
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
| Validação de caixa aberto obrigatório para venda | `sales` / `cash` | `src/modules/sales/application/create-sale.use-case.test.ts` | Aprovado (23 testes) |
| Verificação e baixa atômica de estoque na venda | `sales` / `inventory` | `src/modules/sales/application/create-sale.use-case.test.ts` | Aprovado |
| Cálculo de total, desconto e troco com Money | `sales` / `shared` | `src/modules/sales/application/create-sale.use-case.test.ts` | Aprovado |
| Split payments múltiplos com validação de cobertura total | `sales` | `src/modules/sales/application/create-sale.use-case.test.ts` | Aprovado |
| Registro automático de entrada de dinheiro no caixa aberto | `sales` / `cash` | `src/modules/sales/application/create-sale.use-case.test.ts` | Aprovado |
| Idempotência com rejeição de chave duplicada | `sales` | `src/modules/sales/application/create-sale.use-case.test.ts` | Aprovado |
| Registro imutável de auditoria da venda confirmada | `sales` / `audit` | `src/modules/sales/application/create-sale.use-case.test.ts` | Aprovado |
| Criação de cliente com telefone único e limite de crédito | `customers` | `src/modules/customers/application/customers.use-case.test.ts` | Aprovado (16 testes) |
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


