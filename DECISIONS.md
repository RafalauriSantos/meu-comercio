# Registro de Decisões — Meu Comércio

Este documento é a **fonte oficial da verdade** para as **regras de negócio** do projeto **Meu Comércio**. Qualquer alteração de comportamento deve ser documentada aqui antes de ser refletida no código. Os registros de arquitetura (ADRs) ficam em `docs/DECISIONS.md`. Os ADRs explicam decisões técnicas e não definem regras de negócio. Se houver conflito, esta regra prevalece.

---

## 2026-10-31 — Fundação do Projeto Meu Comércio (Monólito Modular no Next.js + Neon)

- **Identidade e Propósito**: O projeto é batizado como **Meu Comércio**, um sistema SaaS multi-tenant para pequenos e médios varejistas e mercados de bairro.
- **Arquitetura**: Monólito Modular desacoplado (Hexagonal / Ports & Adapters) desenvolvido em TypeScript.
- **Infraestrutura**: Plataforma Vercel com Next.js (App Router) para frontend e rotas de API, e Neon (PostgreSQL Serverless) para persistência.
- **Camada de Dados**: Drizzle ORM integrado ao driver `@neondatabase/serverless`. As regras de negócio não dependem do Drizzle nem da Vercel; a persistência é isolada atrás de interfaces de repositório (Ports).
- **Tratamento de Dinheiro**: É expressamente proibido o uso de `number` de ponto flutuante diretamente para valores monetários. Todo dinheiro é manipulado pelo Value Object `Money`, armazenando centavos inteiros (`cents` / `bigint`) com precisão arbitrária e arredondamento comercial *half-up*.
- **Padrão de Código**: Módulos organizados por capacidade de negócio em `src/modules/*`, contendo suas próprias camadas de `domain`, `application` e `infrastructure`.

---

## Regras de Negócio Consolidadas (Herdadas e Aprovadas)

### 1. Dinheiro e Finanças
- Dinheiro usa precisão exata. Registros financeiros (vendas, movimentações de caixa, pagamentos) **nunca são deletados fisicamente**.
- Descontos só são permitidos com autorização explícita da proprietária informando usuário e PIN rápido. *Pendente de implementação: a API de vendas aceita desconto sem checar a dona (`src/app/api/sales/route.ts`).*
- Pagamentos divididos (*split payments*) são permitidos, desde que a soma dos métodos cubra o valor total da venda.
- Dinheiro recebido e troco são calculados e registrados explicitamente na venda.

### 2. Caixa e Turnos
- Uma sessão de caixa representa um turno do comércio; **só pode haver uma sessão aberta por comércio (`merchant_id`) por vez**.
- O operador autorizado que abre o turno é o responsável por fechá-lo. A proprietária pode fechar qualquer sessão aberta.
- Na troca de turno, o caixa deve ser fechado com o valor contado (conferência cega); divergências entre o valor esperado e o valor contado devem ser registradas na auditoria com justificativa obrigatória.
- Quitação de fiado em dinheiro é registrada automaticamente como entrada de suprimento/recebimento no caixa aberto.

### 3. Estoque
- **Venda com estoque negativo não é permitida**. O sistema bloqueia vendas de itens sem saldo disponível.
- Reposições manuais de estoque exigem autenticação e geram registro de movimentação e auditoria.

### 4. Clientes e Fiado
- Clientes são identificados por nome e telefone.
- Cada cliente possui um limite de fiado definido pela proprietária. Vendas que excedam o limite exigem autorização pontual da proprietária via PIN.

### 5. Usuários e Autorizações
- Dois papéis iniciais: **Proprietária** e **Operador**.
- Cada operador possui usuário individual, senha e um PIN de 4 dígitos para autorizações rápidas no balcão. *Pendente de implementação: não há validador de PIN de operador no código.*
- A proprietária possui PIN de autorização de **6 dígitos** (D-02, 2026-11-05). *Pendente de implementação: ainda aceitam de 4 a 6 dígitos o PIN da proprietária em `RegisterMerchantSchema`, `InitialOwnerSetupSchema`, na rota de cancelamento (`src/app/api/sales/[id]/cancel/route.ts`), no setup de `src/app/login/page.tsx`, no rótulo e na checagem `ownerPin.length < 4` do PDV (`src/app/page.tsx`), e na validação e rótulo de cancelamento em `src/app/gestao/page.tsx`.*
- Operadores não possuem e-mail; recuperação de senha de operadores é realizada diretamente pela proprietária.
- A proprietária informa e-mail no setup inicial para recuperação de senha única via token criptográfico com expiração de 15 minutos.
- Bloqueio temporário de conta após tentativas consecutivas de login inválidas.

