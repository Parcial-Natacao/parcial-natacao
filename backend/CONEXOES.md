# Conectar relógios por OAuth — instalação e registro

Como sair da chave pessoal de uma pessoa (`GARMIN.md`) para o botão
**"Conectar relógio"** que qualquer atleta usa.

> **A ordem importa.** O portal da Garmin pede, no formulário de registro, o
> endereço para onde ele vai devolver a autorização. Esse endereço é o do Web
> App do Apps Script — então ele precisa existir **antes** do registro. Por
> isso o passo 1 é publicar, não registrar.

---

## Passo 1 — publicar o Web App (10 minutos, só seu)

No **mesmo projeto do Apps Script** onde já moram `notificacoes.gs` e
`garmin.gs` (o `conexoes.gs` reusa `fs_`, `tokenAcesso_` e `props_` de lá —
os quatro arquivos precisam estar no mesmo projeto):

1. Cole o conteúdo de `backend/conexoes.gs` num arquivo novo com esse nome.
2. **Implantar › Nova implantação**
3. Engrenagem › **App da Web**
4. Preencha:

| campo | valor | por quê |
|---|---|---|
| Descrição | `conexões de relógio` | só para você se achar depois |
| Executar como | **Eu** (sua conta) | é quem tem a conta de serviço do Firestore |
| Quem pode acessar | **Qualquer pessoa** | o fabricante chama de volta sem estar logado no Google |

5. **Implantar** → autorize os escopos quando o Google pedir → **copie a URL**
   (termina em `/exec`).
6. Guarde essa URL em **Propriedades do script** como `URL_WEBAPP`.

> ⚠️ **TODA mudança no `conexoes.gs` exige republicar — e NÃO é “Nova
> implantação”.** A implantação fica presa à VERSÃO do código que existia no
> momento em que foi criada; salvar o arquivo depois não muda o que o `/exec`
> serve. Aconteceu aqui: a implantação nasceu às 10:59 com o arquivo ainda
> quebrado, e o endereço respondia *“Função de script não encontrada: doGet”*
> mesmo com o código certo salvo no editor.
>
> O caminho certo é **Implantar › Gerenciar implantações › ✏️ › Versão: Nova
> versão › Implantar**. Isso mantém a MESMA URL. “Nova implantação” criaria
> um endereço diferente — e o antigo é o que está registrado no portal do
> fabricante como `redirect_uri`.
>
> Para conferir sem adivinhação: abra o `/exec` no navegador. Se vier a página
> “Meros360 — conexões”, a versão publicada é a certa.

> ⚠️ **O passo 6 não é opcional.** `ScriptApp.getService().getUrl()` devolve
> endereços diferentes conforme de onde é chamado: no editor, o `/dev`, que
> só abre para quem edita o projeto; dentro do Web App publicado, o `/exec`.
> Como o `redirect_uri` tem de ser idêntico ao registrado no portal, um valor
> que varia passa no teste e falha na vida real, com um 400 que não explica
> nada. Com `URL_WEBAPP` preenchida, o endereço é sempre o mesmo.

> ⚠️ "Qualquer pessoa" assusta, e não deveria. O endereço não expõe dado
> nenhum: sem um **pedido** válido no Firestore — que só o dono da conta
> consegue criar — ele responde uma página informativa e nada mais. Quem
> abrir no navegador vê um recado educado.

Confira rodando `conexoesConferir()` no editor (menu de funções → Executar).
Ele imprime a URL, testa se a conta de serviço ainda fala com o Firestore e
lista o que falta. Nesta altura vai listar bastante — é o esperado.

---

## Passo 2 — registrar o Meros360 na Garmin (só seu)

<https://developerportal.garmin.com/> → criar conta de desenvolvedor →
solicitar a faixa **Starter** do Connect Developer Program.

O formulário pede, em alguma ordem:

| o que ele pede | o que responder |
|---|---|
| Nome do app | `Meros360` |
| Site público | `https://meros360.com` |
| Política de privacidade | `https://meros360.com/privacidade.html` |
| Descrição | Prancheta digital de natação: treino, competição e prontidão diária para nadadores master e seus técnicos. |
| **Redirect / Callback URL** | a URL do passo 1, terminada em `/exec` |
| **Webhook / Push URL** | a mesma URL do passo 1 |
| Dados que o app consome | VFC da noite, FC de repouso, sono, atividades |

Depois é aceitar os termos — isso é assinatura em nome do app, e por isso é
seu, não meu.

> O app fica marcado como **unverified** até a Garmin revisar. Ele funciona
> assim mesmo; a revisão tira o aviso da tela de autorização.

---

## Passo 3 — guardar as credenciais onde elas devem morar

A Garmin entrega um **Consumer Key** e um **Consumer Secret**.

**Configurações do projeto › Propriedades do script:**

| Propriedade | Valor |
|---|---|
| `GARMIN_CLIENT_ID` | o Consumer Key |
| `GARMIN_CLIENT_SECRET` | o Consumer Secret |

