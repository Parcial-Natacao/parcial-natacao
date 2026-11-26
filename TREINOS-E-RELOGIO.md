# Desenho — o relógio entra pela porta do treino

**Status: E1 entregue na v2.19.8 (23/11/2026). E2 e E3 continuam no papel.**
Escrito antes de tocar em código, a pedido do Bruno, em 23/11/2026.

Este documento responde a uma pergunta que apareceu no dia em que o nado pelo
push começou a funcionar (v2.19.6) e a coluna Nado continuou vazia:

> Qual o sentido dessa coluna "Nado"? É só puxar os dados do Garmin? Porque se
> for pra isso, é melhor puxarmos todos os treinos realizados e lançá-los na
> aba "Treinos". E aí o usuário tem a opção tanto de aproveitar os dados vindos
> do relógio ou manter os treinos escritos pelo treinador ou por ele mesmo.
> Aliás, para atletas de águas abertas, os dados do relógio são tão importantes
> quanto o treino passado pelo técnico.

A pergunta está certa, e o defeito que ela aponta é maior do que a coluna.

---

## 1. O que existe hoje

Três livros-caixa, medidos no código, não supostos:

| livro | onde mora | o que guarda | quem escreve |
|---|---|---|---|
| **Treinos** | `S.tridx` (índice) + documento do treino | metragem escrita (`vol`, `index.html:4115`), tempos, e o lado realizado em `t.sessao[uid] = {rpe, dur}` (`setSessao`, `index.html:4138`) | técnico, ou o atleta em "+ Piscina" |
| **Outras atividades** | `S.pro.seco[]` | `{tipo, data, dur, rpe, fc, calorias, obs, transcricao}` (`abrirTreinoExtra`, `index.html:13250`) | o atleta, à mão |
| **Série do relógio** | `S.pro.garmin[]` | um registro por dia: `{hrv, hrvF, fc, sono, ativs[], nado, ativDur, ativFc}` (`derivarTotaisDoDia`, `index.html:12982`) | o push da Garmin, o ZIP do export, ou o campo "Quanto nadei" |

O relógio chega ao resto do app por **duas portas estreitas, e só**:

1. **A coluna Nado da Prontidão** (`index.html:11753`). Tabela
   `Data | FC rep | VFC | Sono | Nado`. O propósito está escrito no próprio
   app: *"os metros do dia alimentam a coluna Nado da Prontidão, ao lado da VFC
   e do sono — é assim que uma queda de VFC aparece ao lado da semana em que o
   volume subiu"*. Ela **não é registro de treino**: é volume como contexto
   fisiológico. Só exibe; ninguém mais a lê.
2. **`loadGarminDia`** (`index.html:13631`): carga estimada **do dia**, e
   apenas nos dias em que `diasComCargaInformada` (`index.html:13638`) não
   encontrou RPE e duração informados. Dado medido tem prioridade sobre dado
   estimado — essa regra já existe e funciona.

---

## 2. O defeito

**O relógio sabe exatamente o que falta aos outros dois livros, e não há ponte.**

O app já reclama da falta. `pendenciasNatacao` (`index.html:13404`) diz, com
estas palavras: *"dia com tempo anotado (logo, treino feito) que não aparece em
SESSOES"*, e o que falta é *"sem RPE e duração da sessão → entra só por
estimativa"*.

Ora:

- a **duração** está na atividade do relógio (`min`);
- a **FC média** está na atividade (`fc`), e `rpeDeFC` (`index.html:13623`) já
  converte FC média em RPE pelo método de Karvonen;
- a **distância** está na atividade (`dist`).

As duas pontas existem e não se falam. A consequência prática é o campo
**"Quanto nadei"** (`index.html:11803`), que pede ao Bruno a metragem do dia —
um número que o app **já tem** calculado a partir do treino escrito
(`metragemRelida`, `index.html:3968`).

E há um segundo defeito, menos visível: a coluna Nado ignora o treino escrito
por completo. Um atleta sem relógio nenhum, que escreveu 4.000 m na aba
Treinos, vê "—" na coluna Nado para sempre. A coluna não é "dado do relógio";
ela foi construída como se fosse.

---

## 3. Princípios do desenho