### 6. Temporalidade e Auditoria
- Todos os registros no banco de dados utilizam data/hora em **UTC (`TIMESTAMPTZ`)**.
- Relatórios operacionais e fechamento diário consideram o fuso do comércio (`America/Sao_Paulo` por padrão).
- Operações sensíveis gravam trilha de auditoria contendo autorizador, motivo, timestamp e referência da transação.

### 7. Idempotência
- Endpoints de finalização de venda e recebimento de webhooks exigem chave de idempotência (`Idempotency-Key` ou identificador único do evento), impedindo cobrança ou baixa duplicada por retentativas de rede. *Pendente: não existe rota de webhook no código.*
- Toda escrita que movimenta dinheiro exige `Idempotency-Key` (venda, cancelamento, sangria, suprimento, fiado, quitação) (D-05, 2026-11-05). *Pendente: a API de venda trata a chave como opcional; sangria, suprimento, cancelamento e quitação não têm chave.*

---

## Decisões de produto registradas em 2026-11-05

Respostas do dono às perguntas da auditoria. Estas decisões prevalecem sobre texto anterior deste arquivo.

- **D-01** Desconto exige usuário e PIN da proprietária, validados no servidor.
- **D-02** PIN da proprietária: 6 dígitos. Operador: 4 dígitos (D-03).
- **D-03** Operadores têm PIN de 4 dígitos. *Pendente de implementação: não há validador de PIN de operador no código.*
- **D-04** Operador com caixa aberto pode fazer sangria e suprimento, com motivo, sem PIN da dona.
- **D-05** `Idempotency-Key` obrigatória em toda escrita que movimenta dinheiro. Pareceres de revisão ficam em `docs/reviews/`. *Pendente: chave opcional na venda e ausente nas demais escritas; a pasta `docs/reviews/` é criada pela primeira revisão.*
- **D-06** Permissões individuais por operador ficam fora do MVP.
- **D-07** Contas de demonstração são removidas da produção. *Pendente: não há código a verificar; a remoção precisa ser confirmada no banco de produção.*
- **D-08** O Brevo envia o e-mail de recuperação de PIN e senha da proprietária. *Pendente de implementação.*
- **D-09** A sessão de login dura até o caixa ser fechado, com revalidação do usuário em cada escrita sensível. Limite máximo pela D-16. *Pendente: a sessão hoje dura 30 minutos fixos (`src/shared/infrastructure/auth/auth-context.ts`); não há revalidação por escrita.*
- **D-10** Os contadores de rate limit ficam em uma tabela do Neon. *Pendente: hoje ficam em memória.*
- **D-11** Pagamentos divididos não entram na fila offline. A limitação fica documentada.
- **D-12** Interface em pt-BR. Código, comentários, erros de desenvolvimento, documentação e commits em inglês.
- **D-13** Relatórios e fechamento diário usam `America/Sao_Paulo`. *Pendente de implementação.*
- **D-14** Fiado no PDV gera uma venda com pagamento do tipo `TAB`. *Pendente de implementação: o PDV não envia venda; `TAB` não existe em `PaymentMethod`.*
- **D-15** Aviso persistente quando o caixa está aberto há 8 horas. Fica até o fechamento. *Pendente de implementação.*
- **D-16** Tempo máximo de sessão: 12 horas por padrão, mesmo com caixa aberto. A dona pode alterar entre 1 e 24 horas. *Leitura consolidada com D-09: a sessão dura até o caixa fechar, com teto de 12 horas configurável pela dona. Pendente: não existe configuração da dona e o cookie dura 30 minutos (`auth-context.ts`).*
- **D-17** O aviso de 8 horas apenas avisa. Nunca bloqueia vendas. *Pendente de implementação.*
