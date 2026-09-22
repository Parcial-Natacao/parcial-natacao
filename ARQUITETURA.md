# PARCIAL — Arquitetura e Modelo de Dados (para análise externa)

App de performance de natação (nadador Master, foco 50/100 peito). Documento
para mapear **o que o app já coleta e como os dados estão estruturados**, de
modo que se possa propor, em cima disso, um "motor de inteligência de
performance" (Performance Score / Readiness / correlações etc.).

## 1. Stack e restrições

- **Front-end:** um único `index.html` (~3600 linhas), sem build. `<script>`
  clássico, funções globais, handlers `onclick` inline. Estado global no objeto
  `S`. Render por reconstrução de HTML (`render()` reescreve `#app`).
- **Sincronização/persistência:** Firebase (Firestore no modo "kv" chave-valor +
  Auth e-mail/senha). Abstração `DB.get(k)` / `DB.set(k,v)`. Cai para
  `localStorage` quando `FB_CONFIG` está vazio (modo teste).
- **Hospedagem:** GitHub Pages (PWA). Deploy = re-subir `index.html`.
- **IA (opcional):** Cloudflare Worker (`backend/worker.js`) que chama a API da
  Anthropic para (a) OCR de PDFs/fotos de exames, bioimpedância e fichas de
  treino fora d'água, e (b) gerar um laudo narrativo. Chave da IA fica só no
  Worker. Enquanto `IA_URL` está vazio no app, os recursos de IA ficam ocultos.
- **Perfis:** `tecnico` (gestor da equipe), `atleta` (comum), `pro` (atleta com
  poderes de gestão via código mestre — é o caso do dono/piloto).

## 2. Chaves do Firestore (coleção `kv`)

| Chave | Conteúdo |
|---|---|
| `u_<email>` | usuário (perfil, nome, cpf, nascimento, tipo, nivel, `podeMarcas`, `competicoes[]`) |
| `eq_<slug>` | equipe (nome, técnico) |
| `eq_<slug>_tridx` | índice de treinos (metadados: id, data, nivel, vol, para[]) |
| `eq_<slug>_tr_<id>` | treino completo (blocos, registros de tempos, `feito`) |
| `eq_<slug>_cidx` / `eq_<slug>_cmp_<id>` | competições da equipe (visão técnico) |
| `eq_<slug>_libs` | CPFs liberados |
| `pro_<uid>` | **dados de performance do atleta** (privado do dono pelas regras) |

As regras (`firebase/firestore.rules`) tornam `pro_*` **privado do dono** — nem
o técnico lê. É onde vivem os dados sensíveis de saúde/performance.

## 3. `pro_<uid>` — o núcleo de dados de performance

```js
{
  pbs: { "50 peito SC25": 29800, ... },   // melhores tempos (ms), chave "dist estilo piscina"
  resultados: [                            // histórico de competições (inclui import ABMN)
    { chave, comp, data, piscina, prova, dist, estilo, tempo(ms), parciais[ms], inscricao }
  ],
  garmin: [                                // 1 registro por dia
    { data:"YYYY-MM-DD", hrv, fc(repouso), sono(h), ... }
  ],
  exames: [                                // laboratório
    { id, data, vals:{ ferritina, hemoglobina, vitD, ck, testo, tsh, ... }, obs }
  ],
  bioimp: [                                // bioimpedância
    { id, data, peso, gordura(%), musculo(kg), agua(%), visceral, ossea, tmb, altura }
  ],
  seco: [                                  // treino fora d'água (musculação/core/...)
    { id, data, tipo, obs, transcricao, img|arquivo }
  ]
}
```

## 4. Modelo de treino (piscina)

Treino → `blocos[]` → `itens[]`. Item:
```js
{ id, rodadas, reps, dist, estilo, tags[], intervalo, pausa, parcial(bool), forte, obs, texto, vol }
```
- `rodadas` = séries duplas ("2x 4x50" → rodadas=2, reps=4, dist=50).
- **Tempos lançados** (por atleta): `treino.registros[atletaId][itemId]`:
  - série simples: `{ tempos:[ms|null,...], parciais:[...], em, por }`
  - série dupla: `{ rd:[ {tempos,parciais}, ... ], em, por }`
  - águas abertas: `{ ritmo100: ms }`
- `treino.feito[atletaId]` = concluído (só treino "feito" entra na consolidação).
- **Interpretador de texto** (`interpretar`/`linhaParaItem`): lê o treino colado
  em texto livre e extrai blocos, distância, estilo, reps, rodadas, intervalo,
  pausa, se é tiro/parcial. Também importa treino em PDF.

## 5. O que o relatório JÁ calcula (`telaRelatorio` + funções)

- **Esforços** (`coletarEsforcos`): achata todos os tempos de treino do atleta em
  esforços `{data, dist, estilo, tempo, p1(parcial), forte, vol}`.
- **%PB** por esforço (`pbDe`): tempo vs melhor marca; zonas.
- **Estado de Performance** (`estadoPerformance`): Prontidão 0–100 (VFC/FC/sono/
  carga vs base), Capacidade (%PB médio recente), Tendência (evolução).
- **Carga aguda × crônica (ACWR)** (`cargaACWR`): vol 7d ÷ média semanal 28d.
- **Custo do 2º 25** e **speed drop %** (parciais dos tiros de 50).
- **Composição × desempenho**: massa magra = peso×(1−%gordura); relação peso/potência.
- **Correlações** (`correlacoes`): recuperação(VFC no dia)×%PB; carga semanal×%PB.
- **Prontidão** qualitativa; **exames** e **bioimpedância** com tendências e
  flags (faixas de referência esportivas); **evolução em competições** por prova.
- **Laudo consolidado** (regras) + **laudo por IA** (narrativo, via Worker).

## 6. O que AINDA NÃO é capturado (lacunas para evoluir)

- **Sono/RPE/stress/frequência respiratória** estruturados (Garmin traz sono
  parcial; RPE não é coletado). Sem isso, "carga interna" (TRIMP) é limitada.
- **Métricas finas de natação**: stroke rate, distância por braçada, 15m,
  breakout, turn time (exigiria dado de vídeo/sensor).
- **Carga de força/corrida quantificada** (o "fora d'água" hoje é texto, não vira
  carga numérica).
- **Baseline individual** e **predição** ("qual seria meu 50 hoje?") ainda não
  existem — os cálculos usam heurísticas transparentes, não modelo aprendido.

## 7. Como está desenhado o caminho de evolução

O relatório já faz a "interpretação única" de forma incremental (laudo
consolidado + laudo por IA). Os próximos passos naturais, sem reescrever o app:
baseline individual por atleta, predição de tempo com intervalo de confiança,
e um "Performance Fingerprint" (radar) a partir das dimensões que já existem
(velocidade, manutenção, composição, recuperação, tendência).

## 8. Atualização recente (já implementado — v68)

