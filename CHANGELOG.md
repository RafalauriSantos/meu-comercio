# Changelog

Todas as mudanças importantes do Meu Comércio ficam registradas aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o
[Versionamento Semântico](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`). As regras de como e quando
lançar uma versão estão em `docs/PROJECT_WORKFLOW.md`.

## [Não lançado]

### Adicionado

- **Extrato do cliente** (Clientes e Fiado, para a proprietária e para a operadora): botão "Extrato" que abre um painel com as compras no fiado, os pagamentos e os estornos, com o saldo depois de cada movimento, o operador e a data em horário de Brasília.
- **Excluir e restaurar produto e cliente** (só a proprietária): "excluir" esconde o item do caixa, da busca e das listas, mas guarda o histórico de vendas e de fiado; o filtro "Excluídos" mostra o que foi excluído, com o botão "Restaurar". Um cliente só pode ser excluído com a dívida zerada e com o PIN da proprietária.
- **Novo cliente em painel lateral**, com o botão "Salvar cliente" sempre visível e o telefone com máscara.
- **Clientes e Fiado com novo layout:** faixa de resumo (fiado na rua, clientes devendo, já recebido), busca por nome ou telefone, filtros (Todos, Devendo, Acima do limite), lista no computador e cartões no celular, com selos de situação e o botão Receber.
- **Editar cliente** (só a proprietária): painel lateral para mudar nome, telefone e limite de fiado (até R$ 100.000,00), no mesmo estilo da edição de produto. O telefone passa a ter máscara `(11) 99999-8888` e só aceita número do Brasil; os antigos fora do padrão ganham a marca "Telefone fora do padrão".
- **Bloquear o fiado de um cliente** (só a proprietária): o cliente continua comprando à vista e pagando o que deve, mas não faz novas vendas no fiado, nem com o PIN. Aparece selo na lista e aviso no caixa.
- **Código de barras gerado pelo sistema:** produto cadastrado sem código recebe um de 13 dígitos (começando em 29). Na edição do produto, o botão "Gerar código" troca o código atual por um gerado (a proprietária confirma, porque a etiqueta antiga deixa de valer).
- **Bipar na tela de vendas:** qualquer bipada põe o produto no carrinho, sem clicar antes no campo de busca.
- **Cadastrar produto na venda:** bipar um código que não está cadastrado abre o cadastro com o código preenchido; ao salvar, o produto entra no carrinho. Qualquer pessoa logada pode cadastrar. A operadora só cadastra com preço maior que zero e sem estoque inicial; na tela de vendas o preço maior que zero vale para todas. Editar produto e importar planilha continuam só da proprietária.
- **Editar produto** (nome, preço e código) pela proprietária, com a lista paginada (50 por vez), busca em todos os produtos, painel lateral com animação e aviso de sucesso em verde.
- **Sessão** de 2 horas sem uso (teto de 12 horas): quando expira, a pessoa é levada ao login e volta para a tela de onde saiu, com o carrinho guardado. Falta de internet ou lentidão deixam de derrubar a sessão.
- **Relatório de vendas** na aba "Relatórios" da gestão, só para a proprietária: quanto a loja vendeu hoje, ontem, nesta
  semana, neste mês ou em um período escolhido, com a comparação com o período anterior. Mostra o total, o número de
  vendas e o ticket médio; as formas de pagamento; as vendas por dia; os produtos mais vendidos; as vendas de cada
  operador; o fiado vendido e recebido e as vendas canceladas (fora do total). Pode ser exportado em CSV para o Excel.
  O dia segue o horário de Brasília.
- **Controle de estoque opcional.** A proprietária liga ou desliga o controle de estoque da loja na aba "Catálogo &
  Estoque". Desligado, a venda não exige saldo e não baixa o estoque, e somem da gestão o saldo, as entradas, os
  alertas de estoque baixo e o valor em estoque; o cadastro de produto não pede o estoque inicial e a importação ignora
  a coluna Estoque. As lojas que já existem continuam com o controle ligado. Cancelar uma venda feita com o controle
  desligado não devolve nada ao estoque, porque ela não tirou nada.

### Alterado

- **Importar planilha:** a planilha-modelo para baixar saiu. No lugar, o card mostra um exemplo na tela (só para ver o formato), com a regra do código de barras de verdade; o card só aparece ao clicar em "Importar planilha" e tem o botão "Fechar".
- **Limite de fiado:** o teto passou a ser R$ 500,00, e qualquer aumento de limite (no cadastro ou na edição) pede o PIN da proprietária. A operadora continua cadastrando clientes, sempre com limite R$ 0,00; só a proprietária libera valor.
- **Quitação de fiado** passou a gravar o caixa, o saldo e a auditoria numa operação só, com trava: duas quitações ao mesmo tempo não pagam mais do que a dívida, e uma falha no meio não deixa nada pela metade.
- **Preço do produto** com máscara de centavos (digita 1250 e vira 12,50).

- **Quitar fiado** grava o recebimento no caixa, o abatimento da dívida e a auditoria de uma vez só: se algo falhar, nada fica gravado, e duas quitações ao mesmo tempo não passam do que o cliente deve. Mensagens e telas não mudam.

- **Cancelar venda finalizada** saiu da gestão e foi para a tela de vendas (PDV), ao lado de Sangria e Suprimento. Em vez
  de digitar o código da venda, a pessoa escolhe a venda na lista das vendas de hoje (hora, valor e produtos). O PIN da
  proprietária e o motivo continuam obrigatórios.

## [0.1.0] - 2026-11-09

Primeira versão do app, em produção em <https://meucomercio.vercel.app>.

### Adicionado

- **Página inicial** (landing) e telas de **entrar** e **criar conta**, sempre no tema claro.
- **Caixa:** abertura com fundo de troco, fechamento com conferência cega e justificativa de divergência,
  sangria e suprimento.
- **PDV (venda):**
  - leitura de código de barras com o bipador, ou digitação do código;
  - busca de produto pelo nome no mesmo campo;
  - pagamento em dinheiro (com troco), Pix, débito, crédito e fiado, inclusive dividido em mais de uma forma;
  - venda a fiado com PIN da proprietária quando o limite do cliente é ultrapassado;
  - atalhos de teclado e venda simples em dinheiro quando está sem internet.
- **Produto vendido por peso** (mussarela, mortadela): preço por quilo, peso digitado na hora da venda e
  estoque em gramas.
- **Gestão:** catálogo e estoque, reposição, clientes e fiado com quitação, operadores de caixa e controle de caixa.
- **Importação de produtos em lote** por planilha Excel (`.xlsx`) ou CSV, com prévia e relatório de erros por linha.
- **App instalável** na área de trabalho ou na tela inicial, com ícone próprio.
- **Versão** visível no rodapé das telas e em `/api/version`.

### Alterado

- Novo visual em todas as telas, com a marca, a fonte Inter e o tema claro.
- Os avisos na tela somem sozinhos depois de 2 segundos.

### Corrigido

- **Sair** agora encerra a sessão de verdade em produção.
- Recarregar a tela de login várias vezes não trava mais o acesso.
- Verificação do PIN da proprietária: a tabela de tentativas que faltava no banco de produção foi criada.

[Não lançado]: https://github.com/RafalauriSantos/meu-comercio/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/RafalauriSantos/meu-comercio/releases/tag/v0.1.0
