# PARCIAL — especificação funcional e técnica

Documento de continuidade. Descreve o que existe, por que existe e o que falta.
Escrito para que outra sessão de trabalho retome o projeto sem contexto prévio.

---

## 1. Para que serve

Equipe de natação masters. O técnico monta os treinos e cronometra; os atletas
recebem, lançam tempos e acompanham. Um dos atletas tem um perfil ampliado
(PRO) com análise de desempenho cruzando treinos, competições e dados de
relógio esportivo.

O problema concreto que originou tudo: o técnico usa **planilha impressa** para
anotar parciais em competição, e os tempos de treino se perdem em cadernos.
Não existe histórico consolidado para orientar carga.

---

## 2. Perfis

### 2.1 Atleta
- Cadastro exige CPF **previamente liberado pelo técnico**. Sem liberação, não
  há conta. É assim de propósito: a equipe controla quem entra.
- Escolhe se compete em **piscina** ou **águas abertas**.
- Vê apenas os treinos endereçados a ele.
- Lança os próprios tempos, com campo separado para parcial quando a série é
  de tiro.
- Vê as provas de competição em que está inscrito e os tempos lançados pelo
  técnico.
- Compartilha por WhatsApp.

### 2.2 Atleta PRO
- **Não depende do técnico.** A tranca é o código mestre `CODIGO_PRO`,
  constante declarada no topo do script. Sem CPF, sem liberação.
- Se a equipe informada não existir, ela é criada sem técnico vinculado. O
  técnico entra depois usando o mesmo nome de equipe e se vincula sozinho.
- Tudo do atleta, mais:
  - **Marcas** — melhores tempos por prova e piscina; histórico de
    competições. Quando o técnico lança uma parcial completa numa prova, o
    resultado entra aqui sozinho e atualiza o recorde.
  - **Garmin** — importa `healthStatusData`, `sleepData` e
    `summarizedActivities` por arquivo ou colagem. Lançamento manual também.
    Leitura de prontidão comparando VFC recente contra linha de base.
  - **Treino fora d'água** — foto da ficha, redimensionada para 760px e
    comprimida antes de guardar.
  - **Relatório** — consolida tudo e produz diagnóstico e sugestão de sessão.

### 2.3 Técnico
- Cria a equipe. Se a equipe já existir sem técnico, se vincula a ela.
- **Treinos**: cola o treino em texto livre, escolhe o nível e marca quem
  recebe. Lança tempos por atleta. Edita e exclui.
- **Elenco**: libera CPFs, define e troca o nível de cada atleta, vê a ficha
  completa, gera link de nova senha, remove do app (desativa sem apagar
  histórico).
- **Competição**: sem cronômetro — o técnico usa cronômetros manuais. Digita
  os tempos acumulados na planilha da série.

### 2.4 Níveis
`Master`, `Aperfeiçoamento`, `Águas Abertas`. Quem define é o técnico.

---

## 3. Interpretador de treino

Converte texto colado em séries estruturadas. É o coração da usabilidade: o
técnico já escreve o treino em algum lugar, então ele cola e pronto.

Reconhece por linha:
- **Repetições e distância**: `8x50`, `12 x 25`, `4×100`. Linha só com número
  vira uma repetição (`400 livre` → 1×400).
- **Cabeçalhos de bloco**: linhas que começam com aquecimento, técnica,
  principal, série, soltura, volta à calma, seco, travessia etc., ou linhas
  curtas sem número.
- **Estilo**: livre/crawl, costas, peito, borboleta, medley.
- **Recursos**: pernada, braçada, técnica, palmar, saída, virada, filipina,
  progressivo, boia.
- **Intervalo de saída**: `saída 1'20`, `s/ 1:20`, `@1'20`.
- **Pausa**: `pausa 45"`, `descanso 30`.
- **Intensidade**: máximo, all out, tiro, forte, sprint, ritmo de prova, RP,
  percentuais.
- **Parcial**: marcado quando o texto fala em parcial, broken, quebrado, split,
  ou automaticamente quando é série forte de 50 a 100 metros.

Funções: `interpretar(txt)` → blocos; `linhaParaItem(l)` → item.

---

## 4. Competição

### 4.1 Catálogo de provas
Individuais (`PROVAS_CAT`): 50/100/200/400/800/1500 livre; 50/100/200 peito;
50/100/200 costas; 50/100/200 borboleta; 100/200/400 medley.

Revezamentos (`REVEZ`): 4x50 livre, 4x50 medley, 4x100 livre, 4x100 medley
(masculino, feminino e misto) e 4x200 livre (masculino e feminino).
Categorias de revezamento (`CAT_REV`): 100+, 160+, 200+, 240+, 280+.

### 4.2 Regra das parciais (`passoDe`)
- Revezamento: um parcial por percurso.
- Piscina de 50m: de 50 em 50; provas de 800 e 1500, de 100 em 100.
- Piscina de 25m: até 100m, de 25 em 25; 200 e 400, de 50 em 50; acima disso,
  de 100 em 100.

Os tempos digitados são **acumulados**, como na planilha impressa. Os trechos
aparecem calculados abaixo de cada célula.

### 4.3 Balizamento
Três caminhos: foto ou PDF lidos por IA; texto colado (interpretador próprio
que reconhece `Prova 12 - 50m peito`, `Série 3`, `4 - Nome - Equipe - 30.21`);
ou cadastro manual prova a prova.

