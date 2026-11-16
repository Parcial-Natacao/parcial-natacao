/* ═══════════════════════════════════════════════════════════════════════════
   MEROS360 — AVISOS DE CADASTRO POR E-MAIL (Google Apps Script)
   ───────────────────────────────────────────────────────────────────────────
   O QUE ESTE ARQUIVO RESOLVE

   Quem se cadastra no app fica sem acesso até alguém aprovar: o técnico
   aprova o atleta, o administrador aprova o técnico. Nada disso avisava
   ninguém. O candidato esperava sem saber o quê, e quem aprova não sabia que
   havia alguém esperando — a fila só existia dentro de uma tela em que não se
   entra sem motivo.

   O app na v193 passou a mostrar o número no topo de qualquer aba
   (`bannerPendentes`) e a avisar o liberado quando ele reabre
   (`conferirLiberacao`). Isso só funciona para quem ABRE o app. Este script
   cobre o resto: manda e-mail.

     • cadastro novo pendente  →  e-mail para o administrador
     • aprovado (false → true) →  e-mail para a pessoa

   ───────────────────────────────────────────────────────────────────────────
   POR QUE APPS SCRIPT, E NÃO FIREBASE

   Cloud Functions precisam do plano Blaze (cartão de crédito). Este projeto
   está no Spark. Apps Script roda de graça na conta Google do administrador,
   tem gatilho por tempo e `MailApp` para enviar — é a mesma ponte usada no
   Controle_OS. O custo de não ter servidor é o remetente ser o Gmail do
   administrador, não um domínio do app.

   ───────────────────────────────────────────────────────────────────────────
   ⚠️ A CHAVE DA CONTA DE SERVIÇO É SEGREDO

   Ela NÃO entra neste arquivo nem em nenhum outro do repositório. Vai nas
   Propriedades do Script (Project Settings › Script properties), que não são
   versionadas. Quem colar a chave aqui publica acesso de LEITURA E ESCRITA a
   todo o Firestore num repositório que é público.

   Instalação passo a passo: backend/NOTIFICACOES.md
   ═══════════════════════════════════════════════════════════════════════════ */

const PROJETO_PADRAO = 'parcial-cdb0e';
const APP_NOME = 'Meros360';
const APP_URL = 'https://meros360.com';

function props_() { return PropertiesService.getScriptProperties(); }
function prop_(k, padrao) { const v = props_().getProperty(k); return (v === null || v === '') ? padrao : v; }

/* ── 1) TOKEN DE ACESSO ────────────────────────────────────────────────────
   Apps Script não tem SDK do Firestore. O caminho é a REST API, e ela quer um
   token OAuth. A conta de serviço assina um JWT e troca por token.

   ⚠️ A chave privada vem do JSON com os "\n" ESCRITOS, dois caracteres. Sem
   desfazer isso, `computeRsaSha256Signature` recebe uma chave inválida e o
   erro que aparece é "Invalid argument", que não diz nada sobre o motivo. */
function tokenAcesso_() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get('tok');
  if (guardado) return guardado;

  const email = props_().getProperty('SA_EMAIL');
  let chave = props_().getProperty('SA_KEY');
  if (!email || !chave) throw new Error('Faltam SA_EMAIL/SA_KEY nas propriedades do script. Veja backend/NOTIFICACOES.md.');
  chave = chave.replace(/\\n/g, '\n');

  const agora = Math.floor(Date.now() / 1000);
  const b64 = o => Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/, '');
  const cabeca = b64({ alg: 'RS256', typ: 'JWT' });
  const corpo = b64({
    iss: email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora, exp: agora + 3600
  });
  const assinatura = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(cabeca + '.' + corpo, chave)).replace(/=+$/, '');

  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: cabeca + '.' + corpo + '.' + assinatura
    },
    muteHttpExceptions: true
  });
  const txt = r.getContentText();
  if (r.getResponseCode() !== 200) throw new Error('Troca do JWT falhou (' + r.getResponseCode() + '): ' + txt);
  const tok = JSON.parse(txt).access_token;
  cache.put('tok', tok, 3000);   /* o token vale 1h; guardamos 50 min */
  return tok;
}

/* ── 2) LEITURA DO FIRESTORE ───────────────────────────────────────────────
   O app guarda tudo numa coleção só, `kv`, com o conteúdo numa string JSON no
   campo `v`. Os campos de segurança (`dono`, `equipe`, `perfil`, `aprovado`)
   são ESPELHADOS como campos de verdade, porque as regras do Firestore não
   sabem ler JSON dentro de string — e é por isso que dá para consultar por
   `aprovado` aqui.

   ⚠️ Não existe campo com o e-mail: ele é o próprio id do documento,
   `u_<email>`. Quem for procurar `donoEmail` não vai achar. */