- **Projeção de tempo: viés corrigido + autocalibração (v68)**. Motivo: numa competição real
  o app projetou **32.28–33.93** para 50 peito LC50 (PB 31.35) e o atleta nadou **31.00** —
  erro de 6,8% no centro, com a faixa inteira *mais lenta que o próprio PB*. Causas e correções:
  1. **A faixa não representava incerteza.** Era fixa (±2,5% no 50) e a discordância entre
     métodos só baixava um número. Agora a banda é composta por evidência — poucos tiros
     (`nEff`), discordância entre candidatos, ausência de histórico de prova e dispersão
     residual da calibração **alargam** a faixa (teto 9%).
  2. **O "confiança %" não era probabilidade** (é soma de quantidade de dados). Renomeado para
     **qualidade dos dados** (`p.qual`); a incerteza passou a estar na largura da faixa.
  3. **O modelo projetava forma de TREINO, não prova.** `raceEst` agora devolve forma de treino
     pura (removido o `×0.97` embutido) e a conversão treino→prova é explícita e aplicada uma
     única vez em `baseProva`: **saída de bloco** com ganho ABSOLUTO (`ganhoSaida` = 600 ms;
     250 ms no costas, que parte da água) + **taper** (`GANHO_TAPER` = 2%). Modelar a saída como
     % era o principal viés lento. Removida a multa fixa de +1,5% "não afinado".
  4. **Âncora no PB**: sem sinal de destreino (`tend==='↓'` ou prontidão < 45) o centro não
     passa de `pb*1.025` (destreinado: `pb*1.06`) e a faixa **nunca exclui o PB**.
  5. **Autocalibração** (`calibProva`): para cada competição em `pro.resultados`, recalcula a
     base com **só os tiros anteriores àquela data** (`melhorTempo`/`raceEst` ganharam o
     parâmetro `ate`) e aprende `real/previsto`. Média geométrica encolhida (`k^(n/(n+1))`),
     hierarquia prova+piscina → prova → histórico geral. É o que impede o erro de se repetir.
  Resultado no caso real: antes `32.26–33.91` (não continha 31.00); agora `30.52–33.74` sem
  calibração e `30.40–32.93` (centro 31.66) após registrar a prova.
- **%PB da série pela média (v68)**: em `linhaSerie` o badge de zona usava `Math.min(...ts)`
  (só a repetição mais rápida). Passou a usar a **média dos tiros da série** — representa a
  qualidade real da série, não o melhor tiro isolado. `mel` continua marcando o melhor tiro
  (chip `best`) e o tooltip mostra os dois. **Atenção:** os cortes de `zona()` (96/90/84) foram
  calibrados para "melhor tiro"; com média os %PB caem e podem precisar de reajuste.

### v67

- **Relatório: intensidade em vez de sessão + assinatura/correlações no topo (v67)**:
  removida a "sessão sugerida" (`diag.sessao`/`diag.descanso`) do `cardPlanoAcao` — o app não
  sugere treino. No lugar, `recomendaIntensidade(motor)`: a partir de ACWR/monotonia (fadiga) +
  prontidão (Garmin ou check-in), diz **Reduzir / Manter / Pode aumentar** a intensidade. O
  plano agora tem "intensidade dos treinos" + "pontos a trabalhar" (`diag.foco` não-competição)
  + "para a competição". Ordem do topo do relatório: cabeçalho → **resumo → assinatura de
  sprint (`cardFingerprint`) → correlações (`cardCorrelacoes`) → plano** → laudoIA → divisória
  detalhamento. `cardFingerprint`/`cardCorrelacoes` removidos das posições antigas (sem duplicar).

### v66

- **Atleta lança os próprios tempos na competição da equipe (v66)**: antes, ao abrir uma
  competição da equipe, o atleta via só "Aguardando o técnico". Agora `telaCompAtleta` (modo
  competição aberta) mostra um botão **"Lançar/Editar meus tempos"** por prova do atleta
  (filtro por `atletaId===S.u.id` OU nome igual). `abrirTempoCompEquipe(ip,ii)` abre uma folha
  com N campos de passagem (a cada `passoDe`, `nPassagens`) e `salvarTempoCompEquipe` grava as
  parciais acumuladas direto no doc `eq_<slug>_cmp_<id>` via `mutarComp` — o técnico vê na hora.
  Valida monotonia; aceita só o final. Consolidação em Marcas segue pelo botão existente.

### v65

- **Competições: apagar + fim das duplicatas (v65)**: a lista de competições da equipe não
  tinha como apagar. Adicionado `apagarCompeticao(id,nome)` (gestor/dev): apaga `eq_<slug>_cmp_<id>`
  + remove do `cidx` + fecha se aberta; botão ✕ em cada item da lista (lista virou `div`, não
  `button`, para caber o ✕). `carregarDados` **de-duplica o cidx por id** (recuperações/fusões
  antigas podiam repetir) e regrava. `incorporar` agora **faz merge** em vez de empilhar: casa a
  prova por CÓDIGO (senão dist+estilo+gênero) e o inscrito por matrícula/nome — reimportar o
  mesmo balizamento não duplica. Parser `parseBalizamentoEquipe` validado no PDF real (XXXI Copa
  Brasil Masters): puxa Bruno (131532) — 50 peito 31.35, 50 livre 26.53, 200 peito 2:51.96 — e
  os demais da A3.

### v64

- **Relatório reorganizado: Resumo + Plano de ação no topo (v64)**: o laudo começava com cards
  soltos e repetia "o que priorizar" (laudo consolidado pág.4 = diagnóstico pág.6). Agora:
  `cabecalhoRelatorio` (provas-alvo) → **`cardResumoExec`** (narrativa assertiva do estado +
  KPIs capacidade/tendência/prontidão + Pontos fortes/A melhorar derivados da assinatura de
  sprint) → **`cardPlanoAcao`** (o que fazer: "Nos treinos" = `diag.foco` não-competição
  ordenado warn→neutro→ok + sessão sugerida `diag.sessao` + `diag.descanso`; "Para a competição"
  = provas em queda/evolução + projeção da prova principal) → divisória "detalhamento · dados de
  apoio" → cards detalhados. Removidos os cards duplicados `laudoConsolidado` e o "diagnóstico"
  avulso (conteúdo agora no Resumo/Plano). `laudoConsolidado()` segue definido mas não é chamado.

### v63

- **Fix duração/sono + confiabilidade do salvamento (v63)**:
  - `durMin` 2 partes agora é **mm:ss** (46:17 = 46,28 min), não mais hh:mm (que dava 2777);
    3 partes = hh:mm:ss (1:15:30 = 75,5); plano = minutos. Casa com o que o relógio mostra.
  - `horasFlex` (sono) aceita também "5h45"/"5h45min" (→5,75); 2 partes = hh:mm.
  - Labels de duração → "mm:ss ou hh:mm:ss".
  - **Persistência offline do Firestore** (`fdb.enablePersistence({synchronizeTabs:true})`): a
    gravação confirma localmente na hora e sincroniza em 2º plano — elimina o "lapso" entre
    salvar e ver salvo, e funciona offline.
  - `setSessao` (RPE/duração da sessão) virou **otimista** (atualiza a tela na hora) + toast
    "Salvo ✓" (antes era silencioso → desconfiança).

### v62

- **Rodadas no lançamento de parciais (v62)**: `abrirSplits` ganhou o mesmo mecanismo de rodadas
  do fluxo normal — abas "Rodada N" + botão "+ adicionar rodada" (reusa `addRodada`); edita a
  rodada atual `rec.rd[S.rd]` (ou o rec simples se nrd=1). `salvarSplits` grava na rodada atual
  (`gravarReg` com rdIdx=S.rd). O split passou a rotear mesmo com rodadas (removido o gate
  `nrd<=1`). O chip de rodadas (ramo `multi` de `linhaSerie`) agora mostra os trechos de cada
  rodada quando `parciais[ix]` é array.

### v61

