# Coletor do Garmin — instalação

Até aqui a aba Saúde só enchia com o **export GDPR**: pedir à Garmin, esperar
dias, baixar um ZIP e subir. Em outubro de 2026 a Garmin reabriu o Connect
Developer Program com a faixa **Personal**, e isso muda o jogo para um app sem
servidor:

| | Personal | Starter | Enterprise |
|---|---|---|---|
| para quem | seus próprios dados | organizações | escala |
| entrega | **Pull** | Push (webhook) | Push ou Ping/Pull |
| precisa pedir? | **não** | formulário | formulário |

**Pull** é o que importa: ninguém precisa de endereço público nem de webhook.
Um script pede o dado quando quiser — e o Apps Script que já manda os e-mails
faz isso de graça.

> A Garmin **não publica preço** para Personal nem Starter. Não há formulário
> nem negociação no Personal, o que normalmente quer dizer que não há cobrança,
> mas isso não está escrito em lugar nenhum. Confira ao gerar a chave.

---

## 1. Gerar a chave

1. <https://connect.garmin.com/app/settings/personalApiToken>, logado na sua
   conta do Garmin Connect
2. **Create Key** → aceitar os termos → escolher a validade → **Create**
3. **A chave aparece UMA vez.** Copie na hora.

## 2. Guardar a chave onde ela deve morar

No **mesmo projeto do Apps Script** que roda o `notificacoes.gs` (ele reusa a
função `fs_` de lá — os dois arquivos precisam estar no mesmo projeto):

**Configurações do projeto › Propriedades do script:**

| Propriedade | Valor |
|---|---|
| `GARMIN_API_KEY` | a chave gerada no passo 1 |
| `GARMIN_UID` | o seu uid do Firebase (não o e-mail) |
| `GARMIN_DIAS` | opcional, quantos dias puxar por execução (padrão 10) |

> ⚠️ A chave **não** entra neste repositório, nem em conversa, nem em print.
> Ela dá acesso aos seus dados de saúde. Propriedade do script é o único lugar.

**Onde achar o `GARMIN_UID`:** abra o app, entre, e no console do navegador
digite `S.u.id`. É o mesmo uid que aparece nas chaves `pro_<uid>` do Firestore.

## 3. Conferir antes de ligar

No editor do Apps Script, rode nesta ordem:

| função | o que prova |
|---|---|
| `garminTestarChave` | a chave é válida e a troca por token funciona |
| `garminTestarLeitura` | VFC, sono e FC de repouso dos últimos 7 dias chegam |
| `coletarGarmin` | grava os pacotes no Firestore |
| `garminInstalarGatilho` | passa a rodar de 6 em 6 horas |

Se `garminTestarLeitura` voltar com as três listas vazias, não é erro do
script: é o relógio que não sincronizou com o Garmin Connect. Abra o app do
Garmin no celular e tente de novo.

---

## O que o script NÃO faz, e por quê

**Ele não escreve na sua Saúde.** O caminho óbvio seria gravar direto em
`pro_<uid>`. Duas razões para não:

1. **Naquele mesmo registro diário moram `dor`, `sonoQ`, `ctx` e sintomas** —
   o check-in que você digitou. Um script que escreve o dia inteiro apaga isso
   sem avisar, e você descobre semanas depois.
2. **A conta de serviço passa por cima das regras do Firestore.** Acesso de
   servidor não é Firebase Auth, então ali não existe rede de proteção: o que
   o script puder fazer de errado, ele faz calado.

Em vez disso ele deixa **pacotes**: um documento `garmin_<uid>_<data>` por dia,
só com o que veio do relógio, no mesmo formato que o app já usa:

```json
{ "data": "2026-11-21", "hrv": 62, "hrvF": "noite", "fc": 48, "sono": 7.4 }
```

Quem incorpora é **o app**, do lado do dono, onde já existem o merge campo a
campo e a caixa-preta anti-apagamento. Os pacotes são apagados depois de 30
dias (`limparPacotesGarmin`): a incorporação é idempotente, então eles não
precisam sobreviver — e dado de saúde duplicado fora do documento que as regras
protegem é risco sem contrapartida.

## Endpoints usados

Conferidos no Swagger da faixa Personal em **21/11/2026**. Se a Garmin mudar os
nomes de campo, é em `garmin.gs` que quebra.

| dado | endpoint | campo |
|---|---|---|
| VFC | `GET /hrv-service/hrv/daily/{de}/{ate}` | `hrvSummaries[].lastNightAvg` e `.weeklyAvg` |
| sono | `GET /sleep-service/sleep/dailySleepSummariesByDate?startDate=&endDate=` | `[].sleepTimeSeconds` |
| FC repouso | `GET /wellness-service/wellness/dailyHeartRate?date=` | `restingHeartRate` |

Servidor: `https://personal.connectapi.garmin.com`

Duas armadilhas anotadas no código:

- **`lastNightAvg` e `weeklyAvg` não são a mesma grandeza.** O app guarda a
  procedência em `hrvF` (`noite` / `semana`) justamente para nunca misturar as
  duas numa série — uma média semanal num gráfico de noites achata a variação
  que é o próprio sinal.
- **FC de repouso é um dia por chamada.** Não existe versão por período na
  faixa Personal. É por isso que a janela padrão é curta: 10 dias são 10
  chamadas por execução.
