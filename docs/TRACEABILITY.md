# Matriz de Rastreabilidade — Meu Comércio

Mapeamento entre os critérios de negócio aprovados em `DECISIONS.md` e a suíte de testes automatizados.

| Critério de Negócio | Módulo | Arquivo de Teste | Status |
|---|---|---|---|
| Dinheiro exato sem ponto flutuante | `shared` | `src/shared/domain/money.test.ts` | Aprovado (9 testes) |
| Multiplicação por peso de balança de mercado | `shared` | `src/shared/domain/money.test.ts` | Aprovado |
| Provisionamento único da proprietária | `users` | `src/modules/users/application/initial-owner-setup.use-case.test.ts` | Aprovado (3 testes) |
| Hashing de senha e PIN via bcrypt | `users` | `src/modules/users/application/initial-owner-setup.use-case.test.ts` | Aprovado |
| Autenticação e bloqueio após 5 tentativas | `users` | `src/modules/users/application/authenticate-user.use-case.test.ts` | Aprovado (4 testes) |
| Bloqueio de operadores desativados | `users` | `src/modules/users/application/authenticate-user.use-case.test.ts` | Aprovado |
| Assinatura de sessão e proteção contra timing attack | `shared` | `src/shared/infrastructure/auth/session.test.ts` | Aprovado (3 testes) |
| Abertura de caixa com fundo de troco | `cash` | `src/modules/cash/application/cash-session.use-case.test.ts` | Aprovado (6 testes) |
| Apenas uma sessão aberta por comércio | `cash` | `src/modules/cash/application/cash-session.use-case.test.ts` | Aprovado |
| Conferência cega e fechamento regular | `cash` | `src/modules/cash/application/cash-session.use-case.test.ts` | Aprovado |
| Justificativa compulsória para quebra de caixa | `cash` | `src/modules/cash/application/cash-session.use-case.test.ts` | Aprovado |
| Fechamento por operador diferente não autorizado | `cash` | `src/modules/cash/application/cash-session.use-case.test.ts` | Aprovado |
| Fechamento de qualquer turno pela proprietária | `cash` | `src/modules/cash/application/cash-session.use-case.test.ts` | Aprovado |
| Trilha de auditoria em abertura/fechamento | `cash` / `audit` | `src/modules/cash/application/cash-session.use-case.test.ts` | Aprovado |
