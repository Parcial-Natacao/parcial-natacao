# SDD — Meros360

**Documento de direção do software.** É o contrato do projeto: o que não pode
quebrar, o que já foi decidido, o que precisa ser testado antes de cada merge,
e o que está pendente de quem.

Este arquivo é mantido por **todos que trabalham no projeto** — Bruno, Claude e
ChatGPT. Quem muda o app atualiza este documento no mesmo commit.

> **Por que ele existe.** Em 14/10/2026 um defeito gravou os dados de um atleta
> no perfil de outro e destruiu VFC, sono, check-in, exames e sessões fora
> d'água. Várias correções desta lista nasceram daquele dia. Um documento que
> diga só "o que o app faz" não teria evitado nada; este diz **o que não pode
> voltar a acontecer** e **como verificar**.

**Os outros documentos continuam valendo** e não são substituídos por este:

| arquivo | para quê |
|---|---|
| `ARQUITETURA.md` | o mapa técnico: estado `S`, `render()`, motor de performance |
| `ESPECIFICACAO.md` | regras de negócio e perfis |
| `CONTRIBUTING.md` | fluxo de trabalho e padrões de código |
| `README.md` | visão geral e setup |
| **`SDD.md`** | **invariantes, decisões, testes obrigatórios e pendências** |

---

## 0. Como manter este arquivo

1. **Mudou comportamento?** Atualize a seção correspondente no mesmo commit.
2. **Decidiu algo que não se quer rediscutir?** Vai para §2. Decisão sem registro
   volta como pergunta daqui a duas semanas.
3. **Descobriu uma armadilha que custou tempo?** Vai para §5. O objetivo é que o
   próximo não pague de novo.
4. **Quebrou um invariante de propósito?** Não remova a linha: edite-a dizendo o
   que mudou e por quê. Invariante apagado em silêncio é como se nunca tivesse
   existido.
5. **Nunca** marque uma pendência de §4 como resolvida sem a evidência (saída de
   teste, print do console, data da publicação).

---

## 1. Invariantes — o que não pode quebrar

Cada um existe por causa de um defeito real. A coluna *verificar* diz como
provar que ainda vale.

### 1.1 Propriedade do dado

| invariante | por quê | verificar |
|---|---|---|
| Todo `pro_` carrega `_dono` com o uid do dono | o objeto não dizia de quem era, e a gravação levava o que estivesse em memória | `proVazio()` e `comDono()` carimbam; teste `dono` |
| `salvarPro`/`salvarSaude` recusam gravar quando `S.pro._dono` ≠ uid | trava por **inclusão**: pega dados alheios vindos de qualquer caminho, não só do espelho | testes `dono`, `espelho` |
| `camposSeguranca` deriva `dono` de `pro_` do **conteúdo**, nunca da chave | é o que faz o Firestore recusar no servidor; derivando da chave, gravar no próprio documento sempre passava | teste `dono`; comentário no `firestore.rules.v2` |
| `ehMeuPro()` nas regras aceita `pro_<uid>` **e** `pro_<uid>_*` | Saúde e versões diárias usam sufixo; exigir a chave exata bloqueia as duas | `firebase/regras.test.mjs` casos 37–39 |
| O espelho (`abrirLaudoAtleta`) carrega `_espelho` **e** `_dono` do outro atleta | denuncia a si mesmo se escapar para uma gravação | teste `espelho` |

### 1.2 Integridade da gravação

| invariante | por quê | verificar |
|---|---|---|
| Saúde vive em `pro_<uid>_sau` e é **fonte de verdade na leitura** | um defeito em Marcas não pode alcançar VFC, sono e check-in | teste `saúde` |
| Gravação que zera uma coleção de 3+ itens é recusada | apagamento em massa quase sempre é defeito, não intenção | teste `trava` |
| Apagar de propósito passa `{apagando:true}` | a trava não pode impedir o usuário de apagar o que quer | revisar toda chamada nova de `salvarSaude`/`salvarPro` |
| Gravar **une** com o servidor por chave natural (dia, id) | dois aparelhos: o último a escrever apagava o que o outro acrescentou | teste `aparelhos` |
| Exclusão **não** mescla | união ressuscitaria o item que se quis remover | teste `aparelhos` |
| Importar duas vezes não soma duas vezes | cada item tem chave própria; totais do dia são derivados | teste `garmin` |
| Apagar conta leva `pro_`, `pro_*_sau`, as 8 versões, `kPerf` e os anexos | prometer exclusão e guardar dado de saúde é pior que não prometer | função `apagarDadosDaConta` |