> ⚠️ **O segredo nunca entra no repositório.** Ele é público. Um
> `client_secret` commitado é revogado pelo fabricante em horas — quando dá
> sorte. Não cole o segredo em conversa, em issue, nem em captura de tela.

---

## Passo 4 — os endereços da Garmin, nas Propriedades

Os endereços não entram no código (ver o aviso de confidencialidade no
topo do `conexoes.gs`). Eles são copiados do **OAuth2PKCE 2.0.pdf**, em
Downloads do portal, direto para as Propriedades do script:

| propriedade | onde está no PDF |
|---|---|
| `GARMIN_URL_AUTORIZAR` | pág. 2, *STEP 1*, linha **URL(GET):** |
| `GARMIN_URL_TOKEN` | pág. 3, *STEP 2*, linha **URL (POST):** — a mesma do refresh |
| `GARMIN_URL_USERID` | pág. 5, seção 5 *User ID*, linha **GET** |
| `GARMIN_URL_REGISTRO` | pág. 5, seção 6 *Delete User Registration*, linha **DELETE:** |

> ⚠️ **Copie pelo botão direito › "Copiar endereço do link".** Selecionar o
> texto no leitor de PDF arrasta espaço e quebra de linha invisíveis. E
> **nunca copie da barra de endereços**: clicar no link de autorização leva a
> um redirecionamento que acrescenta `/partner/` ao caminho, e o valor
> gravado ficaria diferente do documentado — falharia lá na frente, com um
> erro que não explica nada. Abrir esse link direto, aliás, devolve
> *"We could not give this application the permissions you requested"*: é o
> esperado, porque nenhum aplicativo se identificou.

**Não existe `GARMIN_ESCOPO`.** A requisição de autorização da Garmin não
aceita `scope`; o escopo concedido vem na resposta do token.

### O que a especificação obrigou a mudar no código

- **Credenciais no header `Basic`**, não no corpo. A lista de parâmetros cita
  `client_id` e `client_secret`, mas os exemplos de `curl` usam Basic e não
  os repetem no corpo.
- **O id do usuário é uma chamada à parte**, não vem na resposta do token. Sem
  ele o push chega sem dono — as notificações identificam a pessoa pelo id do
  fabricante, e o índice `idprov_<prov>_<id>` faz o caminho de volta.
- **O refresh token gira e vence em três meses.** A Garmin devolve um refresh
  novo a cada renovação; guardar o antigo mata a conexão na próxima vez.
- **Remover o registro é obrigação**: a spec diz que o endpoint **deve** ser
  chamado quando o app oferece "apagar conta" ou "desconectar". O Meros360
  oferece os dois. E o mesmo endereço do push recebe as **notificações de
  desregistro**, quando a pessoa desconecta pelo Garmin Connect.

## Passo 4b — o mapa dos campos e o endpoint do push

O corpo do push é `{ "<tipo de resumo>": [ { "userId": …, … } ] }`. Os nomes
dos campos de cada resumo também são material do programa, então também não
entram no repositório: vão num JSON na propriedade **`GARMIN_MAPA`**, e o
código lê o mapa de lá. A forma é:

```
{ "<tipo>": { "data": "<campo da data>",
              "campos": { "<nosso campo>": { "de": "<campo da Garmin>",
                                             "dividirPor": 3600, "casas": 1 } } } }
```

Os três que o Meros360 usa são `hrv`, `dailies` e `sleeps` — VFC da noite, FC
de repouso e duração do sono. `dividirPor` e `casas` são opcionais (o sono vem
em segundos).

### Atividade é outra forma de regra

Resumo diário e atividade não têm a mesma natureza, e a regra reflete isso.

```
{ "<tipo>": { "dataEpoca": { "de": "<campo>", "desloc": "<campo>" },
              "atividade": { "chave": "<campo>", "tipo": "<campo>",
                             "dist": "<campo>",
                             "min": { "de": "<campo>", "dividirPor": 60, "casas": 1 },
                             "fc": "<campo>" } } }
```

Três cuidados, cada um por um motivo concreto:

- **A data vem em segundos de época, não pronta.** `dataEpoca` soma o
  deslocamento do fuso de quem nadou antes de formatar. Sem o deslocamento, o
  treino das 5h40 cairia na véspera — e a série inteira andaria um dia.
- **A chave é o que impede o dobro.** A mesma atividade é reenviada quando a
  pessoa a edita no aplicativo do fabricante; sem `chave`, cada reenvio somaria
  de novo. As atividades se unem pela chave dentro do pacote do dia, e um dia
  com dois nados recebe os dois, mesmo chegando em pushes separados.
- **O total NÃO é calculado no Apps Script.** Quem deriva metragem, duração e
  FC média do dia é o app, em `derivarTotaisDoDia` — que é também quem decide
  o que conta como nado. É o mesmo caminho da importação do ZIP, e por isso
  nado do relógio e nado do export nunca podem divergir. Duas contas da mesma
  coisa em dois lugares divergem: foi assim que a coluna Nado chegou a mostrar
  zero num dia de 4,5 km.