function fs_(caminho, metodo, corpo) {
  const base = 'https://firestore.googleapis.com/v1/projects/'
    + prop_('PROJETO', PROJETO_PADRAO) + '/databases/(default)/documents';
  const op = {
    method: metodo || 'get',
    headers: { Authorization: 'Bearer ' + tokenAcesso_() },
    contentType: 'application/json',
    muteHttpExceptions: true
  };
  if (corpo) op.payload = JSON.stringify(corpo);
  const r = UrlFetchApp.fetch(base + caminho, op);
  const c = r.getResponseCode();
  if (c === 404) return null;
  if (c !== 200) throw new Error('Firestore ' + c + ' em ' + caminho + ': ' + r.getContentText().slice(0, 400));
  return JSON.parse(r.getContentText() || '{}');
}

/* devolve o cadastro, ou null */
function lerUsuario_(email) {
  const d = fs_('/kv/' + encodeURIComponent('u_' + String(email).toLowerCase()));
  if (!d || !d.fields || !d.fields.v) return null;
  try { return JSON.parse(d.fields.v.stringValue); } catch (e) { return null; }
}

/* todos os cadastros com aprovado == false.
   Atleta independente nasce assim e nunca precisa de liberação — pendente de
   verdade é quem pediu equipe ou é técnico. Sem este filtro, o administrador
   receberia e-mail de cada PRO que se cadastra sozinho. */
function pendentes_() {
  const r = fs_(':runQuery', 'post', {
    structuredQuery: {
      from: [{ collectionId: 'kv' }],
      where: {
        fieldFilter: { field: { fieldPath: 'aprovado' }, op: 'EQUAL', value: { booleanValue: false } }
      },
      limit: 500
    }
  }) || [];
  const out = [];
  r.forEach(function (linha) {
    const d = linha.document;
    if (!d || !d.name) return;
    const id = d.name.split('/').pop();
    if (id.indexOf('u_') !== 0) return;
    let u = null;
    try { u = JSON.parse(d.fields.v.stringValue); } catch (e) { return; }
    if (!u || !u.email) return;
    if (!u.equipe && u.perfil !== 'tecnico') return;
    out.push(u);
  });
  return out;
}

/* ── 3) ESTADO ENTRE EXECUÇÕES ─────────────────────────────────────────────
   O gatilho roda a cada 15 min e não tem memória. Sem guardar quem já foi
   avisado, o administrador recebia o mesmo e-mail quatro vezes por hora até
   aprovar. `ESPERANDO` guarda também o nome e a equipe de quem está na fila,
   porque quando a pessoa é aprovada ela SAI da consulta — é justamente o
   desaparecimento que indica a aprovação, e aí os dados dela já não vêm. */
function lerEstado_() {
  try { return JSON.parse(prop_('ESPERANDO', '{}')) || {}; } catch (e) { return {}; }
}
function gravarEstado_(o) { props_().setProperty('ESPERANDO', JSON.stringify(o)); }

/* ── 4) O TRABALHO ─────────────────────────────────────────────────────────
   É esta função que o gatilho chama. */
function verificarCadastros() {
  const admin = prop_('ADMIN_EMAIL', Session.getEffectiveUser().getEmail());
  const estado = lerEstado_();
  const agora = pendentes_();
  const naFila = {};
  const novos = [];

  agora.forEach(function (u) {
    const e = String(u.email).toLowerCase();
    naFila[e] = true;
    if (!estado[e]) novos.push(u);
    estado[e] = { nome: u.nome || '', equipe: u.equipeNome || u.equipe || '', perfil: u.perfil || '', em: Date.now() };
  });

  /* quem saiu da fila: aprovado, ou cadastro apagado */
  const saiu = Object.keys(estado).filter(function (e) { return !naFila[e]; });
  const liberados = [];
  saiu.forEach(function (e) {
    const u = lerUsuario_(e);
    if (u && u.aprovado === true) liberados.push({ email: e, u: u, antes: estado[e] });
    /* se o cadastro não existe mais, ou voltou a false, simplesmente sai do
       estado: não há ninguém para avisar */
    delete estado[e];
  });

  gravarEstado_(estado);

  if (novos.length) avisarAdministrador_(admin, novos);
  liberados.forEach(function (x) { avisarLiberado_(x.email, x.u); });

  const resumo = novos.length + ' novo(s), ' + liberados.length + ' liberado(s), ' + agora.length + ' na fila';
  Logger.log(resumo);
  return resumo;
}