- **Parcial 25/50/100m + botão "+" (v61)**: o seletor de parcial passou a oferecer todos os
  intervalos válidos p/ a distância — `intervalosValidos(dist)`=[25,50,100].filter(iv<dist &&
  dist%iv==0). `splitElegivel` agora inclui 50m (dist≥50), então o 50m entra no fluxo de
  passagens (a cada 25m; 2 passagens) em vez da tabela legada; padrão 50m p/ 100+ e 25m p/ 50m.
  `coletarEsforcos` extrai o `p1` (split de 25m dos 50m, p/ o "custo do 2º 25") do escalar OU da
  1ª passagem do array. O botão de lançamento virou **"+"** (e **✎** quando já tem tempo), sem
  o texto "TEMPO". Só roteia p/ split quando não há rodadas (rodadas usam a tabela legada).

### v60

- **Parciais 50m OU 100m à escolha (v60)**: `abrirSplits` ganhou seletor "a cada 50m / a cada
  100m" (`setSplitInt`→`S.splitReg[itemId]`); `intervaloSplit` decide o intervalo (escolha atual
  > inferido de `dist/nº passagens` salvo > 50). `splitElegivel` (ex-`nPass50`) = parcial &&
  dist≥100 && %50 && ≠AA. Passagens = dist/intervalo; parse com `(k+1)*intervalo`. O seletor só
  aparece quando cabe 100m e dist>100 (100m fica só em 50m). Pré-preenche apenas se o array
  salvo tem o mesmo nº de passagens do intervalo atual. Não persiste o intervalo — infere do
  tamanho do array na reabertura.

### v59

- **Botão "+ tempo" robusto p/ esforços cronometrados (v59)**: o interpretador roda no PUBLICAR
  e grava os blocos; a correção de blocos da v57 só valia p/ treinos NOVOS. Fix render-time:
  `semCrono` agora também exige `!i.parcial && !i.forte` — uma série marcada como parcial/forte
  (simulação, tiro) SEMPRE recebe o botão, mesmo em bloco rotulado "solto". Conserta treinos já
  salvos com a estrutura antiga (o 1x200 parcial no bloco Aquecimento volta a ter "+ tempo" e
  abre as parciais de 50m) sem republicar.

### v58

- **Parciais a cada 50m (100/200/400) — v58**: `nPass50(item,piscina)` = dist/50 quando
  `parcial && dist>=100 && dist%50===0 && piscina≠AA` (50m e não-parcial seguem no fluxo antigo).
  `abrirLancamento` desvia para `abrirSplits` (uma folha com N campos por repetição, tempos
  ACUMULADOS por passagem) e `salvarSplits` (parseia com `(k+1)*50` p/ não misparsear o split
  ~30s; checa monotonia; grava `rec.parciais[rep]`=array cumulativo, `rec.tempos[rep]`=última
  passagem=total). O chip da série mostra os **trechos** de 50m quando `parciais[ix]` é array.
  `coletarEsforcos` guarda `p1` só quando escalar (50m tiro) — o array não vaza para o brk.

### v57

- **Fix: séries em seções não reconhecidas perdiam o "+ tempo" (v57)**: quando o técnico usava
  seções como "Simulação/Preparação/Recuperação" (fora da lista `CABECA`), a série principal
  caía no bloco anterior ("Aquecimento") — tratado como `blocoSolto` → séries de 1 repetição
  ficavam `semCrono` (sem botão). Fix: `CABECA` ganhou `simula|prepara|recupera|trote|set|bloco
  princip|prova teste`; a linha de cabeçalho só vira TAMBÉM item se traz `NxDist` explícito
  (evita título com número solto virar série duplicada); `blocoSolto` inclui `recupera|regenerat|
  trote`. Resultado: a série 1x200 fica no bloco "Simulação" (não-solto) e recebe o botão.
- **Pendente conhecido**: parcial é só 1 split em `dist/2` (100m no 200); registrar 4×50m
  precisaria de multi-split no lançamento (não feito).

### v56

- **Fix NaN em sono/duração hh:mm (v56)**: campos que faziam `+valor` viravam NaN ao receber
  `hh:mm` (e o JSON gravava null → dado apagado). Novos parsers tolerantes: `horasFlex` (sono →
  horas: "7:30"=7.5) e `durMin` (duração → minutos: "1:30"=90, "1:30:00"=90; 2 partes = hh:mm,
  ≠ do antigo `hmsParaMin` que lia mm:ss). Aplicados: sono do check-in e "Sono h" manual
  (`horasFlex`), duração da sessão de piscina (`setSessao dur`) e do treino fora d'água
  (`salvarSeco`/skDur) via `durMin`. Exibição do sono blindada contra NaN.

### v55

- **Saúde e Marcas em acordeões (v55)**: helper `acc(id,titulo,sub,conteudo)` + `toggleAcc(id)`
  (estado em `S.acc`); CSS `.acc-h/.acc-chev/.accbody` (achata `.card` aninhado no corpo).
  **Saúde**: seções recolhíveis Check-in diário (`cardCheckin` virou conteúdo interno +
  `checkinSub`), Prontidão, Importar/lançar, Exames (inclui `cardHistoricoSaude`), Bioimpedância
  (inclui `cardHistoricoBio`). **Marcas**: Importar ABMN, Piscina curta·25m, Piscina longa·50m,
  Provas-alvo, e **histórico de competições agrupado por prova** (um acordeão por prova →
  resultados + gráfico de evolução `graficoLinha` no fim); `cardEvolucao` avulso removido da tela.

### v54

- **Tendência ponderada pela magnitude (v54)**: antes contava só quantas provas
  melhoraram/pioraram (`net`); agora usa o TAMANHO da melhora. Em `estadoPerformance`:
  `magProvas` = % média de melhora nas competições ((primeiro−último)/primeiro por prova, +=melhorou);
  `pc` = tendência do %PB nos treinos (metades); `mag = magProvas + pc*0.5` (competição pesa cheio,
  treino metade); `dir` por zona morta ±0,4%. `tend` ganhou `magProvas/mag/detalhe` (mantidos
  `net/dir/txt/cor/nEv/nPct` p/ compat com cardEstado). `fingerprintDims` tScore = `50 + mag*10`
  (±5% satura), texto usa `tend.detalhe`.

### v53

- **Assinatura de sprint completa p/ o técnico, sem exames (v53)**: o eixo **Composição** da
  assinatura vem de `composicaoEstim(pro)` (usa `pro.bioimp`). O snapshot `kPerf` passou a
  incluir `bioimp` (peso/gordura/água) e `abrirLaudoAtleta` carrega em `S.pro.bioimp` — assim o
  laudo do técnico mostra a assinatura com os 5 eixos. `exames` e `garmin` (VFC/sono) continuam
  **fora** do snapshot (privados). Nenhum dos 5 eixos usa exames.

### v52

- **Prontidão do atleta no painel do técnico (v52)**: `salvarPro` passou a gravar no snapshot
  `kPerf` apenas o **placar** `prontidao:prontidaoSubj(7)` ({media,hoje,n}) — não as respostas
  cruas do check-in (sono/dor/humor ficam privadas no pro_). `calcFadigaAtleta` lê `perf.prontidao`
  e o retorna (mesmo quando não há carga); `cardFadigaAtleta` mostra um bloco de prontidão
  (média 7d + veredito `veredictoProntidao`) junto do resumo de fadiga.

### v51

