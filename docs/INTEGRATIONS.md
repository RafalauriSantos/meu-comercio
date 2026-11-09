# Plano: maquininhas de cartão e notas fiscais

Este documento planeja como o Meu Comércio vai falar com **maquininhas** e emitir **notas fiscais**. É um plano, não uma
decisão: o que depende da maquininha que a dona usa, do estado e do regime tributário da loja está marcado como
**pergunta** no fim. Os itens do backlog são a Slice 10 (maquininha) e a Slice 15 (nota fiscal) em `docs/BACKLOG.md`.

> **O que é fato e o que não é.** A parte do Mercado Pago Point e a descrição de emissores de NFC-e vêm de páginas dos
> próprios fornecedores (links no fim), lidas em novembro de 2026. Preços, prazos e regras fiscais **mudam**: antes de
> escolher um fornecedor, confirmar na documentação dele e **com o contador da loja**. Nada aqui foi testado com um
> equipamento ou com a SEFAZ.

## Princípios (valem para as duas integrações)

1. **O app nunca toca em dados de cartão.** Quem lê o cartão é a maquininha. O app só manda o valor e recebe o
   resultado. Assim o app fica fora do escopo de segurança de cartão (PCI).
2. **Porta e adaptador.** Cada integração é uma interface no domínio (`PaymentTerminalPort`, `FiscalDocumentIssuer`) com
   um adaptador por fornecedor, como já fazemos com os repositórios. Trocar de fornecedor é trocar o adaptador.
3. **Resultado assíncrono e idempotente.** Pagar e emitir nota levam segundos e podem falhar no meio. Cada tentativa tem
   um identificador próprio, um estado (`PENDENTE`, `APROVADO`, `RECUSADO`, `CANCELADO`, `ERRO`) e nunca cobra ou emite duas
   vezes a mesma venda.
4. **O modo manual continua existindo.** Se a maquininha ou o emissor ficarem fora do ar, o caixa não pode parar. Hoje o
   operador registra a forma de pagamento à mão; isso continua sendo o plano B.
5. **Tudo auditado**, com a mesma trilha de `audit_events`, e **uma credencial por loja** (o app é multi-loja), guardada
   cifrada e nunca no código.
6. **Mudança de banco em PR própria**, com a aprovação da dona, como manda o `docs/PROJECT_WORKFLOW.md`.

---

## 1. Maquininhas (Slice 10)

### O que existe no mercado

| Caminho | Como funciona | Quando serve |
| --- | --- | --- |
| **API na nuvem do adquirente** | O app cria a cobrança por API; o valor aparece na maquininha; o resultado volta por *webhook* e por consulta de status. | Maquininhas "smart" (Mercado Pago Point, e as equivalentes da Stone, PagBank, Cielo, Rede, Getnet). **Caminho recomendado.** |
| **TEF / SDK local** | Um programa instalado no computador do caixa conversa com a maquininha por cabo ou rede. | Lojas grandes, com muitas bandeiras. Pesado de instalar e manter. Não para agora. |
| **Pix por um banco/PSP** | O app gera um QR Code dinâmico e recebe a confirmação por webhook. | Pix sem maquininha. Dá para fazer à parte, antes ou depois do cartão. |
| **Manual (o que temos)** | O operador escolhe a forma de pagamento e digita. | Plano B sempre disponível. |

**O que a pesquisa confirmou (Mercado Pago Point):** a integração por API cria uma *intenção de pagamento* que aparece
na maquininha e devolve o resultado por notificações (webhooks); o endereço que recebe as notificações precisa ser
**público**; a Point processa o pagamento localmente, então a documentação recomenda **consultar o status** além de
esperar o webhook; a API antiga está sendo trocada pela **API Orders**, que deve ser a usada em integrações novas; e a
integração é gratuita para o cliente e para quem desenvolve. **Não confirmei** a documentação da Stone, Cielo, PagBank,
Rede ou Getnet: cada uma tem a sua e precisa ser lida antes de decidir.

### Como encaixa no app

- **Módulo novo `src/modules/payments`** com a porta `PaymentTerminalPort`: `criarCobranca(valor, chave)`,
  `consultar(cobranca)` e `cancelar(cobranca)`. Um adaptador por adquirente.
