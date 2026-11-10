# Painel Flow Consórcio

Clientes e agenda do consórcio. O painel lê e grava na planilha **Base Consórcio**. Cada pessoa entra por um link com chave própria.

## Como colocar no ar

**1. Dar acesso à planilha**
Abra a planilha Base Consórcio, clique em Compartilhar e adicione como **Editor** o e-mail da conta de serviço do Google. Pode ser a mesma do painel do seguro (termina em `iam.gserviceaccount.com`). Ela está nas variáveis do site do seguro no Netlify, dentro do `GOOGLE_SERVICE_ACCOUNT`, no campo `client_email`.

**2. GitHub**
Crie um repositório **privado** (ex.: `painel-consorcio`) e suba o conteúdo desta pasta, mantendo as pastas `netlify` e `public`.

**3. Netlify**
Add new site > Import an existing project > GitHub > escolha o repositório. Não precisa preencher nada no build: o `netlify.toml` já diz tudo. Clique em Deploy.

**4. Variáveis de ambiente** (Site configuration > Environment variables)

| Nome | Valor |
|---|---|
| `SHEET_ID` | `1XBbow00izfuxBGuBCjiAx0tAX5wB0XxM_Y_pEgEgH_g` |
| `GOOGLE_SERVICE_ACCOUNT` | o JSON inteiro da conta de serviço (o mesmo do site do seguro) |

Depois de salvar, faça um novo deploy (Deploys > Trigger deploy).

**5. Links das pessoas**
Na planilha, aba **Config**, troque o valor de `site_url` pelo endereço do site no Netlify (sem barra no final). A coluna **Link** da aba **Acessos** passa a mostrar o link de cada pessoa. Envie cada link só pra pessoa dele.

**6. Link do Meet**
Em Acessos, coluna **Link fixo do Meet**, ou direto no painel (Configurações), coloque o link da Paula e o seu.

## Regras de acesso
- A chave de cada pessoa fica na aba Acessos. Pra tirar o acesso de alguém, troque **Ativo** pra `não`. Vale na hora.
- O painel sabe quem é pelo link. Tudo que a pessoa faz fica gravado no nome dela (aba Log e "Quem mexeu" na ficha do cliente).
- Perfis: `gestor`, `sdr`, `closer`. O gestor também aparece como closer pra receber reuniões.

## Abas da planilha
Clientes, Agenda, Disponibilidade (horários de cada closer), Config (metas e dias sem expediente), Acessos, Log, Propostas (ainda não ligada ao painel).
Dá pra olhar e filtrar tudo direto na planilha, mas edite pelo painel. Os dados têm formato fixo.

## Teste
`npm test` roda os testes das regras com uma planilha de mentira (não mexe na planilha real).
