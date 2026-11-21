/* ═══════════════════════════════════════════════════════════════════════════
   MEROS360 — COLETOR DO GARMIN (Google Apps Script)
   ───────────────────────────────────────────────────────────────────────────
   O QUE ESTE ARQUIVO RESOLVE

   Até aqui, a aba Saúde só enchia quando o atleta pedia o export GDPR à
   Garmin, esperava dias e subia um ZIP. Em outubro de 2026 a Garmin reabriu o
   Connect Developer Program com a faixa PERSONAL: cada pessoa gera a própria
   chave nas configurações do Garmin Connect, sem formulário e sem espera, e
   a entrega é PULL — não precisa de webhook nem de endereço público.

   É o que faltava para um app sem servidor: este script puxa VFC, FC de
   repouso e sono dia a dia e deixa no Firestore. Roda de graça, no mesmo
   projeto do notificacoes.gs.

   ───────────────────────────────────────────────────────────────────────────
   ⚠️ ELE NÃO ESCREVE NA SAÚDE DO ATLETA. DE PROPÓSITO.

   O caminho óbvio seria gravar direto em `pro_<uid>`. Duas razões para não:

   1. Naquele mesmo registro diário moram `dor`, `sonoQ`, `ctx` e sintomas —
      o check-in que a PESSOA digitou. Um script que escreve o dia inteiro
      apaga isso sem avisar, e a vítima descobre semanas depois.
   2. A conta de serviço passa por cima das regras do Firestore (acesso de
      servidor não é Firebase Auth). Ou seja: aqui não existe rede de
      proteção. O que o script puder fazer de errado, ele faz calado.

   Então ele deixa PACOTES: um documento por dia, só com o que veio do
   relógio. Quem incorpora é o app, do lado do dono, onde já existem o merge
   campo a campo e a caixa-preta anti-apagamento.

   ⚠️ A CHAVE É SEGREDO. Vai nas Propriedades do Script, nunca neste arquivo.
   Instalação: backend/GARMIN.md
   ═══════════════════════════════════════════════════════════════════════════ */

const GARMIN_BASE = 'https://personal.connectapi.garmin.com';
const GARMIN_DIAS_PADRAO = 10;   /* janela de recuperação: cobre sincronia atrasada */

/* ── 1) TOKEN ──────────────────────────────────────────────────────────────
   A chave pessoal não é usada direto nas chamadas: ela é trocada por um
   access token. O token é guardado no cache para não refazer a troca a cada
   execução — a Garmin não documenta a validade dele, então o cache é curto e
   qualquer 401 força uma troca nova (ver garminGet_). */
function garminToken_(forcar) {
  const cache = CacheService.getScriptCache();
  if (!forcar) {
    const guardado = cache.get('garmin_tok');
    if (guardado) return guardado;
  }
  const chave = PropertiesService.getScriptProperties().getProperty('GARMIN_API_KEY');
  if (!chave) throw new Error('Falta GARMIN_API_KEY nas propriedades do script. Veja backend/GARMIN.md.');

  const r = UrlFetchApp.fetch(
    GARMIN_BASE + '/personalapitoken-service/personal-api/personal-api-key/token',
    { method: 'post', headers: { Authorization: 'ApiKey ' + chave }, muteHttpExceptions: true });
  const codigo = r.getResponseCode(), corpo = r.getContentText();
  if (codigo !== 200) throw new Error('Troca da chave falhou (' + codigo + '): ' + corpo.slice(0, 300));

  let tok = null;
  try { const j = JSON.parse(corpo); tok = j.access_token || j.accessToken || j.token; }
  catch (e) { tok = corpo.trim(); }   /* alguns ambientes devolvem o token cru */
  if (!tok) throw new Error('A troca respondeu 200 mas sem token: ' + corpo.slice(0, 200));
  cache.put('garmin_tok', tok, 1500);  /* 25 min, conservador */
  return tok;
}

/* GET autenticado. Um 401 costuma ser token vencido, não chave errada: tenta
   uma vez com token novo antes de desistir. */
