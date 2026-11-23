/* ═══════════════════════════════════════════════════════════════════════════
   MEROS360 — CONEXÕES COM RELÓGIOS (OAuth 2.0)  ·  Google Apps Script
   ───────────────────────────────────────────────────────────────────────────
   O QUE ESTE ARQUIVO RESOLVE

   O `garmin.gs` coleta os dados de UMA pessoa: a chave pessoal dela mora nas
   propriedades do script. Isso não se repete para o time — a faixa Personal
   da Garmin é para a pessoa ler os próprios dados, a chave vence sem avisar,
   e guardar a chave pessoal de terceiros está fora do que ela permite.

   Aqui mora o caminho que escala: o atleta toca em "Conectar", autoriza na
   página do FABRICANTE, e volta. Nenhuma senha, nenhuma chave copiada à mão.
   É o mesmo fluxo do Strava, e ele precisa de três coisas que um app sem
   servidor não tem — um endereço público, um segredo guardado longe do
   navegador, e alguém acordado para receber o retorno. Este Web App é as
   três.

   ───────────────────────────────────────────────────────────────────────────
   ⚠️ O UID NÃO PODE VIR NA URL. É A ÚNICA COISA QUE SEGURA TUDO.

   O caminho ingênuo seria `?uid=<uid>`: qualquer um trocaria o parâmetro e
   penduraria o próprio relógio na conta de outra pessoa — ou, pior, leria os
   dados dela. Verificar um token do Firebase aqui dentro daria certo, mas
   exigiria validar RS256 contra as chaves públicas do Google, em Apps
   Script, na mão.

   O caminho curto usa o que o Firestore já garante: o app grava um PEDIDO
   em `pedido_<uid>_<nonce>`, e a REGRA só deixa quem está logado como `uid`
   criar esse documento. Então a existência do pedido já é a prova. Daqui a
   gente lê o pedido, descobre de quem é, e nunca confia na URL.

   O pedido vale 10 minutos e é apagado assim que serve. Não guarda nada
   sensível: só uid, provedor e hora.

   ───────────────────────────────────────────────────────────────────────────
   ⚠️ O SEGREDO DO CLIENTE VAI NAS PROPRIEDADES DO SCRIPT. NUNCA NO REPOSITÓRIO.

   O repositório é PÚBLICO. Um `client_secret` commitado é revogado pelo
   fabricante em horas — quando dá sorte; quando não dá, alguém usa antes.

   ───────────────────────────────────────────────────────────────────────────
   ⚠️ OS ENDEREÇOS DE CADA FABRICANTE NÃO MORAM NESTE ARQUIVO. NÃO PODEM.

   O acordo do Garmin Connect Developer Program trata documentação, materiais
   técnicos e credenciais como informação confidencial, que não pode ser
   divulgada a terceiros. Este repositório é PÚBLICO: commitar a URL de
   autorização, a de token, os escopos ou o formato do push seria publicar
   material confidencial do fabricante — e o acordo prevê suspensão imediata.

   Então eles vão para as Propriedades do script, do lado do segredo. Aqui
   ficam só os NOMES das propriedades, que não dizem nada a ninguém.

   Instalação e registro: backend/CONEXOES.md
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── O CATÁLOGO DE FABRICANTES ─────────────────────────────────────────────
   Um provedor novo é uma linha aqui mais uma função de coleta — nada no
   resto do arquivo muda. É esse o ponto de ter feito o encanamento genérico.

   `pkce`      : o fabricante exige code_challenge/code_verifier (a Garmin
                 exige; é o que dispensa o segredo no navegador).
   `credNoCorpo`: as credenciais vão no CORPO do POST de token, não no header
                 `Authorization: Basic`. Isto muda de fabricante para
                 fabricante e é a causa clássica de um 401 sem explicação.
                 Na Garmin é `false`: a lista de parâmetros da spec cita
                 client_id e client_secret, mas os exemplos de `curl` — tanto
                 do token quanto do refresh — usam Basic e NÃO os repetem no
                 corpo. Entre a lista e o exemplo que a própria Garmin mostra
                 funcionando, segue-se o exemplo.

   NÃO HÁ `escopo`: a requisição de autorização da Garmin não aceita `scope`.
   O escopo concedido vem DE VOLTA na resposta do token, e é ele que a gente
   guarda no vínculo.
   `prop*`     : nome da propriedade do script. Nenhum VALOR aparece aqui. */