Nomes são casados automaticamente com o elenco pelo primeiro nome, ligando o
inscrito ao usuário do app.

---

## 5. Análise

### 5.1 Zonas por percentual do melhor tempo
- ≥97% — ritmo de prova
- 92 a 97% — velocidade
- 86 a 92% — limiar
- abaixo de 86% — aeróbio

Quando não há marca cadastrada para a distância, ela é extrapolada do 50 do
mesmo estilo (25m ≈ 0,465×; 100m ≈ 2,22×; 200m ≈ 4,75×).

### 5.2 Custo do segundo trecho
Métrica central do projeto. Para tiros de 50 com parcial, calcula
`tempo_total − 2 × primeiro_25`. Mede quanto o segundo trecho custou a mais que
o primeiro — indicador de manutenção de velocidade.

**Contexto do atleta PRO:** o segundo 25 é o limitador identificado. Fica
travado por volta de 17,5s independentemente do ritmo do primeiro, o que aponta
restrição de condicionamento, não de tática. Séries que isolam esse trecho —
push 25 em ritmo de prova com descanso completo, broken 50, 50 com diferencial
controlado — são a resposta adequada. Trabalho de tolerância ao lactato é
contraindicado em fase de afinamento.

### 5.3 Motor de diagnóstico (`diagnostico`)
Entradas: percentuais, diferenciais do segundo 25, volume semanal, dados do
relógio. Saídas: focos recomendados, sessão sugerida em texto colável e
orientação de descanso.

Regras principais:
- Diferencial médio acima de 2,6s → foco em manutenção de velocidade.
- Percentual médio abaixo de 90% → falta tempo em ritmo real de prova.
- Percentual médio acima de 95% → o ganho vem de frescor, não de carga.
- VFC 8% abaixo da linha de base → sessão leve e alerta de acúmulo.
- Volume 25% acima da semana anterior → segurar progressão.

### 5.4 Referências de conversão
Peito, de piscina de 25m para 50m: estimar 0,85 a 1,05s perdidos por virada
removida.

---

## 6. Modelo de dados

Armazenamento chave-valor. Prefixos:

| Chave | Conteúdo |
|---|---|
| `u_<email>` | usuário: id, perfil, equipe, nome, email, idade, telefone, sal, senha (SHA-256), tipo, cpf, nivel, ativo |
| `eq_<slug>` | equipe: slug, nome, tecnicoEmail, codigoPro |
| `eq_<slug>_users` | lista de e-mails |
| `eq_<slug>_libs` | liberações: cpf, nome, nivel, usado, email |
| `eq_<slug>_tridx` | índice de treinos: id, data, titulo, nivel, vol, para[], nAtletas |
| `eq_<slug>_tr_<id>` | treino completo: blocos[], para[], registros{atletaId:{itemId:{tempos[],parciais[]}}} |
| `eq_<slug>_cidx` | índice de competições |
| `eq_<slug>_cmp_<id>` | competição: provas[] com inscritos[] e parciais[] |
| `pro_<userId>` | dados PRO: pbs{}, garmin[], seco[], resultados[] |
| `tok_<token>` | token de recuperação de senha, com expiração |
| `sessao` | sessão local do aparelho (armazenamento pessoal) |

Tempos são sempre **milissegundos inteiros**. Datas em `YYYY-MM-DD`.

---

## 7. Interface

Desenhada para iPhone e para a beira da piscina: alvos de toque de 46px,
campos com fonte de 16px para o Safari não dar zoom, áreas seguras respeitadas,
navegação inferior fixa.

Identidade visual: fundo cor de concreto seco, tinta quase preta, vermelho de
relógio de parede como acento, amarelo de raia para destaques. Tipografia
condensada tipo placar (Barlow Condensed), corpo em Barlow, números sempre em
monoespaçada com dígitos tabulares. Faixa de raia listrada no topo.

**Navegação:** pilha de estados em `S.pilha`. Cada tela empilha uma fotografia
com `push()`; `voltar()` desfaz passo a passo. O botão só aparece quando há
para onde voltar. Uma folha aberta é fechada antes de desfazer navegação.

**Compartilhamento:** nunca abre janela sozinho, porque navegadores bloqueiam.
Mostra o texto pronto, botão de copiar com reserva para `execCommand`, e links
tocáveis — genérico e um por destinatário com telefone cadastrado.

---

## 8. Próximo passo — migração para Supabase

Resolve de uma vez a sincronia, o e-mail de recuperação de senha e a
autenticação real. Ver `supabase/schema.sql` e `supabase/db-adapter.js`.

Ordem sugerida:
1. Criar projeto, rodar o `schema.sql`.
2. Trocar `cadastrar` e `autenticar` por `supabase.auth.signUp` e
   `signInWithPassword`. Remover `hash`, `novoSal`, `pedirReset` e
   `aplicarReset` — o Supabase faz tudo.
3. Substituir o objeto `DB` pelo adaptador.
4. Ligar `postgres_changes` para sincronia instantânea, substituindo o
   `setInterval` de 12 segundos.
5. Mover a leitura do balizamento para uma função de borda, com a chave da API
   guardada no servidor.

O restante do código não muda.

---

## 9. Dados de demonstração

`semear()` cria a equipe **A3 Swim Team** com técnico, um atleta PRO, quatro
atletas, seis treinos com tempos gerados de forma determinística, uma
competição com balizamento e resultados, e catorze dias de dados de relógio.
Contas e senhas estão em `DEMO.contas`. Remover antes do uso real.