### 1.3 Honestidade com o usuário

| invariante | por quê | verificar |
|---|---|---|
| Nenhuma operação falha em silêncio | offline o app travava sem dizer nada, e o usuário relançava tudo | teste manual offline (§3.3) |
| Nada é prometido sem confirmação | "salvo neste aparelho — sincroniza quando a internet voltar" | `gravarComEspera` |
| Ausência de alarme é dita, não omitida | cartão que some vira "não existe" na cabeça de quem procura | `cardConferirGarmin`, `cardCaixaPreta` |
| Procedência viaja com o dado | VFC da noite ≠ média semanal; parcial oficial ≠ digitada | `hrvF`, `origemParc`, `serieHRV` |
| Referência é do atleta, não universal | 6,5h de sono para todo mundo dizia que um atleta de 7h39 estava bem | `refSono`, `faixaHRV` |
| Recusar é melhor que concluir fraco | cobertura < 60%, histórico < 8 semanas, amostra < 6 tiros | teste `extrato` |
| Estimativa não vira score | gordura implausível entra em quarentena | `composicaoEstim` |
| Marcador de contexto explica, **não corrige** | viagem e queda de forma não podem gerar o mesmo alarme | teste `contexto` |

### 1.4 Limites assumidos

- **Nenhum diagnóstico clínico.** A dissociação de carga é *nomeada* — "vale
  verificar a possibilidade de overtraining… diagnóstico preciso é clínico".
- **Nenhuma recomendação de perda de peso.** Não há, no histórico do atleta,
  medição que ligue variação de peso a variação de tempo.
- **Nenhum alvo de passagem vindo de tabela.** A literatura entra como contexto;
  a referência é a própria história do atleta.
- **`IA_URL` fica vazio.** Aquele caminho enviaria exames, bioimpedância e VFC a
  um worker externo sem token, quota ou limite.

---

## 2. Decisões tomadas — não rediscutir sem motivo novo

| decisão | quando | razão |
|---|---|---|
| PRO **não** administra equipe; só técnico da equipe ou administrador | out/2026 | PRO é atleta competitivo; as regras publicadas exigem `perfil == 'tecnico'` |
| Administrador global lê o `pro_` de qualquer conta | — | permite suporte e recuperação; **declarado no guia**, não escondido |
| Saúde em documento próprio | v160 | limitar o raio de um defeito |
| Extrato por **mês de calendário**, comparação normalizada por semana | v169 | é como atleta e técnico pensam; 28 vs 31 dias falseia a comparação |
| Mínimo de **8 semanas** para comparar | v169 | abaixo disso não há base do próprio atleta |
| Extrato mora no **calendário da aba Treinos**, recolhido | v172 | é onde já se navega mês a mês; aberto viraria ruído diário |
| Faixa de VFC = média ± 1 desvio, 60 dias, excluindo hoje | v173 | o dia julgado não pode entrar no próprio julgamento |
| **Strava está fora** | out/2026 | a política proíbe combinar dados e uso em IA, incluindo derivados |
| Sem app nativo por enquanto | — | sincronização automática exigiria HealthKit/Health Connect |
| Identificadores de armazenamento **não** são renomeados | — | `PFX='parcial_'`, projeto `parcial-cdb0e`, chaves `u_`/`pro_`/`eq_` |

---

## 3. Testes obrigatórios

### 3.1 Sempre, antes de qualquer merge

```
1. Abrir o app servido localmente e conferir o console: zero erro no load.
2. rodarTestes() no console  →  todos passando, sem exceção.
3. VER (index.html) e VERSAO (sw.js) incrementados JUNTOS.
4. git fetch && git merge origin/main  — antes de começar e antes de pedir merge.
```

A suíte vive dentro do `index.html` e roda contra as funções reais, no mesmo
ambiente de produção. **Cada regressão corrigida tem um caso** — é isso que
impede o conserto de hoje de voltar no mês que vem.

