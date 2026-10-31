# Registro de Decisões — Meu Comércio

Este documento é a **fonte oficial da verdade** para as decisões de negócio e arquitetura aprovadas no projeto **Meu Comércio**. Qualquer alteração de comportamento deve ser documentada aqui antes de ser refletida no código.

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
- Descontos só são permitidos com autorização explícita da proprietária informando usuário e PIN rápido.
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
- Cada operador possui usuário individual, senha e um PIN de 4 dígitos para autorizações rápidas no balcão.
- Operadores não possuem e-mail; recuperação de senha de operadores é realizada diretamente pela proprietária.
- A proprietária informa e-mail no setup inicial para recuperação de senha única via token criptográfico com expiração de 15 minutos.
- Bloqueio temporário de conta após tentativas consecutivas de login inválidas.

### 6. Temporalidade e Auditoria
- Todos os registros no banco de dados utilizam data/hora em **UTC (`TIMESTAMPTZ`)**.
- Relatórios operacionais e fechamento diário consideram o fuso do comércio (`America/Sao_Paulo` por padrão).
- Operações sensíveis gravam trilha de auditoria contendo autorizador, motivo, timestamp e referência da transação.

### 7. Idempotência
- Endpoints de finalização de venda e recebimento de webhooks exigem chave de idempotência (`Idempotency-Key` ou identificador único do evento), impedindo cobrança ou baixa duplicada por retentativas de rede.