1. **Prescrição e execução não se misturam.** Transformar atividade do relógio
   em treino do `S.tridx` apaga a única pergunta que faz a aba Treinos existir
   para quem tem técnico: *fiz o que foi passado?* Prescrito 4.000 e nadado
   3.200 é informação. Dois treinos na lista não é.
2. **Uma fonte por grandeza por dia, com a precedência declarada na tela.**
   Já é a regra do app para carga (`diasComCargaInformada`). Falta aplicá-la à
   metragem.
3. **O relógio propõe; a pessoa confirma, e dá para desfazer.** É o desenho que
   a v166 obrigou a adotar na correção de metragem: *nada é reescrito sem
   confirmação*.
4. **Atividade se une pela CHAVE, nunca por soma.** Lição da v166 com o ZIP e da
   v2.19.6 com o push. A Garmin reenvia a mesma atividade quando a pessoa a
   edita no aplicativo dela; dois nados no mesmo dia chegam em pushes
   separados.
5. **Águas abertas não é exceção, é o caso em que o relógio é a fonte
   primária.** Não existe série escrita para 5 km na represa: distância, ritmo e
   FC só existem no relógio. Ali o relógio não complementa o treino do técnico —
   ele *é* o registro.

---

## 4. Os três mecanismos

### A — Pareamento: a atividade preenche o lado realizado do treino

Atividade de nado com data igual à de um treino do atleta → ela preenche
`t.sessao[uid]`, que **já é o slot do realizado**, hoje alimentado à mão por
dois campos (RPE e duração, `index.html:4173-4175`).

- entra: `dur` (de `min`), `fc` (de `fc`), e um `dist` novo;
- marca `origem:'garmin'` no que entrou, para a tela poder declarar;
- **o digitado vence o medido-estimado**: onde o atleta já pôs RPE e duração,
  o relógio não encosta. Onde está vazio, ele preenche e a tela diz "do
  relógio";
- o RPE continua vindo de `rpeDeFC`, nunca inventado.

Não deve: criar treino, apagar tempos, mudar `vol` (que é a prescrição escrita).

Prova: um treino prescrito de 4.000 com `sessao` vazia + atividade de 53 min /
800 m → `sessao.dur === 53`, `vol` intacto em 4000, e a tela mostra os dois
números. Com RPE já digitado, `sessao.rpe` não muda.

### B — Atividade sem treino: vira cartão próprio na aba Treinos

Atividade cuja data não tem treino correspondente — nado extra, águas abertas,
a esteira de sábado.

- **nado com distância** → forma nova, "nado do relógio": carrega metragem e
  conta como volume. É o caso de águas abertas, e é o que o desenho atual não
  tem;
- **não-nado** → entra no formato que já existe (`S.pro.seco`), com `tipo`
  traduzido do tipo da Garmin por uma tabela para `SECO_TIPOS`
  (`index.html:1751` — que hoje não tem natação na lista);
- **chaveado pela chave da atividade** (o `k` do registro, vindo do mapa da propriedade), nunca somado, e nunca mesclado com um registro
  digitado à mão: reenvio não duplica, e o que a pessoa escreveu não é
  sobrescrito por palpite de correspondência.

Não deve: entrar em `S.tridx`; aparecer como pendência de RPE/duração (o
relógio já trouxe os dois).

Prova: a mesma atividade processada duas vezes produz um cartão, não dois. Uma
atividade de águas abertas de 5.000 m sem treino no dia produz 5,0 km de
volume. Uma atividade que não é nado não produz metragem nenhuma.

### C — Metragem com precedência única

Uma função só decide a metragem de um dia, nesta ordem:

```
relógio (soma das atividades de nado do dia)   — MEDIDO
  → digitado à mão ("Quanto nadei")          — INFORMADO
    → treino escrito, e só se marcado FEITO   — PRESCRITO
```

> **Correção de 23/11, na implementação.** A primeira versão deste documento
> punha o treino escrito à frente do digitado, e isso contradiz a regra que o
> próprio app já segue para carga em `diasComCargaInformada`: *dado medido tem
> prioridade sobre dado estimado*. O treino escrito é **prescrição** — diz o que
> estava planejado. Quem digita está dizendo o que **de fato** nadou. Deixar a
> prescrição por cima descartaria em silêncio o que a pessoa afirmou.
>
> E o treino escrito só conta quando marcado como **feito**. Sem isso, um dia
> de treino faltado apareceria com 4.000 m na coluna — exatamente o tipo de
> número inventado que o resto do app evita.

