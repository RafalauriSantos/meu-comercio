# Changelog

Todas as mudanças importantes do Meu Comércio ficam registradas aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o
[Versionamento Semântico](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`). As regras de como e quando
lançar uma versão estão em `docs/PROJECT_WORKFLOW.md`.

## [Não lançado]

### Adicionado

- **Relatório de vendas** na aba "Relatórios" da gestão, só para a proprietária: quanto a loja vendeu hoje, ontem, nesta
  semana, neste mês ou em um período escolhido, com a comparação com o período anterior. Mostra o total, o número de
  vendas e o ticket médio; as formas de pagamento; as vendas por dia; os produtos mais vendidos; as vendas de cada
  operador; o fiado vendido e recebido e as vendas canceladas (fora do total). Pode ser exportado em CSV para o Excel.
  O dia segue o horário de Brasília.

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
