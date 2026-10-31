# Visão do Produto — Meu Comércio

## Objetivo

Construir um Ponto de Venda (PDV) e sistema operacional rápido, confiável e descomplicado para o dia a dia de pequenos e médios varejistas (mercados, empórios, mercearias e padarias).

O sistema elimina retrabalho, previne furos de estoque e quebras de caixa, e permite à proprietária acompanhar os números do negócio com total transparência e segurança.

## Personas e Papéis

### 1. Proprietária (Dona da Loja)
- Possui controle irrestrito sobre o comércio.
- Configura operadores e permissões individuais (`CREATE_SALE`, `OPEN_CASH`, `CLOSE_CASH`).
- Autoriza operações críticas no balcão mediante confirmação de senha ou PIN rápido de 4 dígitos (descontos, estornos, quebras de caixa, fiado acima do limite).
- Acessa relatórios diários de vendas, faturamento por forma de pagamento, conferência de caixa e estoque baixo.

### 2. Operador de Caixa
- Opera o atendimento diário no balcão de forma ágil e intuitiva.
- Abre e fecha seu próprio turno de caixa.
- Passa itens rapidamente pelo leitor de código de barras ou busca por nome.
- Registra pagamentos em dinheiro com cálculo automático de troco, cartão e Pix.
- Em caso de queda momentânea de internet, vendas em dinheiro são enfileiradas e sincronizadas assim que a conexão retornar.

## Escopo do MVP

- [x] Fundação da arquitetura em Monólito Modular (Next.js + Neon + Vercel)
- [x] Primitiva de precisão monetária (`Money` Value Object)
- [ ] Autenticação, sessão de servidor segura e gestão de operadores
- [ ] Catálogo de produtos com leitura de código de barras e precificação
- [ ] Controle de estoque com bloqueio estrito de saldo negativo
- [ ] Abertura e fechamento de turno de caixa com conferência cega
- [ ] Fluxo de checkout com troco, split payments e chave de idempotência
- [ ] Cadastro de clientes e gestão de limite de fiado
- [ ] Trilha de auditoria imutável para ações sensíveis
- [ ] Relatórios de vendas e conciliação por método de pagamento
