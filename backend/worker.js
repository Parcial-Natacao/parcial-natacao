/* ─────────────────────────────────────────────────────────────────────────
   PARCIAL — backend de leitura por IA (Cloudflare Worker)
   ---------------------------------------------------------------------------
   O que faz:
     • acao "exame" / "bio": recebe um PDF (base64), inclusive PDF-imagem,
       manda pra Claude (visão) e devolve os valores estruturados em JSON.
     • acao "laudo": recebe os dados consolidados do atleta (exames + bio +
       marcas + volume de treino) e devolve um laudo em texto ligando saúde e
       desempenho ao longo do tempo, com recomendações.

   A CHAVE DA ANTHROPIC FICA AQUI NO SERVIDOR (variável ANTHROPIC_API_KEY),
   nunca no app. O app só chama a URL deste Worker.

   Como publicar: veja BACKEND-IA.md (passo a passo, sem terminal).
   ───────────────────────────────────────────────────────────────────────── */

/* Só o app pode chamar (evita alguém gastar sua chave). Ajuste se mudar a URL. */
const ORIGENS_OK = [
  'https://parcial-natacao.github.io',
  'http://localhost:8790',
  'http://127.0.0.1:8790'
];

/* Modelo. claude-opus-5 é o mais capaz (melhor leitura), porém o mais caro.
   Para baratear, troque por 'claude-sonnet-5' (bom e ~1/2 do preço) ou
   'claude-haiku-4-5' (o mais barato). Custo estimado por exame: centavos. */
const MODELO = 'claude-opus-5';

export default {
  async fetch(request, env) {
    const origem = request.headers.get('Origin') || '';
    const permitida = ORIGENS_OK.includes(origem);
    const cors = {
      'Access-Control-Allow-Origin': permitida ? origem : ORIGENS_OK[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return j({ erro: 'use POST' }, 405, cors);
    if (!permitida) return j({ erro: 'origem não autorizada' }, 403, cors);
    if (!env.ANTHROPIC_API_KEY) return j({ erro: 'falta configurar ANTHROPIC_API_KEY no Worker' }, 500, cors);

    let body;
    try { body = await request.json(); } catch { return j({ erro: 'JSON inválido' }, 400, cors); }
    const acao = body.acao;

    try {
      let content, ferramenta, maxTok = 1500;

      if (acao === 'exame' || acao === 'bio' || acao === 'seco') {
        if (!body.pdf) return j({ erro: 'faltou o campo do arquivo (base64)' }, 400, cors);
        const mime = body.mime || 'application/pdf';
        const bloco = mime.indexOf('image/') === 0
          ? { type: 'image', source: { type: 'base64', media_type: mime, data: body.pdf } }
          : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.pdf } };
        const cfg = { exame: [PROMPT_EXAME, SCHEMA_EXAME], bio: [PROMPT_BIO, SCHEMA_BIO], seco: [PROMPT_SECO, SCHEMA_SECO] }[acao];
        content = [ bloco, { type: 'text', text: cfg[0] } ];
        ferramenta = { name: 'registrar', description: 'Registra os dados lidos.', input_schema: cfg[1] };
      } else if (acao === 'laudo') {
        maxTok = 2200;
        content = [{ type: 'text', text: PROMPT_LAUDO + '\n\n=== DADOS DO ATLETA (JSON) ===\n' + JSON.stringify(body.dados || {}) }];
      } else {
        return j({ erro: 'ação desconhecida (use exame, bio ou laudo)' }, 400, cors);
      }

      const req = { model: MODELO, max_tokens: maxTok, messages: [{ role: 'user', content }] };
      if (ferramenta) { req.tools = [ferramenta]; req.tool_choice = { type: 'tool', name: 'registrar' }; }

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify(req)
      });
      const data = await r.json();
      if (!r.ok) return j({ erro: 'Anthropic: ' + ((data.error && data.error.message) || r.status) }, 502, cors);

      if (acao === 'laudo') {
        const texto = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        return j({ laudo: texto || '(sem resposta)' }, 200, cors);
      }
      const bloco = (data.content || []).find(b => b.type === 'tool_use');
      const vals = bloco ? bloco.input : {};
      return j({ data: vals.data || null, vals: semData(vals) }, 200, cors);

    } catch (e) {
      return j({ erro: String(e && e.message || e) }, 500, cors);
    }
  }
};