- **Tabela nova `payment_attempts`** (migração): loja, venda, fornecedor, referência do fornecedor, valor, forma
  (débito, crédito, Pix), parcelas, estado, **NSU/TID e código de autorização** (o comprovante da operadora), bandeira,
  datas. É a prova de cada cobrança, aprovada ou não.
- **Fluxo no PDV:** a dona escolhe cartão → o app cria a tentativa e manda o valor para a maquininha → mostra
  "Aguardando a maquininha..." → o resultado chega por webhook (e por consulta a cada poucos segundos) → se
  **aprovado**, vira o pagamento da venda e a venda fecha; se **recusado** ou expirado, volta para escolher outra forma.
  Um botão "Cancelar cobrança" desfaz a tentativa pendente.
- **Webhook público** em `/api/webhooks/<fornecedor>`, que **valida a assinatura** do fornecedor antes de confiar em
  qualquer coisa, e é idempotente (receber duas vezes o mesmo aviso não muda nada).
- **Sem internet:** cartão e Pix já exigem internet no app hoje; isso continua. Com a maquininha fora do ar, o
  operador usa o modo manual e digita o NSU do comprovante, para a venda ficar conciliável depois.
- **Conciliação:** um relatório diário compara as vendas em cartão do app com o que o adquirente informa. Divergência
  aparece para a dona. Depende do adquirente oferecer uma consulta de transações.

### Fases

| Fase | O que entrega | Precisa de |
| --- | --- | --- |
| **0. Decisão** | Escolher o adquirente (o que a dona já usa), conta de desenvolvedor, taxas | Respostas às perguntas abaixo |
| **1. Prova de conceito** | Cobrar 1 débito e 1 crédito em ambiente de teste do fornecedor | Credenciais de teste |
| **2. Piloto** | Uma loja usando em produção, com o modo manual de reserva | Aprovação da dona |
| **3. Conciliação** | Relatório diário de divergências | Fase 2 estável |

---

## 2. Notas fiscais (Slice 15)

### O que emitir

- **NFC-e** (nota fiscal de consumidor eletrônica) é a nota do **varejo para o consumidor final**: é a que o PDV emite.
- **NF-e** é para vendas entre empresas; não é o foco.
- Em alguns estados ainda existe o **SAT/MF-e**. Qual vale **depende do estado**: perguntar ao contador.
- **O cupom de hoje é não fiscal** e continua assim até a NFC-e entrar.

### Como se faz: um emissor por API, não falar direto com a SEFAZ

Falar direto com a SEFAZ de cada estado (XML, assinatura digital, regras que mudam) é trabalho grande e arriscado. O
caminho comum é **contratar um emissor com API REST**, que cuida da comunicação com a SEFAZ e das atualizações de regra.
Os nomes que apareceram na pesquisa: **Focus NFe** (a página dele descreve NFC-e com emissão, cancelamento,
consulta, reenvio, inutilização e **contingência offline**, e envio por e-mail ao cliente), PlugNotas, TecnoSpeed,
eNotas, Nuvem Fiscal, NFe.io e Notaas. Só li material de propaganda: **comparar preço, suporte a NFC-e no estado da loja,
contingência e como cada um guarda o certificado digital**.

### O que a loja precisa ter (o contador confirma)

- CNPJ, **inscrição estadual** e **regime tributário** (MEI, Simples Nacional, lucro presumido). A obrigatoriedade da
  NFC-e para MEI **varia por estado**.
- **Certificado digital A1** da empresa (ou o emissor guarda, conforme o contrato).
- **CSC e ID do CSC** (a senha da SEFAZ para o QR Code da NFC-e) e o **credenciamento** da empresa para emitir NFC-e.
- **Cadastro fiscal de cada produto:** NCM, CFOP, CEST (quando houver), origem, situação tributária (CSOSN/CST) e
  alíquotas. Hoje o cadastro tem só nome, preço, código de barras e unidade. A unidade (`UN` ou `KG`) já ajuda: a nota
  precisa dela.
- A tabela de **forma de pagamento** da nota foi ampliada por um informe técnico da SEFAZ em 2024; o emissor atualiza,
  mas o mapeamento de pagamentos do app precisa seguir.

### Como encaixa no app

- **Módulo novo `src/modules/fiscal`** com a porta `FiscalDocumentIssuer`: `emitir(venda)`, `consultar`, `cancelar`.
  Um adaptador por emissor.