A coluna Nado passa a ler isso **e a dizer de onde veio o número**. O campo
"Quanto nadei" deixa de ser a única porta e passa a ser o último recurso, com
o texto corrigido: hoje ele promete que o ZIP assume o lugar, e não menciona
que o treino escrito existe.

Não deve: somar duas fontes. Nunca.

Prova: dia com treino escrito de 4.000 e sem relógio → coluna mostra 4,0 km
(hoje mostra "—"). Mesmo dia com atividade de 3.200 m → mostra 3,2 km e
declara "do relógio". Nenhum caso mostra 7,2 km.

---

## 5. O que não fazer, e por quê

| não fazer | porque |
|---|---|
| atividade do relógio virar treino do `S.tridx` | mata a pergunta "fiz o que foi passado?" |
| somar carga do relógio com carga informada | `diasComCargaInformada` já evita; manter a regra |
| somar metragem de duas fontes | foi o erro da v166, que dobrou volume e carga |
| calcular `nado`/`ativDur` no Apps Script | v2.19.6: quem deriva é o app, num lugar só |
| pôr nome de campo da Garmin no repositório | o repositório é público e a documentação da Garmin é confidencial; os nomes vivem na propriedade `GARMIN_MAPA` |

---

## 6. Ordem de entrega

Três etapas, cada uma útil sozinha.

**E1 — precedência da metragem (C). ENTREGUE na v2.19.8.** O maior ganho, e o
único que **não depende da Garmin**: a coluna Nado passa a se encher com o
treino escrito, para qualquer atleta, com ou sem relógio. Resolve a digitação
dupla.

O que entrou: `metragemDoDia` decide a fonte; `diasDaProntidao` faz a tabela
ser a **união** dos dias do relógio com os dias de treino feito (antes um dia
de treino sem check-in não tinha linha nenhuma); `VOLDIA`, preenchido por
`coletarEsforcos` depois do teste de `treinoFeito`, guarda a metragem escrita;
`nadoF:'mao'` dá procedência ao que foi digitado, como `hrvF` já dava à VFC.
A tabela marca a fonte: **inf** para informado, **tr** para treino escrito,
nada para o relógio. Número sem marca e sem atividade é do export antigo — e
aí o app **não alega origem**, porque não sabe.

**E2 — pareamento (A).** Prescrito × realizado na tela do treino. Depende de o
push estar funcionando, o que depende do merge da v2.19.6.

**E3 — atividade sem treino (B), com águas abertas.** O maior volume de código
novo: forma nova de cartão, tabela de tipos, e a decisão de interface sobre
onde ele aparece no calendário.

---

## 7. O que ainda não sabemos

**Se a Garmin tem os treinos de 17/11 e 19/11.** O Bruno nadou em 16, 17, 19 e
23/11. O reenvio do portal devolveu atividade só em 21 e 23. Em 16/11 a culpa
foi minha — montei as janelas de 19:27 às 19:27 no horário local em vez de
meia-noite a meia-noite, e o nado de segunda ficou fora da varredura. Mas 17/11
e 19/11 **estavam** dentro das janelas e voltaram vazias.

Enquanto isso não for verificado no Data Viewer do portal, **o desenho não pode
supor que o relógio tem todos os treinos**. Se ele não tem, A e B não fazem
nada por esses dias, e C é o único mecanismo que ajuda — o que é mais um
argumento para E1 primeiro.

**A retenção da Garmin é de 7 dias.** Histórico anterior a isso continua
entrando só pelo ZIP do export. Nenhum destes três mecanismos muda isso.

---

## 8. Pendência fora deste desenho

~~A `main` está na v2.19.3 e não lê `ativs`.~~ **Resolvido:** a v2.19.6 foi
mesclada em 23/11 (PR #136), e a `main` passou a ler `ativs`. A v2.19.7 e esta
v2.19.8 seguem na `relatorio-marca`, esperando o próximo merge.