function j(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors } });
}
/* tira 'data' e valores vazios; mantém números (exame/bio) e textos (seco) */
function semData(o) {
  const out = {};
  for (const k in o) { if (k === 'data') continue; const v = o[k]; if (v != null && v !== '') out[k] = v; }
  return out;
}

/* ── prompts ─────────────────────────────────────────────────────────────── */
const PROMPT_EXAME = `Você recebeu um laudo de exame laboratorial de sangue (pode ser texto ou imagem escaneada).
Extraia o VALOR DO RESULTADO de cada marcador presente (o número medido do paciente, NÃO o intervalo de referência).
Regras:
- Use a DATA DA COLETA do exame (procure "Coleta", "Data da coleta", "Data do exame"). NUNCA use a data de nascimento nem a de emissão/impressão. Formato AAAA-MM-DD.
- Só inclua marcadores que realmente aparecem no laudo. Não invente.
- Números com vírgula viram ponto (257,5 → 257.5).
- Se o laudo tiver só "1,25-dihidroxivitamina D" (calcitriol) e não a 25-OH, NÃO preencha vitD.
- Chame a ferramenta "registrar" uma única vez com o que encontrou.`;

const PROMPT_BIO = `Você recebeu um laudo de BIOIMPEDÂNCIA (ex.: InBody/LookinBody), possivelmente uma imagem ou gráfico.
Extraia os valores da medição. Se houver várias colunas/datas, use a MAIS RECENTE.
Regras:
- data = data do exame (formato AAAA-MM-DD). Não use data de nascimento.
- peso (kg), gordura (% de gordura corporal), musculo (massa muscular esquelética kg), agua (% água corporal), visceral (nível de gordura visceral), ossea (massa óssea kg), tmb (taxa metabólica basal kcal), altura (cm, se aparecer).
- Só preencha o que aparece de fato. Vírgula vira ponto.
- Chame "registrar" uma vez.`;