- **Check-in diário subjetivo — prontidão sem relógio (v51)**: para atletas sem Garmin.
  `cardCheckin()` no topo da aba Saúde: 5 perguntas 1-5 (sono, energia, dor, estresse, humor)
  + sono(h)/FC repouso opcionais; usa `S.checkinDraft` (seed do registro de hoje). `salvarCheckin`
  grava no registro diário `S.pro.garmin[data]` (campos `sonoQ/energia/dor/estresse/humor`).
  `checkinScore(x)` = (sonoQ+energia+humor+(6-dor)+(6-estresse)-5)/20*100 → 0-100 (dor/estresse
  invertidos). `prontidaoSubj(7)` média 7d; `veredictoProntidao` (≥75 pronto / ≥50 moderado /
  <50 baixa). `cardProntidaoSubj()` no relatório (após `cardFadiga`). Fica no pro_ (privado);
  não vai ao snapshot do técnico (consistente com "sem Saúde").
- **v50**: relatório do atleta visto pelo técnico usa `nomeLaudo()` (nome do atleta, não do técnico).

### v49

- **Gestão de elenco + permissões — Etapa 2 (v49)**:
  - **PRO lança treino de piscina** com o lançador do técnico: `telaTreinosAtleta` roteia
    `S.sub==='novo'`→`telaNovoTreino` p/ PRO; botão "+ Piscina" (`novoTreinoPro` fixa
    `selMulti=[self]`); em `telaNovoTreino` o card "quem recebe" só aparece p/ `ehGestor()`
    (PRO vê "treino pessoal"); `salvarTreino` grava `criadoPor` e no store da equipe →
    **o técnico vê** (aparece em `S.tridx`/"últimos treinos" do atleta). PRO edita o próprio
    treino (`Editar` liberado p/ `t.criadoPor===S.u.id`).
  - **Técnico abre o RELATÓRIO COMPLETO do atleta**: botão "Ver relatório completo" em
    `telaAtletaDetalhe`→`abrirLaudoAtleta(id)`: carrega o snapshot `kPerf` (SEM Saúde), guarda
    `S._proBak` e aponta `S.pro` p/ o snapshot (garmin/exames/bioimp vazios); `S.laudoAtleta`
    faz `telaElenco` renderizar `telaRelatorio` (motor recalcula). `coletarEsforcos` usa
    `_alvoId()`/`_alvoEq()` (natação dos treinos da equipe do atleta). Cabeçalho com "‹ Equipe"
    (`voltarLaudo`) + nome; "Enviar" oculto. `carregarDados` não sobrescreve `S.pro` enquanto
    `S.laudoAtleta` ativo; `voltar`/`irPara` restauram via `_limparLaudo`.
  - Hardening: "Na equipe desde" tolera `criadoEm` ausente.

### v48

- **Gestão de elenco + permissões — Etapa 1 (v48)**:
  - `temPro(u)` = pro OU podeMarcas OU podeSaude OU podeRelatorio; substitui os gates de carga
    de `S.pro`/`salvarPro`. Abas Saúde/Relatório/Marcas liberáveis por atleta (flags no user).
  - `render`/`navBar`: para atleta comum, abas Marcas/Saúde/Relatório aparecem conforme as
    flags. Aba "Elenco" do técnico renomeada para **"Equipe"** (key segue `elenco`).
  - `telaAtletaDetalhe` (técnico): linha **Equipe**; card **situação · carga & fadiga**
    (`cardFadigaAtleta`→`calcFadigaAtleta`: natação dos treinos da equipe + fora d'água do
    snapshot; `veredictoFadiga`: pode subir carga / gerir carga / alerta overtraining — SEM
    Saúde); 3 toggles de liberação (`togglePermAtleta`); **Remover da equipe**
    (`removerDaEquipe`: tira da equipe sem apagar o cadastro).
  - `telaElenco` (Equipe): card **incluir atleta existente** por e-mail (`incluirNaEquipe`).
  - **Snapshot de performance** `eq_<slug>_perf_<uid>` (kPerf) gravado em `salvarPro` — pbs,
    resultados, seco, alvos (SEM Garmin/exames/bioimpedância). Doc não-pro → legível pelo
    técnico (privacidade da Saúde preservada; visibilidade é por app, regra vem na Etapa 2).
  - Atleta **sai da equipe** (`sairDaEquipe` no menu da conta) com aviso; atleta comum sem
    equipe cai em `telaSemEquipe` (entrar em equipe por nome → aguarda aprovação) `entrarEmEquipe`.
  - PENDENTE Etapa 2: PRO lança treinos com o lançador do técnico (técnico vê); técnico abre o
    **relatório completo** do atleta (reuso do motor via snapshot).

### v47

- **Fora d'água só em Treinos (v47)**: removido o card "treinos fora d'água" (e o botão
  "+ Adicionar") da aba Saúde (`telaGarmin`) e a var `seco` que o alimentava. Os treinos fora
  d'água (`S.pro.seco`) ficam apenas no calendário da aba Treinos (`telaTreinosAtleta` →
  `cardTreinoExtra`, "+ Meu treino", edição por `abrirTreinoExtra(null,id)`); nenhum dado é
  perdido. A fadiga/overtraining já somava natação + fora d'água (session-RPE = dur×RPE em
  `loadDiario`/`fadigaCarga`/motor.fadiga) — mantido.

### v46

- **Cor oficial da equipe (v44-v46)**: `CORES_OFICIAIS` (mapa nome-normalizado→{bg,ac}) fixa a
  cor de uma equipe; `corEquipe(nome)` usa a oficial se houver, senão gera pela hash pastel. A
  A3 SWIM TEAM CG/MS = **azul suave** `bg #dce8f7` / `ac #2f5a8f` (fundo claro tingido, texto
  escuro legível — mesmo princípio do pastel). Tentativa de tema escuro (v45, flag `escura` +
  `body.t-escura`) foi **descartada** por prejudicar a leitura; a cor oficial é apenas um tint
  claro. Para dar cor a outra equipe: add uma linha em `CORES_OFICIAIS` (chave = nome em
  minúsculas, espaços colapsados).

### v43

- **Fusão de equipes (dev, v43)**: `mesclarEquipe(orig,dest)` move da equipe ORIGEM para a
  DESTINO, sem perder dados: copia os docs `eq_orig_tr_*`→`eq_dest_tr_*` (pula ids já
  existentes) e mescla o tridx; copia `eq_orig_cmp_*`→`eq_dest_cmp_*` e mescla o cidx; move as
  contas `u_*` (equipe/equipeNome→destino, add em `eq_dest_users`); mescla liberações `_libs`
  por CPF; carrega tecnicoEmail se o destino não tiver. `pro_*` (marcas/saúde) já acompanham o
  atleta pelo UID. **Não apaga a origem** — o dev confere e apaga no ✕. Card "fundir equipes"
  na aba Equipes (aparece com ≥2 equipes): selects Origem/Destino + botão.

### v42

- **Recuperação completa de equipe apagada (dev, v42)**: `reconstruirTridx(slug)` agora
  reconstrói TUDO a partir dos documentos que sobrevivem em `kv` — mesmo que a equipe tenha
  sido apagada (✕): (1) `eq_<slug>_tridx` a partir dos `eq_<slug>_tr_*`; (2) `eq_<slug>_cidx`
  a partir dos `eq_<slug>_cmp_*`; (3) `eq_<slug>_users` a partir dos `u_*` com `equipe===slug`;
  (4) recria o doc `eq_<slug>` se sumiu e re-registra em `dev_equipes`. Toast informa
  "Recuperado: N treino(s), N competição(ões), N atleta(s)". Botão passou a se chamar
  **"recuperar"** e aparece sempre que houver docs órfãos OU tempos do próprio dev.
  `assumirEquipe(slug,nome)` liga `S.gestao=true` para perfil `pro` → entra com **visão de
  técnico** (vê atletas e lança treinos). Fluxo de resgate: Equipes → Diagnóstico → equipe com
  "SEUS tempos" → **recuperar** → **assumir**.

