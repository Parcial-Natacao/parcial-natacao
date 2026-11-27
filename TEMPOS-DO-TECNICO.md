# Desenho — o técnico lançando os tempos de todo mundo

**Status: desenho. Nada implementado.** Escrito em 27/11/2026, depois de um
treino em que só um atleta teve os tempos lançados pelo técnico e o resto teve
que lançar à mão.

> Hoje o treino envolveu um broken. Cada atleta fez um broken diferente: Bruno
> fez 1×50 livre e 1×50 peito, Rafael fez 1×100 livre (dividido em 4×25) e
> 1×50 livre, Alexandre fez 1×50 peito e 1×100 livre (4×25). Precisamos de uma
> solução para o técnico poder lançar os tempos de todos os atletas.

São **dois** problemas, e eles têm causas diferentes. Misturar os dois foi o que
fez a sessão de ontem terminar com um atleta lançado e três na mão.

---

## 1. O que já funciona, e é importante não reconstruir

**A divisão do broken já é por atleta.** `brokenDe` lê `rec.bkTrecho` — a
escolha de trechos fica no registro de cada um. Dois atletas no mesmo item,
um dividindo em 4×25 e outro em 2×50, já é caso resolvido.

**O técnico já troca de atleta** na tela do treino: há uma faixa de botões com
o elenco, e `S.atletaSel` manda em qual registro a tela escreve.

**Cada atleta já tem o seu registro separado**, em
`t.registros[atletaId][itemId]`, com tempos, parciais e rodadas.

Ou seja: a máquina de gravar tempo por atleta existe e funciona. O que falta é
outra coisa.

---

## 2. O buraco: a distância e o estilo são do TREINO, não do atleta

O item do treino carrega `dist` e `estilo`. Eles descrevem o que foi
**prescrito**, e valem igualmente para todos os inscritos.

Quando Rafael faz um broken de **100 livre** num treino cujo item é **50
livre**, não existe onde escrever. O técnico abre a tela dele e encontra um
campo de 50 — e aí só há saídas ruins:

| saída ruim | o que ela estraga |
|---|---|
| lançar o tempo do 100 no campo do 50 | o %PB compara 100 contra o PB de 50: número sem sentido, e ele entra no relatório |
| criar um segundo treino só para o Rafael | a pergunta "fiz o que foi passado?" perde o sentido, e a metragem do dia dobra |
| deixar para o atleta lançar à mão | foi o que aconteceu |

**É este o buraco, e é estreito:** falta variar `dist` e `estilo` por atleta.

---

## 3. Dois mecanismos, e por que nesta ordem

### A — Variante do item, por atleta *(resolve o caso de ontem)*

O item continua sendo um só, do treino. O que muda é que cada atleta pode ter
uma **variante** registrada: `t.registros[atleta][item].var = {dist, estilo}`.

- a variante mora **no registro**, que já é por atleta e já é gravado pelo
  técnico — nenhuma estrutura nova no documento do treino;
- quem lê o esforço (`coletarEsforcos`) passa a usar a variante quando existe,
  e é isso que faz o %PB comparar 100 com PB de 100;
- `brokenDe` já recebe o registro: a variante entra ali e o `bkTrecho` que já
  existe continua valendo, sem tocar em nada;
- a tela do atleta mostra o que **ele** fez, com uma marca discreta de que
  diferiu do prescrito.

**Não deve:** mudar `vol` do item (que é a prescrição escrita, e é o que
alimenta a metragem do dia — ver `TREINOS-E-RELOGIO.md`). A metragem real do
atleta que fez 100 em vez de 50 é assunto do mecanismo C, abaixo, e é um
problema separado que não vale resolver junto.

**Prova:** item de 50 livre, Rafael com variante de 100 livre e tempo lançado →
o esforço dele sai com `dist:100`, o %PB usa o PB de 100, e o de Bruno no mesmo
item continua saindo com `dist:50`.

### B — Tiro avulso do atleta

Para o que **não estava no treino**: o atleta fez um tiro a mais, ou o técnico
mandou algo na hora. Um item que existe só no registro daquele atleta.

Vem depois de A porque é mais código e resolve um caso menos frequente — em
quase todo treino o que varia é a distância de algo que já estava escrito, não
um tiro inteiro que ninguém previu.

### C — A metragem de quem fez diferente

Fica **declaradamente fora** deste desenho. Hoje a metragem do dia vem do
treino escrito, inteira, e isso foi decidido na v2.19.16 com um motivo que
continua valendo (o relógio não vê perna). Fazer a variante mexer na metragem
abre a pergunta "o volume do dia é o prescrito ou o de cada um?", que é uma
decisão de produto, não um ajuste. Anotada, não resolvida.

---

## 4. O segundo problema, que nenhum mecanismo acima resolve

**Lançar os tempos de quatro atletas na beira da piscina é lento demais.**

Hoje o caminho é: abrir o treino → tocar no atleta → rolar até o item → digitar
→ tocar no próximo atleta → rolar de novo. Cada troca redesenha a tela inteira
e devolve o técnico ao topo. Com o cronômetro na mão e a próxima série saindo,
isso não se sustenta — e o resultado foi três atletas lançando à mão depois.

O que o formato pede é o inverso do que existe: **um item, todos os atletas**.

```
BROKEN  ·  parte principal
┌──────────────────────────────────────────┐
│ Bruno       50 livre   [ 24.06 ] [11.40] │
│ Rafael     100 livre ▾ [ 56.80 ] [ … ]   │
│ Alexandre   50 peito ▾ [ 29.95 ] [14.33] │
└──────────────────────────────────────────┘
```

Três coisas que esta tela precisa ter, e que a de hoje não tem:

1. **a distância ao lado do nome, editável ali mesmo** — é onde a variante do
   mecanismo A é escolhida, sem abrir nada;
2. **não perder a posição** ao gravar: hoje cada gravação chama `render()` e
   joga o técnico para o topo;
3. **gravar sozinha, campo a campo**, sem botão de salvar — o técnico não vai
   lembrar de apertar nada entre duas séries.

Isto é uma tela nova, não um ajuste da existente. E é ela, não o mecanismo A,
que decide se o técnico consegue usar o app na beira da piscina.

---

## 5. Ordem de entrega

**E1 — a tela "um item, todos os atletas"**, com os tempos que já existem hoje.
Resolve o problema de velocidade sem mexer em nenhum modelo de dado. É o maior
ganho por linha escrita, e dá para usar no próximo treino.

**E2 — a variante por atleta (A)**, encaixada naquela tela: o seletor de
distância ao lado do nome.

**E3 — o tiro avulso (B)**, se depois de E1 e E2 ele ainda fizer falta.

---

## 6. O que ainda não sabemos

**Se o técnico lança durante ou depois do treino.** Se for depois, com o caderno
na mão, a tela pode ser mais densa e menos tolerante a toque errado. Se for
durante, com o celular molhado e o cronômetro na outra mão, ela precisa de alvos
grandes e nenhuma confirmação. As duas telas são diferentes, e a resposta muda o
desenho de E1.

**Quantos atletas por item, no pior caso.** Com 4 cabe na tela; com 12, a
listagem precisa de rolagem horizontal ou de agrupar por raia — e aí o desenho
muda de novo.