const PROMPT_LAUDO = `Você é um analista de desempenho de natação escrevendo um RELATÓRIO DE PERFORMANCE em português do Brasil, para o atleta, a partir do JSON abaixo. Use markdown com estas seções (omita uma seção se não houver dado para ela):

## Resumo executivo
3 a 4 bullets com os principais achados.

## Marcas e conversão piscina curta ↔ longa
Comente os melhores tempos e a evolução em competições. Para metas em piscina longa (LC50), PREFIRA o gap REAL medido do atleta (diferença entre suas marcas SC25 e LC50 da mesma prova) em vez de estimativa genérica por virada — a estimativa costuma subestimar. Se só houver um tipo de piscina, diga que falta o par para calibrar.

## Diagnóstico do limitador
Se houver parciais (1º/2º 25) ou "custo do 2º 25", analise pacing vs manutenção de velocidade. Se o 2º 25 fica quase fixo enquanto o 1º varia, o limitador é fôlego/velocidade-resistência, não largada.

## Prontidão
Se houver VFC/FC de repouso vs linha de base, classifique {pronto, atenção, fadiga}.

## Saúde e composição
Interprete exames de sangue e bioimpedância mais recentes e a tendência. Cite valores e faixas de referência esportivas. IMPORTANTE: se um item de bioimpedância vier com "suspeito": true, NÃO use esse número em conclusões — diga que é valor a verificar. Sobre TMB/IMC: são estimativas de apoio. Nunca cite "idade metabólica".

## Execução vs condicionamento
Separe o que é execução (largada, virada, chegada — corrige rápido) do que é condicionamento (ciclo de treino). Diga o que está ao alcance agora e o que depende do ciclo.

## O que fazer para melhorar
3 a 6 recomendações práticas e priorizadas, ligadas aos dados. Se útil, sugira formatos de treino (ex.: 25 de push em ritmo de prova; 50 quebrado com descanso decrescente; nado contínuo em 50 m; largada/chegada).

## Metodologia e ressalvas
Fontes usadas e limites. Se não dá para cruzar saúde e desempenho no tempo por falta de dados, diga com honestidade o que o atleta precisa registrar.

IMPORTANTE — MÉTRICAS JÁ CALCULADAS: se o JSON trouxer um objeto "motor", ele contém indicadores JÁ CALCULADOS pelo app (prontidao 0–100, prontidaoDiasDados, capacidadePctPB, tendencia ↑/→/↓, acwr, speedDropPct, composicao, cargaTotal28d, baselines[{indicador,agora,desvioPct}] = valor recente vs base 28 dias, predicoes[{prova,faixa,central,pb,confianca}] = FAIXA de tempo de COMPETIÇÃO provável hoje, só das provas-alvo do atleta (combina melhores tiros + parcial de 25m; teto no PB), fingerprint[{eixo,score 0-100}] = assinatura de sprint (Velocidade=melhores tiros %PB, Manutenção=constância dos tempos repetidos), mudancas28d[{indicador,deltaPct}] + porqueMudou[] = o que mudou nos últimos 28 dias e a leitura de apoio, tonelagem28d = volume de força em kg, confiancaModelo). NARRE a partir desses números — NÃO os recalcule nem invente outros. Cite-os. Ao falar de predição, apresente SEMPRE como FAIXA (ex.: "provável hoje entre X e Y") com a confiança — nunca prometa um tempo exato. Ao explicar "o que mudou", use porqueMudou como leitura de apoio, deixando claro que é associação e não causa provada. Se confiancaModelo for baixa (<40) ou prontidaoDiasDados for pequeno, diga explicitamente que a leitura tem baixa confiança por falta de dados.

Regras: seja específico e cite números do JSON; NÃO invente valores ausentes; não repita a mesma prova na lista (deduplique por nome+piscina); termine com uma linha dizendo que é análise automática de apoio e não substitui avaliação médica.`;

const PROMPT_SECO = `Você recebeu uma foto ou PDF de uma FICHA DE TREINO FORA D'ÁGUA (musculação, core, mobilidade, elástico, funcional).
Transcreva os exercícios da ficha e classifique o tipo.
Regras:
- tipo: um de Musculação, Core, Mobilidade, Elástico, Outro (o que melhor descreve a ficha).
- texto: a lista de exercícios como está na ficha, um por linha (ex.: "Supino 4x8"). Preserve séries e repetições. Não invente.
- data: se aparecer no documento (AAAA-MM-DD); senão deixe em branco.
- Chame "registrar" uma vez.`;

/* ── schemas (chaves iguais às do app) ───────────────────────────────────── */
const N = { type: 'number' };
const SCHEMA_EXAME = {
  type: 'object',
  properties: {
    data: { type: 'string', description: 'AAAA-MM-DD da coleta' },
    ferritina: N, ferro: N, transferrina: N, hemoglobina: N, hematocrito: N,
    vitD: N, vitB12: N, ck: N, pcr: N, tsh: N, t4l: N, t3l: N,
    testo: N, testoLivre: N, cortisol: N, glicose: N, insulina: N,
    creatinina: N, ureia: N, tgo: N, tgp: N, ggt: N, fosfAlc: N,
    colesterol: N, hdl: N, ldl: N, triglic: N, magnesio: N, zinco: N, sodio: N, potassio: N
  }
};
const SCHEMA_BIO = {
  type: 'object',
  properties: {
    data: { type: 'string', description: 'AAAA-MM-DD do exame' },
    peso: N, gordura: N, musculo: N, agua: N, visceral: N, ossea: N, tmb: N, altura: N
  }
};
const SCHEMA_SECO = {
  type: 'object',
  properties: {
    data: { type: 'string', description: 'AAAA-MM-DD, se aparecer' },
    tipo: { type: 'string', enum: ['Musculação', 'Core', 'Mobilidade', 'Elástico', 'Outro'] },
    texto: { type: 'string', description: 'exercícios transcritos, um por linha' }
  }
};
