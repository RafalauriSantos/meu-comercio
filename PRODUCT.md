# Visão do Produto — Meu Comércio

## Objetivo

Construir um Ponto de Venda (PDV) e sistema operacional rápido, confiável e descomplicado para o dia a dia de pequenos e médios varejistas (mercados, empórios, mercearias e padarias).

O sistema elimina retrabalho, previne furos de estoque e quebras de caixa, e permite à proprietária acompanhar os números do negócio com total transparência e segurança.

## Personas e Papéis

### 1. Proprietária (Dona da Loja)
- Possui controle irrestrito sobre o comércio.
- Configura operadores. Permissões individuais estão fora do MVP (D-06).
- Autoriza operações críticas no balcão mediante confirmação do PIN da proprietária de 6 dígitos (descontos, estornos, quebras de caixa, fiado acima do limite). Descontos exigem usuário e PIN da proprietária (D-01). Operadores usam PIN de 4 dígitos (ver `DECISIONS.md`, D-02 e D-03). *Pendente de implementação: os validadores ainda aceitam 4 a 6 dígitos para a proprietária, não há validador de PIN de operador, e descontos ainda não exigem o PIN da dona.*
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
- [x] Autenticação, sessão de servidor segura e gestão de operadores
- [x] Catálogo de produtos com leitura de código de barras e precificação
- [x] Controle de estoque com bloqueio estrito de saldo negativo (no domínio; sem `CHECK` no banco)
- [x] Abertura e fechamento de turno de caixa com conferência cega
- [ ] Fluxo de checkout com troco, split payments e chave de idempotência (parcial: venda fiado no PDV e chave de idempotência da interface pendentes)
- [x] Cadastro de clientes e gestão de limite de fiado
- [x] Trilha de auditoria imutável para ações sensíveis
- [ ] Relatórios de vendas e conciliação por método de pagamento