### v41

- **Diagnóstico do banco (dev, v41)**: `abrirDiagnostico()` varre a coleção `kv` e lista todas
  as equipes com "índice" (tridx.length) vs "docs" (quantos `eq_<slug>_tr_*` existem) e quantos
  têm os tempos do próprio dev — mostra ONDE estão os treinos. `reconstruirTridx(slug)` recria
  o índice a partir dos docs de treino quando ele se perdeu. Botão "Diagnóstico" na aba Equipes.

## v40

- **Recuperação/gestão total de equipes (dev)**: os treinos são por equipe (`eq_<slug>_tr_*`);
  trocar de equipe só muda qual `eq_<slug>_tridx` o app lê — **nada é apagado**. `scanEquipes()`
  varre a coleção `kv` e lista TODAS as equipes do banco (não só `dev_equipes`). A aba Equipes
  passou a listar todas com **nº de treinos** e botão **"assumir"** (`assumirEquipe`) que
  reaponta a conta do dev para qualquer equipe — recupera treinos de uma equipe original.
  `carregarEquipesDevList` agora usa o scan. Marcas/PB ficam em `pro_<uid>` (por UID, imunes à
  troca de equipe).

### v39

- **Tela de esporte** (v39): lista rolável (sem a frase explicativa); esporte ≠ Natação →
  página só com "EM DESENVOLVIMENTO" (+ voltar).