const PROVEDORES = {
  garmin: {
    nome: 'Garmin',
    pkce: true,
    credNoCorpo: false,
    propId: 'GARMIN_CLIENT_ID',
    propSegredo: 'GARMIN_CLIENT_SECRET',
    propAutorizar: 'GARMIN_URL_AUTORIZAR',
    propToken: 'GARMIN_URL_TOKEN',
    propUserId: 'GARMIN_URL_USERID',
    propRegistro: 'GARMIN_URL_REGISTRO'
  },
  polar: {
    nome: 'Polar',
    pkce: false,
    credNoCorpo: false,
    propId: 'POLAR_CLIENT_ID',
    propSegredo: 'POLAR_CLIENT_SECRET',
    propAutorizar: 'POLAR_URL_AUTORIZAR',
    propToken: 'POLAR_URL_TOKEN',
    propUserId: 'POLAR_URL_USERID',
    propRegistro: 'POLAR_URL_REGISTRO'
  }
};

const PEDIDO_VALIDADE_MIN = 10;

/* ── 1) A PORTA DE ENTRADA ─────────────────────────────────────────────────
   Um Web App do Apps Script não sabe responder 302. O desvio para o
   fabricante vai então numa página mínima que se redireciona sozinha — e com
   `target='_top'`, senão ela tenta abrir dentro do próprio iframe do
   Apps Script e o usuário vê uma tela branca. */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.a === 'iniciar') return iniciar_(p);
    if (p.code || p.error) return retorno_(p);
    return pagina_('Meros360 — conexões',
      'Este endereço recebe as autorizações de relógio do Meros360.'
      + '<br><br>Não há nada para fazer aqui: a conexão começa dentro do app, '
      + 'em <b>Saúde › Conectar relógio</b>.');
  } catch (err) {
    return pagina_('Não deu certo', esc_(String(err && err.message || err))
      + '<br><br>Nada foi gravado. Volte ao app e tente de novo.');
  }
}

/* O atleta chega aqui vindo do app, com o id do pedido e o provedor. */
function iniciar_(p) {
  /* o provedor sai do PEDIDO, nao do parâmetro da URL: o pedido foi escrito
     por quem estava logado, o parâmetro foi escrito por quem clicou */
  const pedido = lerPedido_(p.n);
  const prov = provedor_(pedido.provedor);
  const estado = p.n;

  /* PKCE: o verificador fica DAQUI, nunca sai no navegador. O fabricante
     recebe só o resumo (SHA-256) e, na hora da troca, exige o original.
     Guardar no cache basta: a janela entre ida e volta são segundos. */
  let verificador = '';
  if (prov.pkce) {
    verificador = aleatorio_(64);
    CacheService.getScriptCache().put('pkce_' + estado, verificador, 600);
  }

  const q = [
    'response_type=code',
    'client_id=' + encodeURIComponent(propObrig_(prov.propId)),
    'redirect_uri=' + encodeURIComponent(urlRetorno_()),
    'state=' + encodeURIComponent(estado)
  ];
  /* sem `scope`: a Garmin não aceita o parâmetro aqui (ver o catálogo) */
  if (prov.pkce) q.push('code_challenge=' + encodeURIComponent(desafio_(verificador)),
                        'code_challenge_method=S256');

  const destino = prov.autorizar + (prov.autorizar.indexOf('?') >= 0 ? '&' : '?') + q.join('&');
  return pagina_('Levando você ao ' + prov.nome + '…',
    'Se nada acontecer, <a href="' + esc_(destino) + '" target="_top">toque aqui</a>.',
    destino);
}