function garminGet_(caminho, tentouDeNovo) {
  const r = UrlFetchApp.fetch(GARMIN_BASE + caminho, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + garminToken_(!!tentouDeNovo) },
    muteHttpExceptions: true
  });
  const c = r.getResponseCode();
  if (c === 401 && !tentouDeNovo) return garminGet_(caminho, true);
  if (c === 204) return null;                 /* sem dado no período */
  if (c !== 200) throw new Error('Garmin ' + c + ' em ' + caminho + ': ' + r.getContentText().slice(0, 300));
  const t = r.getContentText();
  return t ? JSON.parse(t) : null;
}

/* ── 2) OS TRÊS ENDPOINTS ──────────────────────────────────────────────────
   Conferidos no Swagger da faixa Personal em 21/11/2026. Os nomes de campo
   abaixo são os de lá; se a Garmin mudar, é aqui que quebra. */

/* VFC: uma linha por noite, com a média da noite e a média semanal.
   ⚠️ `lastNightAvg` e `weeklyAvg` NÃO são a mesma grandeza, e o app guarda a
   procedência em `hrvF` justamente para nunca misturar as duas numa série. */
function garminHrv_(de, ate) {
  const j = garminGet_('/hrv-service/hrv/daily/' + de + '/' + ate);
  const fora = {};
  ((j && j.hrvSummaries) || []).forEach(function (h) {
    if (!h || !h.calendarDate) return;
    fora[h.calendarDate] = { hrv: h.lastNightAvg != null ? h.lastNightAvg : null,
                             hrvSemana: h.weeklyAvg != null ? h.weeklyAvg : null };
  });
  return fora;
}

/* Sono: o endpoint aceita no máximo 31 dias por chamada. */
function garminSono_(de, ate) {
  const j = garminGet_('/sleep-service/sleep/dailySleepSummariesByDate?startDate=' + de + '&endDate=' + ate);
  const fora = {};
  (j || []).forEach(function (s) {
    if (!s || !s.calendarDate || s.sleepTimeSeconds == null) return;
    /* o app guarda sono em HORAS, com uma casa */
    fora[s.calendarDate] = Math.round(s.sleepTimeSeconds / 360) / 10;
  });
  return fora;
}

/* FC de repouso: este é UM DIA POR CHAMADA — não existe versão por período
   na faixa Personal. Por isso a janela padrão é curta. */
function garminFc_(dia) {
  const j = garminGet_('/wellness-service/wellness/dailyHeartRate?date=' + dia);
  return (j && j.restingHeartRate != null) ? j.restingHeartRate : null;
}

/* ── 3) O TRABALHO ─────────────────────────────────────────────────────────
   Monta um pacote por dia e grava em kv/garmin_<uid>_<data>. Só isso. */
function coletarGarmin() {
  const props = PropertiesService.getScriptProperties();
  const uid = props.getProperty('GARMIN_UID');
  if (!uid) throw new Error('Falta GARMIN_UID (o uid do Firebase do dono desta chave).');
  const dias = parseInt(props.getProperty('GARMIN_DIAS') || GARMIN_DIAS_PADRAO, 10);

  const hoje = new Date();
  const dStr = function (d) { return Utilities.formatDate(d, 'GMT', 'yyyy-MM-dd'); };
  const ate = dStr(hoje);
  const de = dStr(new Date(hoje.getTime() - (dias - 1) * 86400000));

  const hrv = garminHrv_(de, ate);
  const sono = garminSono_(de, ate);

  let gravados = 0, vazios = 0;
  for (let i = 0; i < dias; i++) {
    const dia = dStr(new Date(hoje.getTime() - i * 86400000));
    const h = hrv[dia] || {};
    let fc = null;
    try { fc = garminFc_(dia); } catch (e) { Logger.log('FC ' + dia + ': ' + e); }

    const reg = { data: dia };
    if (h.hrv != null) { reg.hrv = h.hrv; reg.hrvF = 'noite'; }
    else if (h.hrvSemana != null) { reg.hrv = h.hrvSemana; reg.hrvF = 'semana'; }
    if (fc != null) reg.fc = fc;
    if (sono[dia] != null) reg.sono = sono[dia];

    /* dia sem nada do relógio não vira pacote: documento vazio só gera ruído
       e faz o app pensar que houve leitura */
    if (reg.hrv == null && reg.fc == null && reg.sono == null) { vazios++; continue; }

    gravarPacoteGarmin_(uid, dia, reg);
    gravados++;
  }
  const resumo = gravados + ' dia(s) gravado(s), ' + vazios + ' sem dado, janela ' + de + ' a ' + ate;
  Logger.log(resumo);
  return resumo;
}