**Endpoints:** configure em `https://apis.garmin.com/tools/endpoints`, entrando
com o client ID e o client secret. Cada tipo de resumo tem a sua URL e as
caixas *Enabled* e *On Hold*. Habilite **apenas** o que o app usa, todos
apontando para a URL `/exec` do Web App: os três resumos diários e, para o nado
entrar sozinho, o resumo de **atividade** (o de resumo, não o detalhado — o
detalhado traz série ponto a ponto, que o app não usa). Pedir tipo que não se
usa é receber dado de saúde sem necessidade.

⚠️ Habilitar o tipo no portal **e** acrescentar a regra no `GARMIN_MAPA` são
dois passos, e falta um deles não dá erro nenhum: o push chega, o
`processarCorpo_` não acha regra para o tipo e devolve zero, em silêncio.

**Gatilho:** rode `conexoesInstalarGatilho()` uma vez no editor. Ele cria o
`drenarFila` a cada 5 minutos (e remove o anterior, se houver).

> **Trocar o intervalo não basta editar o arquivo.** O gatilho vive no
> projeto do Apps Script, não no código: depois de colar a versão nova é
> preciso rodar `conexoesInstalarGatilho` de novo, que apaga o antigo e
> cria o novo. Sem isso o gatilho velho continua rodando no ritmo velho.

## Passo 4c — por que existe uma fila

A seção 4 do Health API exige responder **200 antes de processar**, com
timeout de trinta segundos. O Apps Script só responde quando a função
retorna, então o `doPost` faz uma gravação só — o corpo cru, num documento
`fila_<hora>_<aleatório>` — e sai. O `drenarFila` transforma em pacotes
depois.

A latência de alguns minutos não custa nada: o app lê os pacotes quando abre,
não em tempo real.

> ⚠️ **A mescla é por campo, não por pacote.** `hrv`, `dailies` e `sleeps`
> chegam em notificações **separadas**, cada uma com um pedaço do mesmo dia.
> Gravar o pacote inteiro a cada notificação apagaria o que a anterior
> trouxe, e o dia terminaria com um dos três números em vez de três.

A regra do Firestore para `fila_` entra na **próxima publicação** das regras,
junto com a do botão do app: ela tira a fila do alcance de `ehOutro()`, para
que nem o administrador leia corpo cru de push de outra pessoa.

---

## Passo 5 — o lado do app (**já feito**, falta ligar)

O botão **Saúde › Conectar relógio**, a leitura dos vínculos e os campos
espelhados do pedido estão no `index.html` desde a v2.17.0. Faltam duas
ligadas, e as duas são suas:

**5a. O endereço do Web App.** Em `index.html`, a constante `URL_CONEXOES`
(logo abaixo de `IA_URL`) está vazia. Cole nela a URL do passo 1. Enquanto
estiver vazia o cartão de conectar **não aparece** — de propósito: recurso
inacabado não fica piscando na tela de ninguém, e o caminho manual do ZIP
continua inteiro.

**5b. Publicar as regras.** O `firebase/firestore.rules.v2` ganhou os três
documentos novos. Sem publicar, o botão grava o pedido e leva "permission
denied" — o Apps Script não acha o pedido e recusa a conexão.

| documento | quem lê | quem escreve |
|---|---|---|
| `pedido_<uid>_<nonce>` | ninguém pelo app | só o dono **cria**; o script apaga |
| `vinculo_<uid>_<prov>` | só o dono | só a conta de serviço |
| `conexao_<uid>_<prov>` | **ninguém** — nem o administrador | só a conta de serviço |

A última linha é a que importa: os tokens não aparecem em regra nenhuma, e
no Firestore o que não é permitido é negado. Eles também foram tirados do
alcance de `ehOutro()`, que senão os entregaria ao administrador global.

---

## Como a coisa funciona, em cinco linhas

1. O atleta toca em **Conectar relógio**. O app grava um pedido no Firestore
   — e a regra só deixa quem está logado como aquele uid gravar lá.
2. O app abre o Web App passando só o **id do pedido**.
3. O Web App lê o pedido (é assim que descobre de quem é a conta — nunca pela
   URL), e manda a pessoa para a página do fabricante.
4. A pessoa autoriza. O fabricante devolve um `code` para o Web App, que
   troca por tokens e guarda em `conexao_<provedor>_<uid>`.
5. Daí em diante o fabricante empurra os dados; o Web App os transforma em
   `garmin_<uid>_<data>`, e o app incorpora na próxima abertura — o mesmo
   caminho que já funciona hoje.

**Nenhuma senha passa pelo Meros360, em momento nenhum.** E o token não passa
pelo navegador: nenhuma regra do Firestore dá leitura do `conexao_`, nem ao
dono, nem ao administrador. Só a conta de serviço chega nele.

---

## Desconectar

Ainda não está implementado. Quando estiver, apagar o `vinculo_` pelo app vai
disparar a revogação do token no fabricante — revogar é operação de servidor,
não dá para fazer do navegador. Até lá, a desconexão é feita na própria conta
do fabricante (Garmin Connect › aplicativos conectados).