/* ── 2) A VOLTA ────────────────────────────────────────────────────────────
   O fabricante devolve `code` e o nosso `state`. O state é o id do pedido —
   e é lendo o pedido que descobrimos de quem é a conta. A URL não é fonte de
   verdade para nada além disso. */
function retorno_(p) {
  if (p.error) {
    return pagina_('Autorização não concluída',
      'O fabricante respondeu: <b>' + esc_(p.error) + '</b>.'
      + '<br><br>Nada foi gravado. Se você cancelou, é só isso mesmo.');
  }
  const pedido = lerPedido_(p.state);
  const prov = provedor_(pedido.provedor);

  const corpo = {
    grant_type: 'authorization_code',
    code: p.code,
    redirect_uri: urlRetorno_()
  };
  if (prov.pkce) {
    const v = CacheService.getScriptCache().get('pkce_' + p.state);
    if (!v) throw new Error('A autorização demorou demais. Comece de novo pelo app.');
    corpo.code_verifier = v;
  }
  const t = trocarToken_(prov, corpo);
  /* o id na Garmin NÃO vem na resposta do token: é uma chamada à parte, e sem
     ele o push chega sem dono — as notificações trazem o id do fabricante, e
     é por ele que a gente descobre de quem são os dados. */
  const idProv = buscarIdNoProvedor_(prov, t.access_token);

  gravarConexao_(pedido.uid, pedido.provedor, t, idProv);
  apagarPedido_(p.state);

  return pagina_('Pronto, ' + prov.nome + ' conectado',
    'Pode fechar esta aba e voltar ao Meros360.'
    + '<br><br>Os dados do seu relógio começam a aparecer na aba <b>Saúde</b> '
    + 'nas próximas horas — não precisa importar nada.');
}

/* POST de token. As credenciais vão no corpo ou no header conforme o
   fabricante; errar isso devolve 401 sem dizer por quê. */
function trocarToken_(prov, corpo) {
  const id = propObrig_(prov.propId), segredo = propObrig_(prov.propSegredo);
  const op = { method: 'post', muteHttpExceptions: true,
    contentType: 'application/x-www-form-urlencoded' };
  const campos = {};
  Object.keys(corpo).forEach(function (k) { campos[k] = corpo[k]; });
  if (prov.credNoCorpo) { campos.client_id = id; campos.client_secret = segredo; }
  else { op.headers = { Authorization: 'Basic ' + Utilities.base64Encode(id + ':' + segredo) }; }
  op.payload = Object.keys(campos).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(campos[k]);
  }).join('&');

  const r = UrlFetchApp.fetch(prov.token, op);
  const c = r.getResponseCode(), txt = r.getContentText();
  if (c !== 200) throw new Error('Troca de token falhou (' + c + '): ' + txt.slice(0, 300));
  const j = JSON.parse(txt);
  if (!j.access_token) throw new Error('Resposta sem access_token: ' + txt.slice(0, 200));
  return j;
}

/* ── 3) ONDE A CONEXÃO MORA ────────────────────────────────────────────────
   DOIS documentos, de propósito:

   `conexao_<uid>_<prov>` guarda os TOKENS. Nenhuma regra do Firestore dá
   leitura a ninguém — nem ao dono, nem ao administrador. Só a conta de
   serviço chega nele, e ela não passa pelas regras. Um token de leitura de
   saúde não tem por que passear pelo navegador.

   `vinculo_<uid>_<prov>` é o que o APP enxerga: provedor, desde quando, e a
   última coleta. Sem segredo nenhum. É com ele que a tela diz "conectado"
   sem nunca tocar no token. */
/* O id do usuário no fabricante. A spec diz que ele é estável: se a pessoa
   desautorizar e autorizar de novo, volta o MESMO id. Por isso serve de
   índice. Falhar aqui não derruba a conexão — dá para buscar depois. */
