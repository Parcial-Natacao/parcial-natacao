# Avisos de cadastro — instalação

Três buracos no cadastro, e o que cobre cada um:

| Buraco | Coberto por |
|---|---|
| Quem aprova não sabe que tem gente esperando | `bannerPendentes()` no app (v193) **e** e-mail (este script) |
| Quem foi aprovado não é avisado | `conferirLiberacao()` no app (v193) **e** e-mail (este script) |
| O e-mail de confirmação vem de `noreply@parcial-cdb0e.firebaseapp.com` | Console do Firebase — [parte 2](#2-o-e-mail-de-confirmação-do-firebase) |

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

### 2.1 Como está hoje (conferido no Console em 13/11/2026)

```
De:       noreply@parcial-cdb0e.firebaseapp.com
Nome:     (não fornecido)
Assunto:  Verify your email for %APP_NAME%
Mensagem: Hello %DISPLAY_NAME%,
          Follow this link to verify your email address.
          https://parcial-cdb0e.firebaseapp.com/__/auth/action?mode=...
          If you didn't ask to verify this address, you can ignore this email.
          Thanks,
          Your %APP_NAME% team
Idioma do modelo: inglês
```

São **quatro** problemas, não um:

1. o endereço é `parcial-cdb0e.firebaseapp.com`;
2. `%APP_NAME%` é o nome do projeto no Firebase, que é **"Parcial"** — ou seja,
   a pessoa se cadastra no Meros360 e recebe um e-mail do "Parcial";
3. `%DISPLAY_NAME%` vem **vazio**: o app nunca chama `updateProfile`, então a
   mensagem começa com "Hello ,";
4. o modelo está em inglês.

### 2.2 O que o plano Grátis deixa mudar

Tudo, menos o **domínio** do remetente:

| Campo | Grátis? |
|---|---|
| Nome do remetente | ✅ |
| `De` — parte antes do `@` | ✅ |
| `De` — domínio `@parcial-cdb0e.firebaseapp.com` | ⛔ fixo, a não ser pelo "Personalizar domínio" (DNS) |
| Responder para | ✅ |
| Assunto | ✅ |
| Mensagem | ✅ |
| Idioma do modelo | ✅ |

Na prática o que a pessoa vê na caixa de entrada é o **nome do remetente**, não
o endereço. "Meros360" na lista resolve a confusão quase toda; o domínio só
aparece se ela abrir os detalhes.

### 2.3 Para colar — Authentication › Modelos › Verificação de endereço de e-mail › ✏️

Primeiro, no mesmo rodapé da tela: **Idioma do modelo → português (Brasil)**.

```
Nome do remetente:  Meros360
De:                 contato        (fica contato@parcial-cdb0e.firebaseapp.com)
Responder para:     barbato.bruno@gmail.com
Assunto:            Confirme seu e-mail no Meros360
```

Mensagem (o `%LINK%` é obrigatório; não use `%APP_NAME%` nem `%DISPLAY_NAME%`):

```html
<p>Olá!</p>
<p>Você criou uma conta no <b>Meros360</b>. Confirme seu e-mail para ativar o acesso:</p>
<p><a href='%LINK%'>Confirmar meu e-mail</a></p>
<p>Depois de confirmar, seu cadastro passa pela liberação do seu técnico (ou do
administrador, se você for técnico). Você recebe outro e-mail quando o acesso
estiver liberado.</p>
<p>Se não foi você quem criou esta conta, pode ignorar esta mensagem.</p>
<p>— Meros360 · <a href='https://meros360.com'>meros360.com</a></p>
```

O parágrafo sobre a liberação é o que fecha o buraco: a pessoa passa a saber,
no primeiro e-mail, que falta uma etapa e que ela será avisada.

Faça o mesmo em **Redefinição de senha** (nome do remetente e assunto, no
mínimo) — é o outro e-mail que seus usuários recebem.

### 2.4 Se quiser tirar o `firebaseapp.com` de vez

Na mesma tela há **Personalizar domínio**, ao lado do campo `De`. Ele pede
registros DNS no provedor do `meros360.com` e passa o remetente e o link de
confirmação para o seu domínio. É parte do Authentication, não exige Blaze, mas
mexe no DNS do domínio — vale fazer junto, com calma, e não no meio de um teste.

---

## 3. O que ficou dentro do app (v193)

- `bannerPendentes()` — o número de cadastros esperando, no topo de **qualquer**
  aba, para o técnico e para o administrador. Some quando você já está na tela
  da lista.
- `carregarPendentesAdmin()` — a consulta global por `aprovado == false`, só
  para o administrador, no máximo uma vez a cada 2 minutos.
- `conferirLiberacao()` — guarda no aparelho que a pessoa está esperando e
  mostra "Acesso liberado ✓" na troca ao vivo **ou** na primeira vez que ela
  reabre o app já aprovada.
