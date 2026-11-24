# Como voltar a versão anterior em produção

Roteiro curto para quando o site publicado quebrou depois de um deploy. Escrito em 23/11/2026 a partir da documentação oficial da Vercel. **Ainda não foi testado em produção** (backlog 21.2): faça um teste uma vez, com a loja fora do horário, e anote aqui o que for diferente.

## Quando usar

- O teste de fumaça do deploy ficou vermelho no GitHub (job `Deploy to Vercel (Production)`, passo `Smoke test the published site`), ou
- a loja relata erro depois de uma versão nova, e `https://meucomercio.vercel.app/api/version` mostra o commit do deploy suspeito.

Voltar é mais rápido que consertar. Primeiro devolva o serviço; só depois procure a causa.

## O que o rollback faz (e não faz)

- **Faz:** aponta o tráfego de produção para um deploy anterior, sem reconstruir. Vale em segundos.
- **Não desfaz o banco.** Uma migração já aplicada continua aplicada. Por isso a regra do projeto é publicar a migração sozinha, antes do código que a usa, com colunas que não quebram a versão antiga (veja "Applying a migration to production" em [`PROJECT_WORKFLOW.md`](PROJECT_WORKFLOW.md)). Se o problema for a migração, o caminho é a branch de backup do Neon, não o rollback.
- **Não muda o Git.** A `main` continua com o commit ruim. Depois do rollback, corrija ou reverta o commit por PR.
- **No plano Hobby só volta um deploy:** para o deploy de produção imediatamente anterior. Passar um deploy mais antigo dá o erro `To rollback further than the previous production deployment, upgrade to pro.`

## Passo a passo

1. **Confirme o problema.** Abra `https://meucomercio.vercel.app/api/version` e `/login`. Anote o commit que está no ar.
2. **Faça o rollback.** Pelo painel da Vercel, na lista de deploys de produção do projeto, no deploy anterior ao ruim (a opção de *Instant Rollback*; confira o nome exato do botão na tela, ainda não foi visto), ou pela CLI:
   ```powershell
   npm install --global vercel@64.7.0   # a mesma versão do CI; a CLI não vem instalada
   vercel login
   vercel rollback                      # volta ao deploy de produção anterior
   vercel rollback status               # acompanha até terminar
   ```
   A CLI pede uma conta com acesso ao projeto `meu-comercio`. O CI usa os segredos `VERCEL_TOKEN`, `VERCEL_ORG_ID` e `VERCEL_PROJECT_ID`.
3. **Confira que voltou.** `api/version` deve mostrar o commit anterior e `/login` deve abrir. Dá para usar o próprio script do CI, com o commit que deveria estar no ar:
   ```powershell
   $env:SMOKE_BASE_URL = "https://meucomercio.vercel.app"
   $env:GITHUB_SHA = "<commit do deploy bom>"
   node scripts/smoke-check.mjs
   ```
4. **Avise a dona** se a loja ficou parada, e que a versão voltou.

## Depois do rollback

- **Os próximos deploys não vão ao ar sozinhos.** Segundo a documentação, depois de um rollback a Vercel deixa de apontar os domínios de produção para os deploys novos até você desfazer o rollback. Como este projeto publica por CI a cada merge na `main`, o deploy do conserto vai terminar verde e **não aparecer no site**. Quando o conserto estiver pronto, promova o deploy novo:
  ```powershell
  vercel promote <url-ou-id-do-deploy-novo>
  vercel promote status
  ```
  Confira `api/version` depois. (Conforme a documentação; confirme no primeiro teste.)
- **Corrija a `main`.** Abra uma PR de `revert` do commit ruim, ou de correção, pelo fluxo normal (teste local, CI verde, review). O teste de fumaça do CI roda de novo no deploy dessa PR.
- **Anote o que aconteceu** no backlog: o que quebrou, como foi percebido e quanto tempo a loja ficou afetada.

## Para testar uma vez (fora do horário da loja)

1. Publique uma mudança inofensiva e confirme que ela está no ar (`api/version`).
2. Rode `vercel rollback` e confira que voltou ao commit anterior.
3. Rode `vercel promote` no deploy mais novo e confira que ele voltou.
4. Anote aqui os nomes reais dos botões do painel e qualquer diferença deste roteiro.
