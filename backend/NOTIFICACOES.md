# Avisos de cadastro — instalação

Três buracos no cadastro, e o que cobre cada um:

| Buraco | Coberto por |
|---|---|
| Quem aprova não sabe que tem gente esperando | `bannerPendentes()` no app (v193) **e** e-mail (este script) |
| Quem foi aprovado não é avisado | `conferirLiberacao()` no app (v193) **e** e-mail (este script) |
| O e-mail de confirmação não parecia do Meros360 | Console + Google Cloud + código — [parte 2](#2-o-e-mail-de-confirmação-do-firebase) |

O aviso dentro do app só alcança quem abre o app. O e-mail alcança quem não
abre. Os dois juntos, não um ou outro.

---

## 1. O script de e-mail (`notificacoes.gs`)

Roda de graça na conta Google do administrador. Não precisa do plano Blaze.

### 1.1 Conta de serviço (Google Cloud)

1. <https://console.cloud.google.com/iam-admin/serviceaccounts?project=parcial-cdb0e>
2. **Criar conta de serviço** → nome `meros-avisos` → **Criar e continuar**
3. Papel: **Cloud Datastore User** (`roles/datastore.user`) → **Concluído**
4. Na conta criada → aba **Chaves** → **Adicionar chave › Criar nova chave › JSON**
5. Guarde o arquivo baixado fora do repositório. Dele você usa dois campos:
   `client_email` e `private_key`.

> ⚠️ **O JSON é segredo.** Ele dá leitura e escrita em todo o Firestore. Não
> entra no repositório, não vai por WhatsApp, não fica em Downloads. Depois de
> colar nas propriedades do script, apague o arquivo.

### 1.2 O projeto no Apps Script

1. <https://script.google.com> → **Novo projeto** → nome `Meros360 — avisos`
2. Apague o `Code.gs` de exemplo e cole o conteúdo de `backend/notificacoes.gs`
3. **Configurações do projeto** (engrenagem) → **Propriedades do script** →
   **Adicionar propriedade**, quatro vezes:

| Propriedade | Valor |
|---|---|
| `SA_EMAIL` | o `client_email` do JSON (termina em `.iam.gserviceaccount.com`) |
| `SA_KEY` | o `private_key` do JSON — **inteiro**, de `-----BEGIN` até `-----END PRIVATE KEY-----\n`, com os `\n` como estão |
| `PROJETO` | `parcial-cdb0e` |
| `ADMIN_EMAIL` | seu e-mail |

4. Rode `testarLeitura` uma vez (▶). O Google vai pedir autorização: aceite.
   Deve aparecer no log a lista de pendentes. Se der erro aqui, o problema é a
   chave ou o papel — ninguém recebeu nada ainda.
5. Rode `primeiraVezSemAvisar` **uma vez**. Isso marca quem já está na fila
   hoje como "já visto". Sem isso, a estreia do script despeja um e-mail com
   todo o histórico, e depois um "foi aprovado" para cada um que você aprovar
   na limpeza.
6. Rode `instalarGatilho` uma vez. A partir daí ele confere a cada 15 min.

### 1.3 O que chega

**Para você, quando alguém se cadastra:**

> **Assunto:** [Meros360] 1 cadastro aguardando liberação
>
> Um cadastro novo está esperando liberação no Meros360:
>
> • Fulano de Tal <fulano@email.com>
>   atleta PRO · equipe: A3 Swim Team CG/MS
>
> Técnico é liberado por você, na aba Equipes. Atleta é liberado pelo técnico
> da equipe, na tela Equipe.

**Para a pessoa, quando você aprova:**

> **Assunto:** Seu acesso ao Meros360 foi liberado
>
> Olá, Fulano!
>
> Seu cadastro na equipe A3 Swim Team CG/MS foi aprovado pelo técnico. Os
> treinos da equipe e as competições já estão disponíveis.
>
> Abra o app: https://meros360.com

O remetente aparece como **Meros360**; o endereço continua sendo o seu Gmail,
porque o Apps Script não deixa forjar remetente. Para um piloto isso é até
melhor — a pessoa pode responder e falar com gente de verdade.

### 1.4 Limites

Conta Gmail comum: 100 destinatários por dia. Um cadastro gasta 2 (um para
você, um para a pessoa). Folgado para o piloto; se um dia apertar, o caminho é
Google Workspace (1.500/dia) ou um serviço de envio.

### 1.5 Consertos

| Sintoma | Causa provável |
|---|---|
| `Troca do JWT falhou (400): invalid_grant` | o `SA_KEY` perdeu as quebras de linha, ou o relógio |
| `Firestore 403` | falta o papel **Cloud Datastore User** na conta de serviço |
| `Firestore 400 ... requires an index` | não deve acontecer: `aprovado ==` é campo simples |
| Ninguém recebe nada | rode `testarLeitura` à mão e leia o log |
| Alguém foi aprovado antes do script existir | `avisarLiberadoManual('email@dapessoa.com')` |

---

## 2. O e-mail de confirmação do Firebase

### 2.1 Como estava, e o que de fato deu para mudar

Em 13/11/2026 o e-mail que o usuário recebia era este:

```
De:       noreply@parcial-cdb0e.firebaseapp.com
Nome:     (não fornecido)
Assunto:  Verify your email for %APP_NAME%
Mensagem: Hello %DISPLAY_NAME%, / Follow this link to verify… (inglês)
Idioma:   inglês
```

Quatro problemas, e eles **não se resolvem no mesmo lugar**:

| | causa | resolvido em |
|---|---|---|
| domínio `parcial-cdb0e.firebaseapp.com` | domínio padrão do projeto | **Console** — domínio personalizado ✅ |
| tudo em inglês | idioma do modelo = inglês | **Console** — idioma do modelo ✅ |
| `%APP_NAME%` = "Parcial" | nome do projeto no Google Cloud | **Google Cloud** — renomeado ✅ |
| `%DISPLAY_NAME%` vazio → "Olá, ," | o app nunca chamava `updateProfile` | **código do app** (v194) ✅ |

> ⚠️ **Editar o modelo está BLOQUEADO neste projeto.** Ao salvar nome do
> remetente, assunto ou corpo, o Console responde *"As atualizações de modelos
> de e-mail não estão disponíveis para este projeto"* e descarta tudo. O
> `<textarea>` do corpo vem `disabled` no HTML. É uma trava do Google, não
> falta de plano — o Blaze não muda isso.
>
> **Consequência prática:** o texto do e-mail é o padrão do Firebase, e o único
> jeito de mudar o que ele diz é mudar o que as variáveis valem. Foi por isso
> que o projeto foi renomeado e que o `displayName` passou a ser gravado: são
> as duas alavancas que sobraram.

### 2.2 Como está agora

```
De:       noreply@meros360.com
Assunto:  Verifique seu e-mail do app Meros360
Mensagem: Olá, <Nome do usuário>
          Clique neste link para verificar seu endereço de e-mail.
          https://parcial-cdb0e.firebaseapp.com/__/auth/action?...
          Se você não solicitou a verificação deste endereço, ignore este e-mail.
          Obrigado,
          Equipe do app Meros360
```

O que **continua** no `firebaseapp.com` é só o endereço do link
(`URL acionável`). Ele só aparece se a pessoa passar o mouse em cima — mudá-lo
exige o domínio no Firebase Hosting, e o app está no GitHub Pages.

### 2.3 O domínio personalizado — o que foi feito

Authentication › Modelos › ✏️ › **Personalizar domínio** → `meros360.com`.
O Firebase pediu quatro registros, cadastrados no Cloudflare:

| Nome | Tipo | Valor |
|---|---|---|
| `@` | TXT | `v=spf1 include:_spf.firebasemail.com ~all` |
| `@` | TXT | `firebase=parcial-cdb0e` |
| `firebase1._domainkey` | CNAME | `mail-meros360-com.dkim1._domainkey.firebasemail.com` |
| `firebase2._domainkey` | CNAME | `mail-meros360-com.dkim2._domainkey.firebasemail.com` |

Três coisas para quem for mexer nisso depois:

- **Nenhum MX e nenhum CNAME no apex.** Os quatro registros A do GitHub Pages
  (`185.199.108–111.153`) e o `www` continuam intactos. Isto aqui não derruba
  o site.
- **Os dois CNAME têm que ficar "DNS only", nunca proxiados.** O Cloudflare já
  escolhe assim sozinho por causa do `_` no nome; se alguém ligar o laranja, o
  Cloudflare devolve o IP dele no lugar da chave DKIM e a assinatura quebra.
- **Existe UM registro SPF, e tem que continuar sendo um.** Se um dia entrar
  outro serviço de envio (ou o Cloudflare Email Routing), ele vai no *mesmo*
  `v=spf1`, como mais um `include:`. Dois registros `v=spf1` separados
  invalidam os dois, e aí o e-mail começa a cair em spam sem nada ter mudado
  do lado do app.

### 2.4 `contato@meros360.com` que recebe de verdade

Hoje o remetente é `noreply@meros360.com` e não existe caixa postal nesse
domínio: quem responder cai no `Responder para`. O Console recusou gravar esse
campo junto com o resto do modelo, então **a resposta hoje não tem para onde
ir**.

O conserto é o **Cloudflare Email Routing** (grátis, mesmo painel): cria
`contato@meros360.com` encaminhando para o Gmail. Ele adiciona MX e quer um
SPF — e é exatamente aí que vale a regra acima: o `include:_spf.mx.cloudflare.net`
entra no registro que já existe, virando

```
v=spf1 include:_spf.firebasemail.com include:_spf.mx.cloudflare.net ~all
```

e não um segundo TXT.

---

## 3. O que ficou dentro do app (v193–v194)

- `bannerPendentes()` — o número de cadastros esperando, no topo de **qualquer**
  aba, para o técnico e para o administrador. Some quando você já está na tela
  da lista.
- `carregarPendentesAdmin()` — a consulta global por `aprovado == false`, só
  para o administrador, no máximo uma vez a cada 2 minutos.
- `updateProfile({displayName})` no cadastro — sem isso o e-mail de
  confirmação começa com "Olá, ," e a lista de usuários do Console fica sem
  nome. Roda ANTES do envio, senão não adianta.
- `conferirLiberacao()` — guarda no aparelho que a pessoa está esperando e
  mostra "Acesso liberado ✓" na troca ao vivo **ou** na primeira vez que ela
  reabre o app já aprovada.