### 3.2 Quando mexer nas regras do Firestore

```
cd firebase && npm run test:rules      # precisa de Node + emulador
```
Depois **republicar no console** (Firestore › Regras). Publicar antes de mergear
o app correspondente pode quebrar o que está no ar.

### 3.3 Quando mexer em gravação, sincronia ou importação

Reencenar, no navegador, com banco simulado:

| cenário | o que provar |
|---|---|
| Espelho de outro atleta + troca de chapéu | gravação bloqueada; `S.pro` devolvido |
| `fdb.disableNetwork()` e salvar | retorna em segundos, avisa, não trava |
| Dois aparelhos, mesmo documento | o que o outro acrescentou sobrevive |
| Importar o mesmo arquivo duas vezes | totais não dobram |
| Apagar item | continua apagando (a união não o ressuscita) |

### 3.4 Antes de convidar alguém novo

- Rodar a versão por alguns dias em uso real.
- Conferir que as regras publicadas são as do repositório.
- Exportar um backup e confirmar que **não** vem vazio.

---

## 4. Pendências

### 4.1 Com o Bruno

- [ ] **Revisão dos cálculos por profissional de ciência do esporte.** É a maior
      dívida em aberto, e não é técnica. Um piloto acompanhado começa a pagá-la.
- [ ] Rodar `npm run test:rules` em máquina com Node (aqui não há).
- [ ] Decidir sobre plano Blaze — destravaria PITR (hoje inexistente no Spark) e
      o Storage para anexos.

### 4.2 Com quem desenvolve

- [ ] Série mês a mês no extrato ✅ (v170) — manter ao evoluir o extrato.
- [ ] Avaliar importar VFC de outros apps (ex.: HRV4Training) **declarando a
      procedência**: RMSSD de origens diferentes não se mistura.
- [ ] Registro por atividade já existe para o Garmin; estendê-lo a outras fontes
      quando houver integração.

### 4.3 Nunca fazer

- Commitar `github-recovery-codes.txt` ou qualquer arquivo de recuperação.
- Preencher `IA_URL` sem antes pôr token, quota e limite no worker.
- Derivar `dono` de `pro_` a partir da chave.
- Publicar regras que exijam chave exata `pro_<uid>`.

---

## 5. Armadilhas conhecidas

Cada uma custou tempo de verdade.

| armadilha | sintoma | como evitar |
|---|---|---|
| `${...}` fora de template literal | `SyntaxError: missing ) after argument list` | usar `/* */` em comentário dentro de array/código |
| Zona morta temporal (`const`) | erro engolido por um `try` | declarar antes de usar; conferir a ordem no arquivo |
| `_atleta()` usa o **e-mail do administrador** | teste "passa" por engano | usar `_naoAdmin(perfil)` quando o caso é de não-admin |
| `S.gestao` e `S.adminOrig` vazam entre testes | teste seguinte quebra sem motivo | zerar no início de cada caso |
| Sincronia de 12 s troca `S.pro` | fixture some no meio do teste no preview | `S.escrevendo=true` durante o teste |
| Heredoc grande no bash | `unexpected EOF` | escrever o trecho num arquivo e inserir por script |
| Branch paralela no mesmo `index.html` | conflito gigante no fim | `git fetch && git merge origin/main` **antes** de começar |
| Esquecer `VERSAO` no `sw.js` | usuário fica na versão antiga sem saber | incrementar os dois no mesmo commit |
| Cache do console do navegador | erro antigo parece atual | validar em aba nova antes de culpar o código |

---

## 6. Estado atual

| | |
|---|---|
| Versão | ver `const VER` em `index.html` e `VERSAO` em `sw.js` — devem ser iguais |
| Casos de teste | ver o contador em Conta › Diagnóstico › Rodar testes |
| Endereço | `meros360.com` |
| Projeto Firebase | `parcial-cdb0e`, plano **Spark** (sem PITR, sem Storage) |
| Regras publicadas | conferir em Firestore › Regras; devem bater com `firebase/firestore.rules.v2` |

Para não criar uma segunda fonte de verdade, **este documento não repete o
número da versão nem a contagem de testes**: os dois vivem no código e no app.