- **Mudanças de banco (PRs próprias):** campos fiscais em `products` e uma tabela `fiscal_documents` (venda, tipo,
  estado, número, série, **chave de acesso**, protocolo, link do XML e do QR Code, mensagem de erro).
- **A emissão não pode travar o caixa.** A venda fecha primeiro; a nota é emitida logo depois, em segundo plano, com
  nova tentativa automática. Estados: `PENDENTE`, `AUTORIZADA`, `REJEITADA`, `CONTINGÊNCIA`, `CANCELADA`. Nota rejeitada
  (por exemplo, NCM errado) aparece para a dona corrigir e reenviar.
- **Cancelamento:** a NFC-e só pode ser cancelada dentro de um prazo definido pela SEFAZ; cancelar uma venda no app
  passa a cancelar a nota também, quando ainda der.
- **Impressão:** o cupom ganha os dados da nota e o **QR Code**; o cupom não fiscal passa a ser o DANFE NFC-e.
- **Credenciais por loja**, cifradas, e o app **nunca registra** o certificado nem o CSC em log.
- **Relatórios:** a nota entra nos relatórios de venda (Slice 14) como "com nota" / "sem nota".

### Fases

| Fase | O que entrega | Precisa de |
| --- | --- | --- |
| **0. Contador** | Dizer se a loja é obrigada, qual regime e quais dados fiscais usar | Reunião com o contador |
| **1. Cadastro fiscal** | NCM e demais campos nos produtos, inclusive na importação em lote | Fase 0 |
| **2. Homologação** | Emitir notas no **ambiente de testes** da SEFAZ, sem valor | Emissor escolhido, certificado de teste |
| **3. Produção piloto** | Uma loja emitindo de verdade, com o botão de "emitir sem nota" fechado | Aprovação da dona e do contador |
| **4. Cancelamento e contingência** | Cancelar, inutilizar e emitir sem internet | Fase 3 |

---

## Riscos e custos

- **Custo recorrente:** emissores e adquirentes costumam cobrar mensalidade ou por nota; as taxas da maquininha também
  contam. Levantar antes de escolher.
- **Regras fiscais mudam** (informes técnicos da SEFAZ): por isso um emissor terceirizado, que acompanha as mudanças.
- **Dinheiro e dados sensíveis:** as duas integrações mexem com dinheiro; cada PR entra pela regra do projeto (aprovação
  da dona). CPF na nota é opcional e cai na LGPD.
- **Não trocar de maquininha por causa do software.** A integração deve seguir a maquininha que a dona já tem.

## Perguntas para a dona e para o contador

**Maquininha**
1. Qual maquininha e qual operadora a loja usa hoje (Mercado Pago, Stone, PagBank, Cielo, Rede, Getnet...)?
2. É modelo "smart" (com tela, tipo Point Smart)? Aceita Pix?
3. Quanto de venda passa por cartão em um dia comum?

**Nota fiscal**
4. A loja é MEI, Simples Nacional ou outro regime? Em qual estado e cidade?
5. Hoje a loja emite nota? Por qual sistema? Há certificado digital A1?
6. O contador sabe o NCM dos produtos? Quem vai manter esse cadastro?
7. A loja quer emitir nota em **toda** venda ou só quando o cliente pede?

## Fontes lidas (material de fornecedores; conferir antes de decidir)

- Mercado Pago, [integrar a Point Smart ao sistema de gestão (PDV)](https://www.mercadopago.com.br/blog/integrar-point-smart-sistema-pdv)
  e [documentação de integração com PDV](https://www.mercadopago.com.br/developers/pt/docs/mp-point-legacy/integration-configuration/integrate-with-pdv/introduction)
- Focus NFe, [NFC-e](https://focusnfe.com.br/produtos/nota-fiscal-consumidor-nfce/) e
  [NF-e e NFC-e: quem deve emitir qual tipo](https://focusnfe.com.br/blog/nf-e-e-nfc-e-quem-deve-emitir-qual-tipo-de-nota/)
- Omie, [NFC-e ou NF-e: quando emitir cada documento no PDV](https://www.omie.com.br/blog/nfc-e-ou-nf-e-quando-emitir-cada-documento-no-pdv/)
- NFe.io, [como emitir NFC-e](https://nfe.io/blog/nota-fiscal/como-emitir-nfc-e/)