/* O documento tem a MESMA forma de um registro de `pro_.garmin`, para o app
   não precisar traduzir nada na hora de incorporar. `categoria` é o que a
   consulta do app encontra; `dono` é o que a regra do Firestore confere. */
function gravarPacoteGarmin_(uid, dia, reg) {
  const chave = 'garmin_' + uid + '_' + dia;
  const corpo = {
    fields: {
      v: { stringValue: JSON.stringify(reg) },
      dono: { stringValue: uid },
      categoria: { stringValue: 'garmin' },
      equipe: { nullValue: null },
      perfil: { nullValue: null },
      aprovado: { nullValue: null },
      donoEmail: { nullValue: null }
    }
  };
  fs_('/kv/' + encodeURIComponent(chave) + '?' + [
    'updateMask.fieldPaths=v', 'updateMask.fieldPaths=dono', 'updateMask.fieldPaths=categoria',
    'updateMask.fieldPaths=equipe', 'updateMask.fieldPaths=perfil',
    'updateMask.fieldPaths=aprovado', 'updateMask.fieldPaths=donoEmail'
  ].join('&'), 'patch', corpo);
}

/* ── 4) LIMPEZA ────────────────────────────────────────────────────────────
   O app incorpora os pacotes toda vez que abre, e a incorporação é idempotente
   (mesmo dia, mesmos valores). Então o pacote não precisa sobreviver: depois
   de 30 dias ele só ocupa espaço e duplica dado de saúde fora do documento
   que as regras protegem. */
function limparPacotesGarmin() {
  const corte = Utilities.formatDate(new Date(Date.now() - 30 * 86400000), 'GMT', 'yyyy-MM-dd');
  const r = fs_(':runQuery', 'post', {
    structuredQuery: {
      from: [{ collectionId: 'kv' }],
      where: { fieldFilter: { field: { fieldPath: 'categoria' }, op: 'EQUAL', value: { stringValue: 'garmin' } } },
      limit: 500
    }
  }) || [];
  let n = 0;
  r.forEach(function (linha) {
    const d = linha.document; if (!d || !d.name) return;
    const id = d.name.split('/').pop();
    const dia = id.slice(-10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dia) && dia < corte) { fs_('/kv/' + encodeURIComponent(id), 'delete'); n++; }
  });
  Logger.log(n + ' pacote(s) antigo(s) removido(s)');
  return n;
}

/* ⚠️ As funções de teste LOGAM, não só devolvem: o Apps Script não mostra
   valor de retorno no registro de execução. Sem o Logger.log, rodar dá
   "Execução concluída" e tela em branco — parece que não fez nada.
   E os nomes começam com `garmin` de propósito: há um `testarLeitura` no
   notificacoes.gs, e rodar o errado devolve erro de outra coisa. */
/* ── 5) INSTALAÇÃO E DIAGNÓSTICO ───────────────────────────────────────────
   Rode à mão, no editor, nesta ordem. */
function garminTestarChave() {
  const t = garminToken_(true);
  const msg = 'Token obtido (' + t.length + ' caracteres). A chave está válida.';
  Logger.log(msg); return msg;
}
function garminTestarLeitura() {
  const hoje = Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM-dd');
  const de = Utilities.formatDate(new Date(Date.now() - 6 * 86400000), 'GMT', 'yyyy-MM-dd');
  const hrv = garminHrv_(de, hoje), sono = garminSono_(de, hoje);
  let fc = null; try { fc = garminFc_(hoje); } catch (e) { fc = 'erro: ' + e; }
  const msg = 'Janela ' + de + ' a ' + hoje
    + '\nVFC: ' + Object.keys(hrv).length + ' noite(s) — ' + JSON.stringify(hrv)
    + '\nSono: ' + Object.keys(sono).length + ' noite(s) — ' + JSON.stringify(sono)
    + '\nFC de repouso hoje: ' + fc;
  Logger.log(msg); return msg;
}
function garminInstalarGatilho() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'coletarGarmin') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('coletarGarmin').timeBased().everyHours(6).create();
  const msg = 'Gatilho instalado: coletarGarmin a cada 6 horas.';
  Logger.log(msg); return msg;
  return 'gatilho de 6 em 6 horas instalado';
}
