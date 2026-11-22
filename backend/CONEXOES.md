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

## Passo 4 — os endereços da Garmin (é onde eu entro)

O `PROVEDORES` do `conexoes.gs` está com os endereços **em branco de
propósito**: a documentação oficial fica atrás do login do portal, e
preencher com URL de blog é construir a ponte com a planta errada.

Quando você estiver logado no portal, me mande — pode ser texto copiado:

1. a **URL de autorização** (a página de consentimento do usuário);
2. a **URL de token** (troca do `code` e refresh);
3. os **escopos** que a faixa Starter concede, com o nome exato;
4. um **exemplo do corpo do push** — o JSON que a Garmin manda para o
   webhook quando o relógio sincroniza;
5. como se descobre o **id do usuário na Garmin** a partir do token.

Com isso eu preencho `PROVEDORES.garmin` e escrevo o `receberPush_`, que é a
única função que precisa conhecer a forma dos dados do fabricante.

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