function buscarIdNoProvedor_(prov, acesso) {
  if (!prov.userid) return null;
  try {
    const r = UrlFetchApp.fetch(prov.userid, {
      headers: { Authorization: 'Bearer ' + acesso }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) {
      console.warn('id do usuário (' + r.getResponseCode() + ')'); return null;
    }
    const j = JSON.parse(r.getContentText() || '{}');
    return j.userId || j.user_id || null;
  } catch (e) { console.warn('id do usuário: ' + e.message); return null; }
}

function gravarConexao_(uid, provedor, t, idProv) {
  const agora = Date.now();
  const dados = {
    provedor: provedor,
    uid: uid,
    acesso: t.access_token,
    refresh: t.refresh_token || null,
    expiraEm: t.expires_in ? agora + (Number(t.expires_in) * 1000) : null,
    escopo: t.scope || null,
    idNoProvedor: idProv || null,
    em: agora
  };
  /* uid ANTES do provedor: é o que deixa o app consultar `vinculo_<uid>_`
     por faixa de id. Com o provedor na frente, achar os meus vínculos
     exigiria varrer os de todo mundo — e a regra negaria a consulta. */
  escrever_('conexao_' + uid + '_' + provedor, dados, uid, 'conexao');
  escrever_('vinculo_' + uid + '_' + provedor,
    { provedor: provedor, em: agora, ultimaColeta: null, estado: 'ativo' }, uid, 'vinculo');
  /* ÍNDICE AO CONTRÁRIO. O push chega identificado pelo id DO FABRICANTE, e a
     gente precisa do uid. Sem este documento seria preciso varrer todas as
     conexões a cada notificação. */
  if (idProv) escrever_('idprov_' + provedor + '_' + idProv, { uid: uid, provedor: provedor },
    uid, 'idprov');
}

/* ── RENOVAR ─────────────────────────────────────────────────
   ⚠️ O REFRESH TOKEN GIRA. A spec: "We return a new refresh token every time
   you get a new access token". E ele vence em TRÊS MESES. Guardar o antigo
   depois de renovar é assinar a morte da conexão na próxima renovação — e o
   sintoma apareceria meses depois, parecendo outra coisa. Por isso aqui se
   regrava a conexão inteira, nunca só o access token. */
function renovarToken_(conexao) {
  const prov = provedor_(conexao.provedor);
  if (!conexao.refresh) throw new Error('Conexão sem refresh token: refaça a autorização.');
  const t = trocarToken_(prov, { grant_type: 'refresh_token', refresh_token: conexao.refresh });
  gravarConexao_(conexao.uid, conexao.provedor, t, conexao.idNoProvedor);
  return t.access_token;
}

/* devolve um access token válido, renovando quando falta pouco */
function tokenValido_(conexao) {
  const folga = 5 * 60 * 1000;
  if (conexao.acesso && conexao.expiraEm && conexao.expiraEm - Date.now() > folga) {
    return conexao.acesso;
  }
  return renovarToken_(conexao);
}

/* mesma forma dos campos espelhados do resto do banco: `dono` é o que a
   regra confere, `categoria` é o que a consulta encontra */
function escrever_(chave, dados, uid, categoria) {
  const corpo = { fields: {
    v: { stringValue: JSON.stringify(dados) },
    dono: { stringValue: uid },
    categoria: { stringValue: categoria },
    equipe: { nullValue: null }, perfil: { nullValue: null },
    aprovado: { nullValue: null }, donoEmail: { nullValue: null }
  } };
  fs_('/kv/' + encodeURIComponent(chave) + '?' + [
    'v', 'dono', 'categoria', 'equipe', 'perfil', 'aprovado', 'donoEmail'
  ].map(function (c) { return 'updateMask.fieldPaths=' + c; }).join('&'), 'patch', corpo);
}

/* ── 3.1) DESCONECTAR ─────────────────────────────────────────
   ⚠️ ISTO É OBRIGAÇÃO, NÃO CORTESIA. A especificação diz, em negrito, que o
   endpoint de remover registro **deve** ser chamado quando o aplicativo
   oferece "Delete My Account" ou "Disconnect" fora do fluxo de consentimento
   do próprio Garmin Connect. O Meros360 oferece as duas coisas — apagar a
   conta está na tela de Conta desde sempre.

   Esquecer isso deixaria a Garmin empurrando dados de uma pessoa que pediu
   para sair, o que é o oposto do que ela pediu, e é descumprimento de
   contrato. A ordem importa: avisa o fabricante PRIMEIRO; só depois apaga o
   token, senão fica sem como avisar. */
function desconectar_(uid, provedor) {
  const conexao = lerConexao_(uid, provedor);
  if (!conexao) return { ok: true, nota: 'não havia conexão' };
  let avisou = false, erro = null;
  try {
    const prov = provedor_(provedor);
    if (prov.registro) {
      const r = UrlFetchApp.fetch(prov.registro, {
        method: 'delete',
        headers: { Authorization: 'Bearer ' + tokenValido_(conexao) },
        muteHttpExceptions: true });
      const c = r.getResponseCode();
      /* 204 é o esperado; 401/404 significam que lá já não existe — nos dois
         casos o objetivo (parar de receber) está cumprido */
      avisou = (c >= 200 && c < 300) || c === 401 || c === 404;
      if (!avisou) erro = 'remover registro devolveu ' + c;
    }
  } catch (e) { erro = e.message; }
  /* o lado local sai de qualquer jeito: se o fabricante não respondeu, o
     pior cenário é ele seguir empurrando para um endereço que vai descartar */
  apagarChave_('conexao_' + uid + '_' + provedor);
  apagarChave_('vinculo_' + uid + '_' + provedor);
  if (conexao.idNoProvedor) apagarChave_('idprov_' + provedor + '_' + conexao.idNoProvedor);
  return { ok: true, avisou: avisou, erro: erro };
}

function lerConexao_(uid, provedor) {
  const d = fs_('/kv/' + encodeURIComponent('conexao_' + uid + '_' + provedor));
  if (!d || !d.fields || !d.fields.v) return null;
  try { return JSON.parse(d.fields.v.stringValue); } catch (e) { return null; }
}
/* do id do fabricante de volta para o nosso uid — o caminho que o push usa */
function uidPeloIdDoProvedor_(provedor, idProv) {
  const d = fs_('/kv/' + encodeURIComponent('idprov_' + provedor + '_' + idProv));
  if (!d || !d.fields || !d.fields.v) return null;
  try { return (JSON.parse(d.fields.v.stringValue) || {}).uid || null; } catch (e) { return null; }
}
function apagarChave_(chave) {
  try { fs_('/kv/' + encodeURIComponent(chave), 'delete'); } catch (e) {
    console.warn('apagar ' + chave + ': ' + e.message);
  }
}

/* ── 4) O PEDIDO ───────────────────────────────────────────────────────────
   Criado pelo app, lido aqui, apagado em seguida. Curto na vida e pobre em
   conteúdo: se vazar, não serve para nada. */
function lerPedido_(id) {
  if (!id) throw new Error('Pedido ausente. Comece pelo app.');
  const d = fs_('/kv/' + encodeURIComponent('pedido_' + id));
  if (!d || !d.fields || !d.fields.v) throw new Error('Pedido não encontrado ou já usado.');
  const p = JSON.parse(d.fields.v.stringValue);
  if (!p.uid || !p.provedor) throw new Error('Pedido incompleto.');
  if (!p.em || (Date.now() - p.em) > PEDIDO_VALIDADE_MIN * 60000) {
    throw new Error('Este pedido expirou. Toque em Conectar de novo.');
  }
  /* a chave contém o uid: conferir isso impede que um pedido de outra pessoa
     seja usado com um id adivinhado */
  if (id.indexOf(p.uid + '_') !== 0) throw new Error('Pedido inconsistente.');
  return p;
}
function apagarPedido_(id) {
  try { fs_('/kv/' + encodeURIComponent('pedido_' + id), 'delete'); } catch (e) {}
}

/* ── 5) O RECEPTOR DE PUSH ─────────────────────────────────────────────────
   A faixa Starter da Garmin não tem rota de pull: ela EMPURRA os dados para
   um endereço público toda vez que o relógio sincroniza. Daí as exigências
   de estar sempre no ar e de ser idempotente.

   Idempotência a gente já tem de graça: o pacote mora em
   `garmin_<uid>_<data>`, então receber o mesmo dia três vezes grava o mesmo
   documento três vezes. Nada duplica.

   ⚠️ A FORMA DO CORPO VEM DA DOCUMENTAÇÃO DO PORTAL. `traduzir_` abaixo é o
   único lugar que precisa saber dela. */
function doPost(e) {
  try {
    const corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const n = receberPush_(corpo);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, gravados: n }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    /* responder 200 mesmo em erro é deliberado: o fabricante reenvia em caso
       de falha, e uma fila de reenvio por causa de um dado torto só piora.
       O erro fica no log de execuções. */
    console.error('push: ' + (err && err.message || err));
    return ContentService.createTextOutput(JSON.stringify({ ok: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function receberPush_(corpo) {
  /* ⚠️ O MESMO ENDEREÇO RECEBE COISAS DIFERENTES. Além dos dados de saúde,
     chega aqui a notificação de DESREGISTRO: a pessoa desconectou o Meros360
     pelo Garmin Connect. Tratar tudo como dado de saúde faria o desregistro
     virar erro no log e a conexão morta continuar viva do nosso lado. */
  if (corpo && corpo.deregistrations) return desregistrar_(corpo.deregistrations);
  if (corpo && corpo.userPermissionsChange) {
    console.log('mudança de permissão recebida; ainda sem tratamento');
    return 0;
  }
  throw new Error('receberPush_ ainda não sabe a forma dos dados de saúde. '
    + 'Falta a seção 4.1 do Health API (ver backend/CONEXOES.md).');
}

/* A notificação traz o id DO FABRICANTE, nunca o nosso uid — por isso o
   índice `idprov_`. Aqui não se chama o endpoint de remover registro: quem
   desconectou foi a pessoa, do lado de lá; já está feito. */
function desregistrar_(lista) {
  let n = 0;
  (lista || []).forEach(function (d) {
    const idProv = d && (d.userId || d.user_id);
    if (!idProv) return;
    const uid = uidPeloIdDoProvedor_('garmin', idProv);
    if (!uid) { console.warn('desregistro de id desconhecido'); return; }
    apagarChave_('conexao_' + uid + '_garmin');
    apagarChave_('vinculo_' + uid + '_garmin');
    apagarChave_('idprov_garmin_' + idProv);
    n++;
  });
  console.log('desregistros processados: ' + n);
  return n;
}

/* ── 6) FERRAMENTAS DE CONFERÊNCIA ─────────────────────────────────────────
   Rode estas duas no editor do Apps Script. Elas não dependem de nenhum
   fabricante e provam que a metade que é nossa está de pé. */
function conexoesUrl() {
  const u = urlRetorno_(), fixa = props_().getProperty('URL_WEBAPP');
  let msg = 'URL deste Web App (use no portal do fabricante):\n' + u;
  if (!fixa && /\/dev$/.test(String(u || ''))) {
    msg += '\n\n⚠️ Este é o endereço /dev: só abre para quem edita o projeto.'
         + '\nPublique em Implantar > Nova implantação > App da Web, copie a URL'
         + '\nque termina em /exec e guarde em URL_WEBAPP nas Propriedades do script.';
  }
  Logger.log(msg); return msg;
}

function conexoesConferir() {
  const faltas = [];
  Object.keys(PROVEDORES).forEach(function (k) {
    const p = PROVEDORES[k];
    [p.propAutorizar, p.propToken, p.propUserId, p.propRegistro,
     p.propId, p.propSegredo].forEach(function (nome) {
      if (!props_().getProperty(nome)) faltas.push(k + ': falta ' + nome);
    });
  });
  if (!props_().getProperty('URL_WEBAPP')) faltas.push('URL_WEBAPP (a URL /exec da implantação)');
  let fire = 'Firestore: ';
  try { fs_('/kv/dev_equipes'); fire += 'ok (conta de serviço respondendo)'; }
  catch (e) { fire += 'FALHOU — ' + e.message; }

  const msg = [conexoesUrl(), '', fire, '',
    faltas.length ? 'Pendências:\n- ' + faltas.join('\n- ')
                  : 'Nenhuma pendência: todos os provedores estão preenchidos.'].join('\n');
  Logger.log(msg); return msg;
}

/* ── 7) MIUDEZAS ───────────────────────────────────────────────────────────*/
function provedor_(id) {
  const base = PROVEDORES[String(id || '').toLowerCase()];
  if (!base) throw new Error('Provedor desconhecido: ' + id);
  /* a cópia carrega os valores; o catálogo continua sem saber de nada */
  const p = {};
  Object.keys(base).forEach(function (k) { p[k] = base[k]; });
  p.autorizar = props_().getProperty(base.propAutorizar) || '';
  p.token     = props_().getProperty(base.propToken) || '';
  p.userid    = props_().getProperty(base.propUserId) || '';
  p.registro  = props_().getProperty(base.propRegistro) || '';
  if (!p.autorizar || !p.token) {
    throw new Error(p.nome + ' ainda não está configurado neste script. '
      + 'Veja backend/CONEXOES.md.');
  }
  return p;
}
function propObrig_(nome) {
  const v = props_().getProperty(nome);
  if (!v) throw new Error('Falta a propriedade ' + nome + ' nas Propriedades do script.');
  return v;
}
/* ⚠️ `getUrl()` DEVOLVE ENDEREÇOS DIFERENTES conforme de onde é chamado.
   No editor devolve o `/dev`, que só abre para quem tem acesso de edição ao
   projeto — inútil como retorno de OAuth. Dentro de uma requisição do Web App
   publicado devolve o `/exec`, que é o certo.

   E o `redirect_uri` precisa ser IDÊNTICO ao registrado no portal, caractere
   por caractere. Um valor que muda conforme quem chamou é bomba-relógio:
   passa no teste e falha na vida real, com um 400 que não explica nada.
   Então a PROPRIEDADE manda, e `getUrl()` fica só de reserva. */
function urlRetorno_() {
  return props_().getProperty('URL_WEBAPP') || ScriptApp.getService().getUrl();
}

function aleatorio_(n) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let s = '';
  for (let i = 0; i < n; i++) s += alfabeto.charAt(Math.floor(Math.random() * alfabeto.length));
  return s;
}
/* base64url do SHA-256, sem padding — é o que o PKCE pede */
function desafio_(verificador) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, verificador,
    Utilities.Charset.US_ASCII);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}
function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/* páginas do tamanho do recado: quem chega aqui está no meio de outra coisa */
function pagina_(titulo, html, irPara) {
  const corpo = '<!doctype html><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + (irPara ? '<script>window.top.location.replace(' + JSON.stringify(irPara) + ')</script>' : '')
    + '<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:40px 22px;'
    + 'color:#15171a;background:#f4f3f0}h1{font-size:21px;margin:0 0 12px}'
    + 'div{max-width:460px;margin:0 auto}a{color:#c0392b}</style>'
    + '<div><h1>' + esc_(titulo) + '</h1><p>' + html + '</p></div>';
  return HtmlService.createHtmlOutput(corpo)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