/* ── 5) OS E-MAILS ─────────────────────────────────────────────────────────
   Texto curto e com o nome do app no remetente. `name` no MailApp troca o
   nome que aparece na caixa de entrada; o endereço continua sendo o da conta
   Google que roda o script — Apps Script não permite forjar remetente. */
function avisarAdministrador_(para, lista) {
  const n = lista.length;
  const linhas = lista.map(function (u) {
    const tipo = u.perfil === 'tecnico' ? 'TÉCNICO (aprovação sua)' : 'atleta' + (u.perfil === 'pro' ? ' PRO' : '');
    return '• ' + (u.nome || '(sem nome)') + ' <' + u.email + '>\n'
      + '  ' + tipo + (u.equipeNome || u.equipe ? ' · equipe: ' + (u.equipeNome || u.equipe) : '');
  }).join('\n');

  MailApp.sendEmail({
    to: para,
    name: APP_NOME,
    subject: n === 1 ? '[' + APP_NOME + '] 1 cadastro aguardando liberação'
      : '[' + APP_NOME + '] ' + n + ' cadastros aguardando liberação',
    body: (n === 1 ? 'Um cadastro novo está' : n + ' cadastros novos estão')
      + ' esperando liberação no ' + APP_NOME + ':\n\n' + linhas
      + '\n\nTécnico é liberado por você, na aba Equipes. Atleta é liberado pelo'
      + ' técnico da equipe, na tela Equipe.\n\n' + APP_URL
      + '\n\n— aviso automático; você recebe uma vez por cadastro.'
  });
}

function avisarLiberado_(email, u) {
  const tec = u.perfil === 'tecnico';
  const eq = u.equipeNome || u.equipe || '';
  const prim = String(u.nome || '').trim().split(/\s+/)[0] || '';

  MailApp.sendEmail({
    to: email,
    name: APP_NOME,
    subject: 'Seu acesso ao ' + APP_NOME + ' foi liberado',
    body: (prim ? 'Olá, ' + prim + '!\n\n' : '')
      + (tec
        ? 'Seu cadastro de técnico' + (eq ? ' da equipe ' + eq : '') + ' foi aprovado.'
        + ' Agora você pode lançar treinos, aprovar atletas e abrir competições.'
        : 'Seu cadastro' + (eq ? ' na equipe ' + eq : '') + ' foi aprovado pelo técnico.'
        + ' Os treinos da equipe e as competições já estão disponíveis.')
      + '\n\nAbra o app: ' + APP_URL
      + '\n\n— ' + APP_NOME
  });
}

/* ── 6) INSTALAÇÃO ─────────────────────────────────────────────────────────
   Rode UMA vez, à mão, no editor do Apps Script. */
function instalarGatilho() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'verificarCadastros') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('verificarCadastros').timeBased().everyMinutes(15).create();
  return 'gatilho de 15 min instalado';
}

/* Primeira execução: marca quem JÁ está na fila como "visto", sem mandar
   e-mail. Sem isto, a estreia do script despeja um e-mail com todos os
   cadastros pendentes históricos — e, pior, o próximo ciclo manda um "foi
   aprovado" para cada um que for aprovado em lote na limpeza. */
function primeiraVezSemAvisar() {
  const estado = {};
  pendentes_().forEach(function (u) {
    estado[String(u.email).toLowerCase()] =
      { nome: u.nome || '', equipe: u.equipeNome || u.equipe || '', perfil: u.perfil || '', em: Date.now() };
  });
  gravarEstado_(estado);
  return Object.keys(estado).length + ' pendente(s) marcado(s) como já vistos';
}

/* Diagnóstico: roda a leitura e devolve o que achou, sem enviar nada. */
function testarLeitura() {
  const p = pendentes_();
  const txt = 'Projeto: ' + prop_('PROJETO', PROJETO_PADRAO) + '\n'
    + 'Pendentes: ' + p.length + '\n'
    + p.map(function (u) { return '- ' + u.email + ' (' + (u.perfil || '?') + ') ' + (u.equipeNome || u.equipe || 'sem equipe'); }).join('\n')
    + '\n\nEstado guardado: ' + Object.keys(lerEstado_()).length + ' e-mail(s)';
  Logger.log(txt);
  return txt;
}

/* Reenvio manual, para quando alguém for aprovado antes do script existir. */
function avisarLiberadoManual(email) {
  const u = lerUsuario_(email);
  if (!u) return 'não achei o cadastro ' + email;
  if (u.aprovado !== true) return email + ' ainda não está aprovado';
  avisarLiberado_(String(email).toLowerCase(), u);
  return 'avisado: ' + email;
}