- **Fase 2 — treinos multiesporte + fadiga**:
  - Treino extra (fora d'água/cross) virou **folha** `abrirTreinoExtra(data,id)` (corrige o
    bug de apagar antes de confirmar — sheet não é redesenhado pelo sync). Tipos:
    Musculação/Bicicleta/Corrida/Funcional/Core/Mobilidade/Outro. Campos: RPE, **duração
    hh:mm:ss** (`hmsParaMin`/`minParaHMS`), **FC média**, **calorias**, obs, transcrição
    (parseForça). `salvarSeco` grava tudo e edita.
  - Migrado da aba Saúde para o **calendário do atleta**: `telaTreinosAtleta` mescla treinos
    do técnico + extras (`cardTreinoExtra`), botão "+ Meu treino", e o calendário cria treino
    extra no dia (`calendarioTreinos(...,'abrirTreinoExtra')`; `podeCriar`→`criarFn`). Saúde
    virou atalho + recentes.
  - **Fadiga/overtraining**: `loadDiario`/`fadigaCarga` (session-RPE de natação + fora d'água):
    fitness (crônica 28d/sem), fadiga (aguda 7d), relação a/c, monotonia; `cardFadiga` com
    veredito (alerta/sustentável/baixa). `motor.fadiga` + `dadosParaLaudo.motor.fadiga`.

### v38

- **Onboarding + Equipes (Fase 1)**:
  - **Senha**: `senhaForte` (6–8 chars, ≥1 maiúscula, ≥1 minúscula, ≥1 símbolo #$%!@) nos
    cadastros; dica atualizada. Login não muda (contas antigas seguem).
  - **Verificação de e-mail**: `cred.user.sendEmailVerification()` no cadastro FB (link).
  - **Escolha de esporte**: gate no `render` — `S.u.esporte`; `telaEsporte` (Natação + corrida,
    triathlon, musculação, bike, futebol, vôlei, funcional, crossfit, Outro); qualquer ≠ Natação
    → `telaEmDesenvolvimento` (com "Usar Natação"/"trocar"/"sair").
  - **Equipes buscáveis + alfabéticas**: cadastro usa `<input list=datalist>` (digita p/ buscar),
    ordenado; catálogo do dev também ordenado.
  - **Cor por equipe + boas-vindas**: `corEquipe(nome)` (fundo suave determinístico) aplicado ao
    body; `bannerEquipe()` "Olá, [nome]! Você está na área da [equipe]…" no topo.
  - **Vincular atleta existente**: na aba Equipes, `vincularAtletaEquipe()` (por e-mail) move o
    atleta para a equipe (atualiza u.equipe/equipeNome/aprovado e as listas de membros).
- Pendente (Fase 2): treinos multiesporte no calendário do atleta (Musculação/Bike/Corrida/
  Funcional/Core/Mobilidade/Outros) migrando o "Fora d'água" (RPE/duração hh:mm:ss/FC/calorias,
  corrigindo o bug de apagar antes de confirmar) + fadiga acumulada/aviso de overtraining no
  relatório; troca de equipe pelo próprio atleta com confirmação do novo técnico.

### v37

- **Resultados oficiais → competição → Marcas**: `parseResultadosEquipe(txt,alvos)` lê o PDF
  de resultados (ABMN) e extrai, por prova, os atletas da equipe com colocação/tempo final/
  parciais (N/C/DQL sem tempo). `blocoResultados()` na competição (upload) → `lerResultados`
  → `incorporarResultados` preenche cada inscrito (casa por CÓDIGO da prova; senão dist+estilo+
  gênero; senão cria) com `oficialTempo`/`parciais`/`colocacao`. `consolidarMinhasMarcas(c)`
  grava no pro_ do PRÓPRIO usuário (privacidade: só o dono escreve seu Marcas) — chamado
  automático p/ o importador com pro_, e botão "Consolidar meus tempos no Marcas" na visão do
  atleta. `incorporar` passou a carregar `genero`. Roster mostra tempo oficial + colocação.
  Validado nos PDFs reais A3: 31 inscrições, 25 tempos oficiais; Bruno 50 peito 31.35 (3º) e
  100 peito 1:13.14 (4º) → Marcas LC50 corretos.

### v36

- **Aba "Equipes" (dev)**: `telaEquipes` na barra de navegação, visível só quando `ehDev()`
  (mapa.equipes + abas.push em render/navBar). Criar do catálogo (`criarEquipeDevTela`),
  listar e apagar (`apagarEquipeDevTela`), + botão Técnicos. Estado `S.equipesDevList`
  (`carregarEquipesDevList`, invalidado ao criar/apagar). O botão "Equipes" da conta agora
  navega para a aba.

### v35

- **Criar equipe sem e-mail do técnico (v35)**: removido o campo/pré-aprovação por e-mail em
  `abrirDevEquipes`/`criarEquipeDev`. A equipe nasce só com o nome; o técnico se cadastra
  escolhendo a equipe e é liberado na aba Técnicos.

### v34

- **Balizamento por EQUIPE + roster (atletas × provas)**: `parseBalizamentoEquipe(txt,alvos)`
  lê o balizamento oficial (ABMN) e extrai os atletas da EQUIPE do técnico pela **coluna
  EQUIPE** (mesmo que ainda não sejam usuários do app): raia/matr/faixa/nome/inscrição por
  prova. `alvosEquipe()` monta os identificadores (nome+sigla do catálogo). `parseBalizTec`
  usa esse parser (fallback: nomes do Elenco). A importação (nova competição e bloco
  balizamento) passou a usá-lo. `rosterCard(c)` no detalhe da competição lista cada atleta e
  as provas que vai nadar (com tempo de inscrição), com atalho para lançar tempos.
  Validado no PDF real da A3: 17 provas, 31 inscrições, 8 atletas corretos.
- Pendente (próximo): resultados oficiais em PDF → tempos oficiais por atleta → consolidar
  no Marcas de cada atleta cadastrado (aguarda o formato do PDF de resultados); atleta
  competindo por outra equipe; aba de gestão de equipes mais completa para o dev.

### Base v33

- **Catálogo de equipes (Troféu Brasil Masters)**: `CATALOGO_EQUIPES` (52 equipes, nome+sigla).
  No painel dev de Equipes, o desenvolvedor **escolhe do catálogo** (ou digita "outra") e cria
  a equipe — ela fica **apta** (sem técnico). Pode **apagar** equipes (`apagarEquipeDev`, com
  confirmação; remove eq_/libs/users/tridx/cidx e o índice `dev_equipes`).
- **Cadastro escolhe a equipe criada**: `telaCadastro` para técnico/atleta virou um **dropdown**
  das equipes já criadas (`carregarEquipesDisp`→`S.equipesDisp`, invalidado ao criar/apagar);
  PRO mantém texto livre. Enforça o fluxo dev-cria-primeiro; se não há equipe, mostra aviso.

### Base v32

- **Rodadas manuais + por-registro**: `nRodadas(item,rec)=max(rec.nrd,item.rodadas,1)` — o
  nº de rodadas vem do interpretador (novo treino com "2x:") OU de rodadas adicionadas à
  mão. `abrirLancamento` ganhou **"+ adicionar rodada"** (`addRodada`) que migra o registro
  simples para rodada 1 e cria a próxima — funciona em QUALQUER série (inclusive treinos
  antigos, sem re-parse). `temposItem`/`coletarEsforcos`/`gravarReg` passaram a achatar/
  persistir via `rec.rd`+`rec.nrd`.
- **Botão "+" por item (não por bloco)**: sem botão só em NADO SOLTO — `semCrono =
  blocoSolto && reps<=1 && rodadas<=1`. Assim educativos/técnica (6x50, 8x25) dentro do
  aquecimento ganham "+", mas os nados contínuos (400m/200m solto) não.

### Base v31

- **Multiplicador de bloco "2x:" (rodadas por bloco)**: `interpretar` detecta uma linha só
  "Nx"/"Nx:" e aplica `rodadas=N` a todos os itens seguintes do bloco (zera no próximo
  cabeçalho). Assim "2x: [bloco de sub-séries]" gera 2 rodadas em cada série → o atleta
  lança a Rodada 2 pelas abas já existentes. "parte principal" virou cabeçalho reconhecido.
- **Tempo com distância (`parseTempoDist`)**: num 100m, "1.09" é impossível como 1,09s →
  interpreta como 1:09; "58.50" no 100m fica em segundos; "33.80" no 50m fica em segundos.
  Usado no lançamento (`lerCamposLancamento`→`confTempo`/`delTempo`). Display já era m:ss.cc.
- **Botão "+" em toda série**: `linhaSerie` — aquecimento/soltura sem botão; qualquer outra
  série ganha "+ tempo" (ou "editar" se já lançado), técnico e atleta anotam onde quiserem.

### Base v30

- **FASE 1.1 (correção e consolidação da força)**:
  1. **Janela temporal no relatório**: `telaRelatorio`/`gerarLaudoIA`/compartilhar usam
     `coletarEsforcos({dias:120})` (cobre estado/28, comparação/56, tendência/90) — não
     dependem mais do limite legado de 25 treinos (o no-arg continua existindo).
  2. **Carga ambígua**: `parseForca` só conta carga com **kg explícito**; número solto vira
     `cargaAmbigua` (guardado, fora de tonelagem/e-1RM). "Supino 4x8 60" → carga null.
  3. **e-1RM em kg inteiro** (`Math.round`); segue Epley+Brzycki (média); rótulo "estimado".
  4. **Progressão robusta**: `tendenciaForca` = mediana da 1ª metade vs 2ª metade da série
     de e-1RM; <3 sessões ⇒ "insuficiente". Expõe melhorE1RM, e1RMRecente, variação%,
     tendência, confiança (alta/média/baixa).
  5. **Densidade removida** (era tonelagem÷duração-total-da-sessão, enganoso).
  6. **Histórico fora d'água sem limite** de 24 (removido o slice em `salvarSeco`).
  7. **Card "evolução de força"** rico: exercício · sessões/janela · e-1RM inicial→recente ·
     melhor · variação% · tendência · confiança.
  8. `motor.forca.exercicios[]` ganhou melhorE1RM/e1RMRecente/tendencia/confianca (mantém os
     campos antigos).

### Base v29

- **Competições dos atletas para o técnico**: `blocoCompAtletas()` na `telaCompeticao`
  lista as competições que os próprios atletas cadastraram (lê `a.competicoes` de cada
  membro do `S.elenco`), atribuídas por nome; `verCompAtleta(atId,mcId)` abre um resumo
  read-only (provas, séries, raias, tempos, parciais). O botão do PRO virou "gerenciar as
  minhas (como atleta)".
- **Import de PDF na criação de competição**: `abrirNovaCompTec` ganhou input de
  balizamento PDF (`window._ccPdf`); `criarComp` importa as provas via
  `parseBalizamentoTecnico`+`incorporar` logo após criar. Manual continua funcionando.
- **Painel de desenvolvedor — Equipes**: `abrirDevEquipes`/`criarEquipeDev` (cria `eq_<slug>`,
  índice `dev_equipes`, pré-aprova o e-mail do técnico em `dev_pre`); botão "Equipes" no
  painel dev de `abrirConta`. O cadastro de técnico agora é auto-aprovado quando o e-mail
  está em `DEV_EMAILS` **ou** em `dev_pre`. Limite: o app não cria a senha/conta Auth do
  técnico — ele se cadastra; o dev cria a equipe e pré-aprova/aprova.

### Base v28

- **Projeção pool-aware (v28)**: a `predicao` calculava o mesmo tempo para SC25 e LC50
  (os tiros de treino não distinguem piscina). Agora `raceEst` roda 1× por prova
  (pool-agnóstico) e cada piscina é escalada pelo **seu próprio PB** via `formRatio =
  raceEst.est / PB_referência` (referência = piscina curta, onde o atleta treina):
  `central = PB_piscina × formRatio × 1.015 × ajustes`. A curta (referência) fica idêntica
  ao anterior; a longa passa a refletir o gap SC↔LC real do atleta (ex.: 50 peito SC ~33.1 /
  LC ~34.3). Fecha a lacuna "pool-aware" que estava pendente.

### Base v27

- **FASE 1 do refinamento do Performance Engine (força + janelas)**:
  - `coletarEsforcos({dias})` — janela TEMPORAL opcional (sem argumento mantém o antigo:
    25 treinos mais recentes; com `{dias}` filtra por data, sem limite de quantidade).
  - `normalizarExercicio(nome)` — dicionário pequeno/transparente `EXERCICIOS` → id canônico
    + grupo muscular; sem correspondência segura ⇒ `idExercicio:null`.
  - `estimarE1RM(carga,reps)` — Epley+Brzycki (média), 1–10 reps; 1 rep = carga; >10 = null;
    devolve {valor,metodo,carga,reps,confianca}. É estimativa, não 1RM medido.
  - `parseForca` V2 — mantém campos antigos (ex/ton) e adiciona {idExercicio,nomeOriginal,
    nomeCanonico,grupoMuscular,series,reps,carga,unidade,tonelagem,e1rm,confianca}. Carga só
    com indicação confiável (kg = 0.9; número solto = 0.5); descanso/pausa nunca vira carga;
    reps em segundos = isométrico (carga null, tonelagem 0).
  - Persistência: `salvarSeco` grava `exercicios[]` + `cargaEstruturada{tonelagem,seriesTotal,
    exerciciosComCarga}`. Sessões antigas sem isso são reprocessadas por `parseForca`
    (`itensForca(s)`).
  - `historicoForcaExercicio(pro,id,dias=90)` e `progressaoForca(pro,dias=90)` (deltas de
    carga/e1rm/tonelagem/densidade separados, por exercício canônico). Card **evolução de
    força** no relatório. `motorPerformance().forca = {sessoes,tonelagem,progressao,exercicios}`;
    `dadosParaLaudo.motor.forca` exposto (IA só narra, não calcula).
  - **Fora do escopo (FASE 2/3, não mexidos)**: prontidão, especificidade prova×treino,
    "afiar", predição, fatores de split.

### Base v26

- **Calendário também para o atleta (v26)**: `calendarioTreinos` ganhou o parâmetro
  `podeCriar` (o atalho "criar treino nesse dia" só aparece para o técnico). `telaTreinosAtleta`
  (atleta comum e PRO sem gestão) ganhou o mesmo toggle 📅/☰. O atleta só vê dias com treino
  já liberado (data ≤ hoje), coerente com a liberação dia a dia.

- **Calendário de treinos do técnico (v25)**: `calendarioTreinos(lista,cardFn,podeCriar)` — grade
  mês a mês (‹ mês ano ›), marcador nos dias com treino (● + contagem), dia de hoje
  destacado; tocar num dia mostra os treinos daquele dia (ou "criar treino nesse dia" via
  `novoTreinoDia(ds)`). `telaTreinosTec` ganhou toggle **📅 Calendário / ☰ Lista**
  (S.treinoView, calendário por padrão). Reduz a poluição da lista longa. Estado: S.calYM,
  S.calDia. A lista antiga (`grupoTreinos`) segue disponível no toggle.

### Base v24

- **Composição pela água corporal (v24)**: quando a gordura% direta é implausível (5–45%
  fora), `composicaoEstim` agora estima a gordura pela **hidratação** — massa magra ≈ água
  corporal ÷ 0,732 (a água do exame é confiável mesmo quando a gordura% não é), gordura por
  diferença. Ex. Bruno: água 67,6% → gordura ~7,7% (bate com o físico), massa magra ~88,6 kg,
  Composição 87. Fallback por idade/sexo só quando não há água. O laudo consolidado passou a
  citar a estimativa (antes dizia "não considerada"). Score mantém teto 90.

### Base v23

- **Composição estimada (não mais em branco nem "100")**: `composicaoEstim(pro)` — peso
  sempre real (bioimpedância mais recente); se a gordura% for plausível (8–45%) usa-a,
  senão ESTIMA por idade/sexo (`12 + (idade−30)×0.25` p/ homem, clamp 11–22%; Deurenberg
  por IMC foi testado e descartado — superestima em atleta musculoso). Score com **teto 90**
  (nunca "perfeito"). Alimenta o card e o eixo Composição do radar. Ex. Bruno (gordura 3.9%
  do aparelho → estima ~15%, massa magra ~81kg, score 76).
- **PDF no celular**: `imprimirRelatorio` reescrito — monta uma página isolada só com o
  relatório (sem nav) e imprime nela; tenta nova aba (`window.open`), com fallback a iframe
  oculto quando o popup é bloqueado (PWA/celular). Assim o "Salvar como PDF" do navegador
  funciona no telefone (o `window.print()` cru não abria).

### Base v22

Terceira rodada (apresentação + fim dos "chutes" de composição):
- **Composição sem chute**: o peso do card "composição × desempenho" e do motor agora
  vem da bioimpedância MAIS RECENTE (a balança é confiável mesmo com gordura% ruim) —
  antes o `bioSuspeita` descartava a leitura inteira e caía numa antiga (99→96). Massa
  magra e o eixo **Composição** do radar só são calculados quando a gordura% NÃO é
  suspeita; senão massa magra = "—" (com nota) e o eixo fica "s/ dado" (não mais 100 falso).
- **Fingerprint mais assertivo**: Composição = fat só quando plausível (senão s/ dado);
  **Tendência** virou contínua = `50 + net×8 + pc×4` (net = provas melhorando − piorando,
  pc = tendência do %PB), em vez do balde fixo ↑=80. Velocidade continua = %PB direto dos
  melhores tiros.
- **Cabeçalho do relatório**: `cabecalhoRelatorio(pro,motor)` no topo — nome do atleta
  (`S.u.nome`) + data + tabela das provas-alvo (PB × projeção hoje).
- **Print como documento**: `@media print` reescrito — cartões viram seções (sem borda/
  sombra/raio, separador fino), `@page` com margens, evita quebra em svg/tabela/grid.

### Base v21

Segunda rodada de correções do feedback do atleta:
- **Fingerprint · Velocidade**: mapeamento direto = %PB dos melhores tiros (81%→81),
  em vez de `(velPct−70)/30` (que dava 37 p/ 81%). Manutenção: agora isola o "bloco de
  qualidade" de cada série (tempos até 8% acima do mais rápido) antes do CV — assim
  aquecimento/soltura no mesmo dia não inflam a variação; mapeamento mais suave
  (`100−CV×12`) + rótulo com qualidade (ótima/boa/ok/a melhorar). Radar: viewBox 250×196,
  R=64, rótulos reposicionados (0 overflow — testado com getBBox).
- **Projeção reescrita de novo (faixa larga demais)**: `raceEst(d,e)` recursivo usa o
  **desgaste pessoal** (fade = PB_d / (2×PB_{d/2}), ex.: 100 = PB100/(2×PB50)) em vez de
  fatores fixos. central = melhor estimativa (a mais rápida, pois prova é máxima) + 1,5%
  de "não afinado", teto no PB. **Faixa estreita e fixa por distância** (±2,5% no 50, ±3,5%
  no 100, ±4,5% no 200); discordância entre métodos baixa a CONFIANÇA, não alarga a faixa.
  Resultado: 50 peito ~31.9–33.6 (era 29.6–35.5); 100 ~1:10–1:15 (era 1:06–1:24).
  Generalizado p/ qualquer distância (200/medley entram via melhores tiros).
- **Provas-alvo com slots livres**: `cardAlvos` virou lista removível (✕) + select p/
  adicionar QUALQUER prova (`adicionarAlvo`/`removerAlvo`), sem limite — medista pode ter 6+.
- **Store removido** dos perfis de atleta (PRO/podeMarcas/atleta) — nav e mapa; `telaStore`
  fica no código para reformulação futura.

### Base v20

Correções após feedback do atleta sobre o relatório real:
- **Marcas de 25m**: `PROVAS_25` + `PROVAS_MARCA` (só no registro de marca, não em
  competições). O 25m é a parcial da prova e, com um PB real de 25, os muitos tiros de
  25m (piscina curta) passam a ter %PB verdadeiro (antes usava estimativa 50×0.465).
- **Provas-alvo**: `provasAlvo(pro)` (de `pro.alvos` ou auto = 50/100 do estilo
  principal). Card `cardAlvos` em Marcas (chips liga/desliga). A projeção e o fingerprint
  passam a focar só nelas (antes a projeção pegava 50 livre por não saber o alvo).
- **Projeção reescrita (era "furada")**: o modelo antigo fazia `PB ÷ (%PB médio do treino)`
  → projetava ritmo de treino como se fosse prova (43s p/ um PB de 30s). Agora combina
  dois métodos ancorados no que o atleta realmente nada: (1) seus **melhores tiros**
  (topo 20%, `melhorTempo`) "afiados" 3% p/ ritmo de prova; (2) **parcial de 25m** →
  50 = t25×2×1.03; 100 = (50 projetado)×2×1.05. Faixa = união dos métodos; teto no PB
  (0.985×PB). Confiança capada em 85%.
- **Fingerprint recalibrado**: Velocidade = `velocFingerprint` (melhores %PB das
  provas-alvo, não a média; mapeia 70–100%→0–100, por isso não zera mais). Manutenção =
  `manutencaoCV` (coef. de variação dos tempos em séries repetidas; menor = melhor;
  substitui a "queda do 2º 25" que exigia parciais de 50 que o atleta não lança).
- **Zonas A1/A2/A3**: `zona(%PB)` renomeada — A1 base (<84%) · A2 ritmo (84–90) · A3
  potência aeróbica (90–96) · ritmo de prova (≥96). Nota: são zonas por VELOCIDADE (%PB),
  aproximam as zonas de esforço A1/A2/A3; cortes calibráveis (`ZONAS_INFO`).

### Base v19

- **"O que mudou em 28 dias?" + "Por quê?" (v19)**: `mudancas28d(pro,comPct)` compara a
  janela atual (0–28d) com a anterior (28–56d) por variável (capacidade %PB, VFC, FC
  repouso, sono, carga, peso, massa magra), lista os movimentos ≥1% ordenados por
  magnitude, e monta uma leitura de apoio ligando a mudança de capacidade à recuperação/
  carga (associação, não causa). Card `cardMudancas`.
- **Sprint Fingerprint (v19)**: `fingerprintDims(cap,speedDrop,pront,composicao,tend)` →
  radar de 5 eixos observáveis (Velocidade=%PB, Manutenção=queda do 2º 25, Recuperação=
  prontidão, Composição=%gordura, Tendência=direção da capacidade), 0–100 cada; eixo sem
  dado fica no centro. Card `cardFingerprint` desenha o radar em SVG (só se ≥3 eixos com dado).
- **Força estruturada / tonelagem (v19)**: `parseForca(txt)` lê a transcrição livre da ficha
  → `{exercício, séries, reps, carga}` e soma **tonelagem** (séries×reps×carga, ignora
  exercícios sem carga/em segundos). `tonelagem(dias)` soma por janela. Exibida no registro
  fora d'água e como linha no card de carga total; refina o session-RPE da musculação.
- O `motorPerformance` ganhou `fingerprint`, `mudancas`, `tonelagem28d`; e
  `dadosParaLaudo.motor` leva fingerprint/mudancas28d/porqueMudou/tonelagem28d para a IA narrar.

### Base v18

- **Predição 50/100 (v18)**: `predicao(pro,comPct,est)` projeta o tempo provável HOJE
  por prova a partir da **forma recente** (mediana do %PB nos tiros da prova), ajustada
  por prontidão e tendência, com um **teto de otimismo** (nunca abaixo de 98% do PB).
  Devolve uma **FAIXA** (low–high) + **central** + **confiança %** (por nº de tiros da
  prova, dias de VFC, tendência) + **fatores** que a compõem. Exige ≥2 tiros da prova.
  Novo card **"projeção de tempo — hoje"** (`cardPredicao`), com disclaimer explícito de
  que é estimativa de apoio. `motorPerformance.predicoes` e `dadosParaLaudo.motor.predicoes`
  levam a faixa/confiança para a IA narrar (sempre como faixa, nunca tempo exato).

- **Baseline individual móvel (v17)**: `baselineSerie(pts,janela,recentes)` compara o
  valor recente (média dos últimos N pontos) com a linha de base de 28 dias (exige ≥3
  pontos na janela, senão devolve `null` — honestidade por falta de dado).
  `baselinesResumo(pro,comPct)` roda isso para VFC, FC repouso, sono, peso, massa magra
  e %PB (cada um com sinal favorável/desfavorável). Novo card **"seu estado atual"**
  (`cardBaseline`) no relatório, com seta e % de desvio colorido (verde = favorável).
  O `motorPerformance` ganhou `baselines`, e `dadosParaLaudo.motor.baselines` leva os
  desvios para a IA narrar.

### Base v16

- **Performance Engine** (`motorPerformance(pro,comPct,sem,brk)`): um objeto único
  que consolida `estado{prontidão,capacidade,tendência}`, `carga` (ACWR), `cargaTotal`
  (session-RPE), `correlacoes`, `speedDrop`, `composicao`, `inventario` e uma
  **`confianca` 0–100** (baseada no volume de dados). O relatório e o laudo por IA
  agora consomem este objeto.
- **Confiança**: cada indicador do "Estado de Performance" tem confiança
  alta/média/baixa (pela quantidade de dados); há um card "modelo de performance"
  com a confiança geral + inventário de dados.
- **IA = narrativa auditável**: o `gerarLaudoIA` envia as métricas JÁ calculadas
  (`dados.motor`) para o Worker, cujo prompt manda **narrar esses números, não
  recalcular** e avisar quando a confiança é baixa.
- **ACWR reformulado**: virou "relação de carga aguda/crônica" (descritor de carga,
  sem enquadramento de "risco de lesão").
- **RPE + Carga Total (session-RPE)**: cada treino e cada sessão de força guardam
  `RPE (0–10)` + `duração (min)`. Carga da sessão = duração × RPE (UA). O card
  "carga total — 28 dias" soma natação × força na mesma escala.

## 9. Para a Especificação V2 (o que pedir ao ChatGPT escrever)

Restrições que a spec deve respeitar (para não quebrar o app atual):
1. **Manter `pro_<uid>` como está** (não migrar para modelo relacional agora — só
   adicionar campos). Deploy continua sendo um único `index.html`.
2. **Motor separado da UI** já existe (`motorPerformance`) — a V2 estende esse objeto.
3. **IA só narra**; código calcula; nada de score inventado pela IA.
4. **Só usar dados observáveis** — não criar eixo de "técnica" sem stroke rate/vídeo.

O que falta especificar (nesta ordem):
- ~~**(2) Baseline individual móvel**~~ — **feito na v17** (28d; janelas 7/14/90d e
  mediana/desvio/tendência ficam para refino).
- ~~**(3) Predição 50/100** com intervalo de confiança e fatores~~ — **feito na v18**
  (faixa + confiança + fatores, teto de otimismo em 98% do PB; refino futuro: usar
  parciais/split e carga aguda como fatores explícitos, calibrar o "afiar" prova×treino).
- ~~**Sprint Fingerprint** (radar)~~ — **feito na v19** (5 eixos observáveis em SVG).
- ~~**Força estruturada** (tonelagem)~~ — **feito na v19** (`parseForca`/`tonelagem`;
  refino futuro: cargas por exercício ao longo do tempo, e-1RM estimado, progressão).
- ~~**"O que mudou em 28 dias?" + "Por quê?"**~~ — **feito na v19** (`mudancas28d`;
  refino futuro: decompor a própria Prontidão nos seus componentes, não só listar variáveis).

Todos os itens desta lista foram implementados (v16–v19). O que resta é **refino** de cada
um (marcado acima) e, no plano maior, a decisão de arquitetura adiada: migração de
`pro_<uid>` para modelo relacional e modularização — só quando o produto pedir, não agora.

Peça ao ChatGPT a estrutura de objetos/JSON de cada item, quais funções atuais
manter/estender/criar, e a ordem de implementação — tudo em cima deste código.
