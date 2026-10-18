/* Extensões aditivas da v174. Clubes do catálogo e equipes legadas não viram
   grupos privados e nenhum nome público concede permissões. Sem IA externa. */
const GERADOR_REVISAO='g1';
function tecnicoAtivo(){return !!(S.u?.equipe&&S.u.aprovado===true)||!!S.grupos?.some(g=>g.temTecnico);}
function podeGerarTreino(){return !!(S.u?.perfil==='atleta'&&!tecnicoAtivo());}
function cardInicioGuiado(n){
  if(n)return podeGerarTreino()?'<button class="ghost full" style="margin-bottom:10px" onclick="abrirGerador()">Gerar um treino de piscina</button>':'';
  return `<section class="card inicio-guiado" aria-labelledby="inicioTitulo"><h3 id="inicioTitulo">Como você quer começar?</h3>
    <p class="small">Você pode registrar seus próprios treinos sem equipe e sem técnico. Planejar não marca o treino como realizado.</p>
    <div class="inicio-acoes"><button class="primary full" onclick="novoTreinoPro()">Adicionar meu treino</button>
    ${podeGerarTreino()?'<button class="full" onclick="abrirGerador()">Gerar um treino</button>':''}
    <button class="ghost full" onclick="abrirEscolherTecnico()">Vincular meu técnico</button></div>
    <p class="xs muted">${S.u?.perfil==='pro'?'PRO: cole ou monte sua sessão, registre todos os tempos e acompanhe o relatório.':'No registro simples, informe a duração e como foi o esforço. Não precisa conhecer termos técnicos.'}</p></section>`;
}
function gerarSessaoPiscina(op){
  const niveis={iniciante:{ritmo:240,teto:600,multiplo:1},intermediario:{ritmo:180,teto:1400,multiplo:2},avancado:{ritmo:150,teto:2400,multiplo:4}};
  const nv=Object.hasOwn(niveis,op?.nivel)?niveis[op.nivel]:null,min=Number(op?.minutos),pis=Number(op?.piscina),cap=Number(op?.continuo);
  if(!nv||![25,50].includes(pis)||!Number.isInteger(min)||min<15||min>60||!Number.isFinite(cap)||cap<pis||cap>5000||op.seguro!==true)
    throw Error('Informe experiência, 15 a 60 minutos, piscina e capacidade de nadar ao menos uma extensão com segurança.');
  const dist=Math.min(pis*nv.multiplo,Math.floor(cap/pis)*pis),pausa=30;
  const volAlvo=Math.min(nv.teto,Math.floor(min*60/(nv.ritmo/100+pausa/dist)/pis)*pis);
  const aquecimento=pis*2,soltura=pis*2,reps=Math.max(1,Math.floor((volAlvo-aquecimento-soltura)/dist));
  const linhas=[['Aquecimento',2,pis],['Parte principal',reps,dist],['Encerramento',2,pis]];
  const blocos=linhas.map(([titulo,reps,dist],i)=>({id:'gbl'+i,titulo,itens:[{id:'gi'+i,reps,rodadas:1,dist,estilo:'livre',tags:[],pausa:pausa*1000,intervalo:null,forte:false,parcial:false,obs:'Confortável, sem esforço máximo. Descanse entre repetições.',vol:reps*dist}]}));
  return {titulo:'Sessão de natação · '+op.nivel,piscina:pis===25?'SC25':'LC50',blocos,
    textoBruto:linhas.map(([t,r,d])=>t+'\n'+r+'x'+d+' livre confortável · pausa de 30s').join('\n\n'),
    volume:linhas.reduce((a,[,r,d])=>a+r*d,0),parametros:{nivel:op.nivel,minutos:min,piscina:pis,continuo:cap},revisao:GERADOR_REVISAO};
}
async function lerRevisaoGerador(){
  const c=await grGet('app_config','generator',true);
  if(c?.status!=='aprovado'||c.versao!==GERADOR_REVISAO||!c.profissionalUid)return null;
  const p=await grGet('professionals',c.profissionalUid,true);return p?.status==='aprovado'?c:null;
}
async function abrirGerador(){
  try{await carregarGrupos();if(!podeGerarTreino()&&!ehAdmin())throw Error('A geração é destinada ao Atleta comum sem técnico ativo. O PRO continua podendo adicionar o próprio treino.');
    const revisao=await lerRevisaoGerador();S.revisaoGerador=revisao;
    if(!revisao&&!ehAdmin())return alerta('Gerador em revisão','A estrutura está pronta, mas esta versão ainda precisa de revisão profissional registrada. Enquanto isso, use Adicionar meu treino ou vincule um técnico.');
    S.geradorPreview=null;
    sheet(`<h2>Gerar treino de piscina</h2>${!revisao?'<div class="note warn">Prévia administrativa para revisão. Não liberada aos atletas.</div>':''}
      <p class="small">O app monta uma sessão pelas suas respostas. Não usa exames nem dados do relógio. Escolha o que já faz com conforto.</p>
      <div class="field"><label for="gnNivel">Experiência na água</label><select id="gnNivel"><option value="iniciante">Iniciante — já nado uma extensão com segurança</option><option value="intermediario">Intermediário — já treino regularmente</option><option value="avancado">Avançado — tenho experiência em sessões mais longas</option></select></div>
      <div class="grid2"><div class="field"><label for="gnTempo">Tempo disponível, em minutos</label><input id="gnTempo" type="number" min="15" max="60" value="30"></div>
      <div class="field"><label for="gnPiscina">Comprimento da piscina</label><select id="gnPiscina"><option value="25">25 metros</option><option value="50">50 metros</option></select></div></div>
      <div class="field"><label for="gnContinuo">Quanto consegue nadar sem parar, confortavelmente? Metros</label><input id="gnContinuo" type="number" min="25" max="5000" step="25" placeholder="Ex.: 50"></div>
      <p class="xs muted">Sem equipamentos, sem apneia, sem águas abertas e sem esforços máximos. A montagem não é uma avaliação individual de saúde. Se não nada com segurança, procure aulas supervisionadas.</p>
      <label class="small"><input id="gnSeguro" type="checkbox"> Já nado com segurança e vou praticar em piscina supervisionada.</label>
      <button class="primary full" style="margin-top:16px" onclick="preverTreinoGerado()">Ver treino antes de adicionar</button>`);
  }catch(e){alerta('Gerador indisponível',esc(e.message));}
}
function preverTreinoGerado(){
  try{
    const t=gerarSessaoPiscina({nivel:val('gnNivel'),minutos:val('gnTempo'),piscina:val('gnPiscina'),continuo:val('gnContinuo'),seguro:document.getElementById('gnSeguro')?.checked});
    S.geradorPreview=t;
    sheet(`<h2>Confira seu treino</h2><p class="small"><b>${t.volume} metros</b> · piscina de ${t.parametros.piscina} m · ${t.parametros.minutos} min disponíveis, não uma duração garantida.</p>
      ${t.blocos.map(b=>`<h3>${esc(b.titulo)}</h3><p class="small">${b.itens[0].reps} vezes ${b.itens[0].dist} metros em ritmo confortável, descansando 30 segundos entre repetições.</p>`).join('')}
      <p class="xs muted">Interrompa se não estiver confortável. Você pode reduzir ou encerrar a sessão. O treino só entra como planejado.</p>
      ${S.revisaoGerador?`<p class="xs muted">Regras ${GERADOR_REVISAO}, revisão registrada por ${esc(S.revisaoGerador.profissionalNome)} · ${esc(S.revisaoGerador.cref)}.</p><div class="field"><label for="gnData">Dia do treino</label><input id="gnData" type="date" value="${hoje()}"></div>
      <button class="primary full" onclick="adicionarTreinoGerado()">Adicionar ao meu calendário</button>`:'<p class="note warn">Não pode ser adicionado: revisão profissional pendente.</p>'}
      <button class="ghost full" style="margin-top:8px" onclick="abrirGerador()">Ajustar respostas</button>`);
  }catch(e){toast(e.message);}
}
async function salvarTreinoPessoalNovo(t){
  const id=S.u.id,k=kPTr(id,t.id),idxKey=kPTrIdx(id);
  if(FB){
    await fdb.runTransaction(async tx=>{
      const ref=fdb.collection('kv').doc(idxKey),s=await tx.get(ref),idx=s.exists?JSON.parse(s.data().v):[];
      const novo=idx.filter(x=>x.id!==t.id);novo.push({id:t.id,data:t.data,titulo:t.titulo,nivel:t.nivel||null,vol:volTreino(t),para:[id],nAtletas:1,_pessoal:true});
      for(const [ch,v] of [[k,t],[idxKey,novo]]){const json=JSON.stringify(v);if(!checaTamanho(ch,json).ok)throw Error('Treino acima do limite');tx.set(fdb.collection('kv').doc(ch),{v:json,...camposSeguranca(ch,v),at:firebase.firestore.FieldValue.serverTimestamp()});}
    });
  }else{
    const idx=await DB.get(idxKey)||[];
    if(await DB.set(k,t)===false||await DB.set(idxKey,[...idx.filter(x=>x.id!==t.id),{id:t.id,data:t.data,titulo:t.titulo,vol:volTreino(t),para:[id],_pessoal:true}])===false)throw Error('Não consegui guardar o treino');
  }
  await carregarDados();S.treino=t;S.sub='detalhe';S.aba='treinos';fecharSheet();render();
}
async function adicionarTreinoGerado(){
  await grAcao(async()=>{
    if(!podeGerarTreino())throw Error('Seu vínculo ou perfil mudou. Adicione seu próprio treino ou consulte o técnico.');
    const c=await lerRevisaoGerador();if(!c)throw Error('Esta versão não está liberada');
    const p=S.geradorPreview;if(!p)throw Error('Gere uma prévia primeiro');
    const data=val('gnData');if(!/^\d{4}-\d{2}-\d{2}$/.test(data))throw Error('Escolha o dia do treino');
    const t={...copiaDados(p),id:uid(),data,para:[S.u.id],registros:{},feito:{},_pessoal:true,criadoPor:S.u.id,autor:'Gerador Meros360',atualizado:Date.now(),origem:{tipo:'gerador',versao:GERADOR_REVISAO,profissionalUid:c.profissionalUid}};
    await salvarTreinoPessoalNovo(t);toast('Treino planejado adicionado. Marque como feito somente após nadar.');
  },false);
}

/* Interface de dados estruturados: separada do kv legado. Operações de gestão
   exigem servidor e regras; nenhuma transação cai num overwrite offline. */
function grIdentidade(){if(!S.u||FB&&(!fauth?.currentUser||fauth.currentUser.uid!==S.u.id||!fauth.currentUser.emailVerified))throw Error('Entre na sua conta e confirme o e-mail para continuar');return S.u;}
async function grGet(col,id,servidor=false){grIdentidade();if(!FB)return DB.get('grlocal_'+col+'_'+id);const ref=fdb.collection(col).doc(id),s=await (servidor?ref.get({source:'server'}):ref.get());return s.exists?{...s.data(),id:s.id}:null;}
async function grLista(col,filtros){
  grIdentidade();if(!FB){const ids=await DB.get('grlocal_idx_'+col)||[];const out=[];for(const id of ids){const d=await grGet(col,id);if(d&&filtros.every(([k,v])=>d[k]===v))out.push({...d,id});}return out;}
  let q=fdb.collection(col);for(const [k,v] of filtros)q=q.where(k,'==',v);const s=await q.get();return s.docs.map(d=>({...d.data(),id:d.id}));
}
async function grSet(col,id,v){grIdentidade();const dados={...v};delete dados.id;if(FB){await fdb.collection(col).doc(id).set(dados);return;}if(await DB.set('grlocal_'+col+'_'+id,dados)===false)throw Error('Falha local');const ids=await DB.get('grlocal_idx_'+col)||[];if(!ids.includes(id))await DB.set('grlocal_idx_'+col,[...ids,id]);}
function grMembroId(g,u){return g+'_'+u;}
function grUid(){const b=new Uint8Array(16);crypto.getRandomValues(b);return [...b].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function grTokenHash(t){if(!/^[a-f0-9]{64}$/.test(t))throw Error('Convite inválido');const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function grAcao(fn,reabrir=true){
  if(S.grBusy)return toast('Aguarde a operação atual terminar e tente novamente.');S.grBusy=true;
  try{grIdentidade();if(FB&&navigator.onLine===false)throw Error('Esta operação de gestão exige conexão');await fn();if(reabrir){await carregarGrupos();if(S.grGrupoId)await abrirGrupo(S.grGrupoId);else render();}}
  catch(e){alerta('Não concluído',esc(e.code==='permission-denied'?'O servidor não autorizou a operação. Confira permissões e se as regras v174 foram publicadas.':e.message));}
  finally{S.grBusy=false;}
}
async function carregarGrupos(){
  const u=grIdentidade(),id=u.id;
  const [ms,donos]=await Promise.all([grLista('group_members',[['uid',id],['ativo',true]]),grLista('groups',ehAdmin()?[]:[['ownerUid',id]])]);
  const mapa=new Map(donos.map(g=>[g.id,{...g,meuPapel:g.ownerUid===id?'responsavel':'administrador'}]));
  for(const m of ms){const g=mapa.get(m.groupId)||await grGet('groups',m.groupId);if(g)mapa.set(m.groupId,{...g,meuPapel:g.ownerUid===id?'responsavel':m.role});}
  const grupos=[...mapa.values()];
  for(const g of grupos){
    const ts=await grLista('group_members',[['groupId',g.id],['role','tecnico'],['ativo',true]]);
    g.tecnicos=[];for(const t of ts){let p=null;try{p=await grGet('professionals',t.uid);}catch(_){}if(p?.status==='aprovado')g.tecnicos.push({uid:t.uid,nome:t.nome,cref:p.cref});}
    g.temTecnico=!g.arquivado&&!!g.tecnicos.length;g.possoTreinar=g.tecnicos.some(t=>t.uid===id)||ehAdmin();
  }
  if(S.u?.id!==id)return;
  S.grupos=grupos;S.gruposErro=null;return grupos;
}
async function abrirMeusGrupos(){
  fecharSheet();S.aba='grupos';S.grGrupoId=null;S.grupos=null;render();
  try{await carregarGrupos();}catch(e){S.gruposErro=e.message;S.grupos=[];}render();
}
function telaGrupos(){
  if(S.grupos==null)return '<h2>Meus grupos</h2><p role="status">Carregando grupos…</p>';
  if(S.grGrupoId)return telaGrupoDetalhe();
  return `<h2 style="margin-top:18px">Meus grupos de treinos</h2>
    <p class="small">São espaços privados. Sua equipe ou clube do perfil é uma escolha separada. Entrar num grupo não compartilha exames nem dados do relógio.</p>
    ${S.gruposErro?`<div class="note warn">${esc(S.gruposErro)} <button class="full" onclick="abrirMeusGrupos()">Tentar novamente</button></div>`:''}
    <div class="inicio-acoes"><button class="primary full" onclick="abrirCriarGrupo()">Criar um grupo privado</button><button class="full" onclick="abrirReceberConvite()">Recebi um convite</button></div>
    ${S.grupos.map(g=>`<button class="lst full" onclick="abrirGrupo('${g.id}')"><span class="grow" style="text-align:left"><b>${esc(g.nome)}</b><span class="xs muted" style="display:block">${g.meuPapel==='administrador'?'Administração da plataforma':g.meuPapel==='responsavel'?'Responsável pelo grupo':g.meuPapel==='tecnico'?'Técnico convidado':'Atleta'} · ${g.verificacao==='verificado'?'Representação verificada pela administração':'Grupo independente — representação de clube não verificada'}</span></span><span aria-hidden="true">›</span></button>`).join('')||'<p class="small muted" style="margin-top:18px">Você ainda não participa de grupos. Pode continuar usando seus treinos pessoais normalmente.</p>'}
    <button class="ghost full" style="margin-top:16px" onclick="abrirCredencial()">Sou técnico: solicitar verificação profissional</button>
    ${ehAdmin()?'<button class="full" style="margin-top:8px" onclick="abrirRevisoesAdmin()">Administração: verificações e gerador</button>':''}
    <button class="ghost full" style="margin-top:12px" onclick="irPara(\'treinos\')">Voltar aos meus treinos</button>`;
}
function abrirCriarGrupo(){sheet(`<h2>Criar grupo privado</h2><p class="small">Você administrará somente este novo espaço. Isto não comprova representação de um clube, não transfere equipes existentes e não torna você técnico.</p><div class="field"><label for="grNome">Nome do grupo</label><input id="grNome" maxlength="80" placeholder="Ex.: Turma da manhã"></div><button class="primary full" onclick="criarGrupoPrivado()">Criar grupo</button>`);}
async function criarGrupoPrivado(){await grAcao(async()=>{
  const nome=val('grNome');if(nome.length<3||nome.length>80)throw Error('Informe um nome entre 3 e 80 caracteres');
  const id=grUid(),u=S.u,g={nome,ownerUid:u.id,verificacao:'nao_verificado',arquivado:false,criadoEm:Date.now(),transferUid:null,transferExp:0};
  const m={groupId:id,uid:u.id,email:u.email.toLowerCase(),nome:u.nome,role:'atleta',ativo:true,criadoEm:Date.now(),inviteId:null};
  if(FB){const b=fdb.batch();b.set(fdb.collection('groups').doc(id),g);b.set(fdb.collection('group_members').doc(grMembroId(id,u.id)),m);await b.commit();}
  else{await grSet('groups',id,g);await grSet('group_members',grMembroId(id,u.id),m);}
  fecharSheet();toast('Grupo privado criado');});}
async function abrirGrupo(id){
  S.grGrupoId=id;S.grDetalhe=null;render();
  try{
    const g=S.grupos.find(x=>x.id===id);if(!g)throw Error('Grupo não encontrado');
    const treinos=await grLista('group_workouts',[['groupId',id]]);
    const membros=(g.ownerUid===S.u.id||ehAdmin()||g.possoTreinar)?await grLista('group_members',[['groupId',id],['ativo',true]]):[];
    const registros=g.possoTreinar?await grLista('group_records',[['groupId',id]]):[];
    const convites=g.ownerUid===S.u.id||ehAdmin()?await grLista('group_invites',[['groupId',id]]):[];
    S.grDetalhe={g,treinos,membros,registros,convites};
  }catch(e){S.grDetalhe={erro:e.message};}render();
}
function telaGrupoDetalhe(){
  const d=S.grDetalhe;if(!d)return '<p role="status">Carregando grupo…</p>';
  if(d.erro)return `<div class="note warn">${esc(d.erro)}</div><button class="full" onclick="abrirMeusGrupos()">Voltar</button>`;
  const {g,treinos,membros,registros,convites}=d,dono=g.ownerUid===S.u.id||ehAdmin();
  return `<button class="ghost" onclick="abrirMeusGrupos()">Voltar aos grupos</button><h2>${esc(g.nome)}</h2>
    <p class="xs muted">${g.verificacao==='verificado'?'Representação verificada pela administração':'Grupo independente. O nome não comprova representação de um clube.'}</p>
    <p class="small">Técnicos habilitados: ${g.tecnicos.map(t=>esc(t.nome)+' · '+esc(t.cref)).join(', ')||'nenhum ainda'}. Convite e verificação profissional são etapas separadas.</p>
    ${g.arquivado?'<div class="note warn">Grupo arquivado: não aceita novos convites ou treinos.</div>':''}
    ${dono&&!g.arquivado?'<div class="inicio-acoes"><button class="primary full" onclick="abrirConvidarGrupo()">Convidar atleta ou técnico</button><button class="full" onclick="abrirReivindicarGrupo()">Solicitar verificação da representação</button></div>':''}
    ${g.possoTreinar&&!g.arquivado?'<button class="primary full" style="margin-top:12px" onclick="abrirPublicarGrupo()">Enviar treino para o grupo</button>':''}
    <h3 style="margin-top:22px">Treinos recebidos</h3>
    ${treinos.filter(t=>t.status==='publicado').sort((a,b)=>b.data.localeCompare(a.data)).map(t=>`<div class="grupo-linha"><b>${esc(t.titulo)}</b><p class="xs muted">${brData(t.data)} · publicado por ${esc(t.autor)}</p><p class="small treino-texto">${esc(t.texto)}</p><button class="full" onclick="copiarTreinoGrupo('${t.id}')">Adicionar aos meus treinos</button>${g.possoTreinar?`<button class="ghost full" onclick="cancelarTreinoGrupo('${t.id}')">Retirar publicação</button>`:''}</div>`).join('')||'<p class="small muted">Nenhum treino publicado ainda. Seus treinos pessoais continuam disponíveis.</p>'}
    ${dono||g.possoTreinar?`<h3 style="margin-top:22px">Pessoas do grupo</h3>${membros.map(m=>`<div class="grupo-linha"><b>${esc(m.nome)}</b><span class="xs muted"> · ${m.role==='tecnico'?'técnico convidado':'atleta'}${m.uid===g.ownerUid?' · responsável':''}</span>${dono&&m.uid!==g.ownerUid?`<div class="row" style="gap:8px;margin-top:8px"><button class="sm" onclick="prepararTransferencia('${m.uid}')">Transferir responsabilidade…</button><button class="sm danger" onclick="removerMembroGrupo('${m.uid}')">Remover</button></div>`:''}</div>`).join('')}`:''}
    ${dono?`<h3 style="margin-top:22px">Convites</h3>${convites.map(c=>`<div class="grupo-linha"><span class="small">${esc(c.email)} · ${esc(c.role)} · ${esc(c.status)}</span>${c.status==='aberto'?`<button class="sm ghost" onclick="revogarConviteGrupo('${c.id}')">Revogar</button>`:''}</div>`).join('')||'<p class="small muted">Nenhum convite.</p>'}<button class="danger full" style="margin-top:16px" onclick="arquivarGrupo()">Arquivar grupo…</button>`:''}
    ${g.transferUid===S.u.id?'<button class="primary full" style="margin-top:16px" onclick="aceitarTransferenciaGrupo()">Aceitar responsabilidade pelo grupo</button>':''}
    ${g.possoTreinar?`<h3 style="margin-top:22px">Acompanhamento compartilhado pelos atletas</h3><p class="xs muted">Somente tempos, duração, esforço e conclusão que cada atleta escolheu enviar. Sem Saúde.</p>${registros.map(r=>`<div class="grupo-linha"><b>${esc(r.nome)}</b><p class="small">${esc(r.titulo)} · ${r.feito?'concluído':'não marcado como concluído'} · ${r.dur==null?'duração não informada':esc(r.dur)+' min'} · esforço ${r.rpe==null?'não informado':esc(r.rpe)+'/10'}</p>${resumoTemposGrupo(r.tempos)}</div>`).join('')||'<p class="small muted">Nenhum acompanhamento compartilhado ainda.</p>'}`:''}
    ${!dono?'<button class="danger full" style="margin-top:18px" onclick="sairGrupo()">Sair deste grupo…</button>':''}`;
}
function abrirConvidarGrupo(){sheet(`<h2>Convidar pessoa</h2><p class="small">O convite vale por 48 horas, uma única vez, para o e-mail informado. Ser convidado como técnico não substitui a verificação profissional.</p><div class="field"><label for="giEmail">E-mail da conta convidada</label><input id="giEmail" type="email" autocomplete="email"></div><div class="field"><label for="giRole">Papel neste grupo</label><select id="giRole"><option value="atleta">Atleta</option><option value="tecnico">Técnico</option></select></div><button class="primary full" onclick="criarConviteGrupo()">Criar convite individual</button>`);}
async function criarConviteGrupo(){await grAcao(async()=>{
  const g=S.grDetalhe.g;if(g.ownerUid!==S.u.id&&!ehAdmin())throw Error('Somente o responsável ou administrador convida');
  const email=val('giEmail').toLowerCase(),role=val('giRole');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['atleta','tecnico'].includes(role))throw Error('Confira o e-mail e o papel');
  const token=grUid()+grUid(),id=await grTokenHash(token);
  await grSet('group_invites',id,{groupId:g.id,groupName:g.nome,email,role,status:'aberto',expiraEm:Date.now()+48*3600000,criadoPor:S.u.id,criadoPorNome:S.u.nome,criadoEm:Date.now(),aceitoPor:null});
  const link=new URL(location.href);link.hash='convite='+token;
  sheet(`<h2>Convite criado</h2><p class="small">Envie este link somente para ${esc(email)}. Não enviamos e-mail automaticamente.</p><textarea id="giLink" readonly>${esc(link.href)}</textarea><button class="primary full" onclick="copiarTexto('giLink')">Copiar convite</button><button class="ghost full" style="margin-top:8px" onclick="fecharSheet();abrirGrupo('${g.id}')">Voltar ao grupo</button>`);
},false);}
function abrirReceberConvite(){sheet('<h2>Receber convite</h2><p class="small">Entre com o mesmo e-mail para o qual o convite foi criado.</p><div class="field"><label for="giToken">Link ou código completo do convite</label><input id="giToken" autocomplete="off"></div><button class="primary full" onclick="verConviteGrupo(val(\'giToken\'))">Conferir convite</button>');}
async function verConviteGrupo(texto){
  try{
    const token=String(texto).match(/(?:convite=)?([a-f0-9]{64})(?:$|&)/)?.[1];if(!token)throw Error('Link de convite inválido');
    const id=await grTokenHash(token),c=await grGet('group_invites',id);
    if(!c||c.email!==S.u.email.toLowerCase()||c.status!=='aberto'||c.expiraEm<=Date.now())throw Error('Convite expirado, usado, revogado ou destinado a outro e-mail');
    S.grConvite={...c,id};
    sheet(`<h2>Convite para ${esc(c.groupName||'grupo privado')}</h2><p class="small">Criado por ${esc(c.criadoPorNome||'responsável pelo grupo')}. Papel: <b>${c.role==='tecnico'?'técnico':'atleta'}</b>. Ao aceitar, seu nome e e-mail ficam disponíveis ao responsável e ao técnico habilitado. Seus exames e dados de saúde não são compartilhados. Os tempos só são enviados quando você escolher compartilhar.</p><button class="primary full" onclick="aceitarConviteGrupo()">Aceitar convite</button><button class="ghost full" style="margin-top:8px" onclick="fecharSheet()">Agora não</button>`);
  }catch(e){alerta('Convite não disponível',esc(e.message));}
}
async function aceitarConviteGrupo(){await grAcao(async()=>{
  const id=S.grConvite?.id;if(!id)throw Error('Confira o convite primeiro');const u=S.u;
  const validar=c=>{if(!c||c.email!==u.email.toLowerCase()||c.status!=='aberto'||c.expiraEm<=Date.now())throw Error('Convite não está mais disponível');};
  if(FB)await fdb.runTransaction(async tx=>{
    const ref=fdb.collection('group_invites').doc(id),s=await tx.get(ref),c=s.data();validar(c);
    // As regras conferem se o grupo está aberto; o destinatário ainda não pode ler seu conteúdo.
    tx.set(fdb.collection('group_members').doc(grMembroId(c.groupId,u.id)),{groupId:c.groupId,uid:u.id,email:u.email.toLowerCase(),nome:u.nome,role:c.role,ativo:true,criadoEm:Date.now(),inviteId:id});
    tx.update(ref,{status:'aceito',aceitoPor:u.id});
  });else{const c=await grGet('group_invites',id);validar(c);await grSet('group_members',grMembroId(c.groupId,u.id),{groupId:c.groupId,uid:u.id,email:u.email.toLowerCase(),nome:u.nome,role:c.role,ativo:true,criadoEm:Date.now(),inviteId:id});await grSet('group_invites',id,{...c,status:'aceito',aceitoPor:u.id});}
  S.grConvite=null;history.replaceState(null,'',location.pathname+location.search);fecharSheet();S.aba='grupos';S.grGrupoId=null;toast('Convite aceito');
});}
async function receberConviteNoLogin(){const t=location.hash.match(/^#convite=([a-f0-9]{64})$/)?.[1];if(t&&S.u)await verConviteGrupo(t);}
async function revogarConviteGrupo(id){await grAcao(async()=>{const c=await grGet('group_invites',id);await grSet('group_invites',id,{...c,status:'revogado'});await abrirGrupo(c.groupId);});}
async function removerMembroGrupo(id){if(!confirm('Remover o acesso desta pessoa ao grupo? Os dados pessoais dela não serão apagados.'))return;await grAcao(async()=>{const g=S.grDetalhe.g,k=grMembroId(g.id,id),m=await grGet('group_members',k);await grSet('group_members',k,{...m,ativo:false});await abrirGrupo(g.id);});}
async function sairGrupo(){if(!confirm('Sair do grupo e deixar de receber seus treinos? Seu histórico pessoal será mantido.'))return;await grAcao(async()=>{const k=grMembroId(S.grGrupoId,S.u.id),m=await grGet('group_members',k);await grSet('group_members',k,{...m,ativo:false});S.grGrupoId=null;});}
async function prepararTransferencia(id){if(!confirm('Convidar esta pessoa a assumir a responsabilidade? Você só perderá a gestão quando ela aceitar.'))return;await grAcao(async()=>{const g=await grGet('groups',S.grGrupoId);await grSet('groups',g.id,{...g,transferUid:id,transferExp:Date.now()+48*3600000});await abrirGrupo(g.id);});}
async function aceitarTransferenciaGrupo(){await grAcao(async()=>{
  const id=S.grGrupoId;
  if(FB)await fdb.runTransaction(async tx=>{const ref=fdb.collection('groups').doc(id),s=await tx.get(ref),g=s.data();if(g.transferUid!==S.u.id||g.transferExp<=Date.now())throw Error('Transferência indisponível');tx.update(ref,{ownerUid:S.u.id,transferUid:null,transferExp:0});});
  else{const g=await grGet('groups',id);if(g.transferUid!==S.u.id||g.transferExp<=Date.now())throw Error('Transferência indisponível');await grSet('groups',id,{...g,ownerUid:S.u.id,transferUid:null,transferExp:0});}
  S.grGrupoId=null;toast('Responsabilidade transferida');
});}
async function arquivarGrupo(){if(!confirm('Arquivar impede novos convites e publicações. O histórico não será apagado. Continuar?'))return;await grAcao(async()=>{const g=await grGet('groups',S.grGrupoId);await grSet('groups',g.id,{...g,arquivado:true});await abrirGrupo(g.id);});}
function abrirCredencial(){sheet(`<h2>Verificação profissional</h2><p class="small">Registro, identidade da conta e vínculo com o grupo são conferidos separadamente pela administração. Preencher este formulário não libera acesso.</p><div class="field"><label for="crNome">Nome profissional completo</label><input id="crNome" value="${esc(S.u.nome)}" maxlength="100"></div><div class="grid2"><div class="field"><label for="crCref">Registro CREF</label><input id="crCref" maxlength="40"></div><div class="field"><label for="crUf">UF do conselho</label><input id="crUf" maxlength="2"></div></div><button class="primary full" onclick="solicitarCredencial()">Enviar para conferência</button>`);}
async function solicitarCredencial(){await grAcao(async()=>{const nome=val('crNome'),cref=val('crCref'),uf=val('crUf').toUpperCase();if(nome.length<3||cref.length<4||!/[A-Z]{2}/.test(uf)||uf.length!==2)throw Error('Confira nome, registro e UF');await grSet('professionals',S.u.id,{uid:S.u.id,nome,cref,uf,status:'pendente',fonte:null,verificadoPor:null,verificadoEm:null});fecharSheet();toast('Pedido enviado. A administração ainda precisa conferir.');});}
function abrirReivindicarGrupo(){sheet('<h2>Comprovar representação de clube</h2><p class="small">A solicitação não libera permissões nem transfere uma equipe. A administração deve confirmar por um canal institucional obtido independentemente.</p><div class="field"><label for="gcEmail">Contato institucional</label><input id="gcEmail" type="email"></div><div class="field"><label for="gcFonte">Página pública oficial da instituição</label><input id="gcFonte" type="url" placeholder="https://..."></div><button class="primary full" onclick="solicitarRepresentacao()">Solicitar conferência</button>');}
async function solicitarRepresentacao(){await grAcao(async()=>{const contato=val('gcEmail'),fonte=val('gcFonte');if(!/^https:\/\//.test(fonte)||!contato.includes('@'))throw Error('Informe contato e página institucional HTTPS');await grSet('group_claims',grMembroId(S.grGrupoId,S.u.id),{groupId:S.grGrupoId,uid:S.u.id,contato,fonte,status:'pendente'});fecharSheet();toast('Solicitação enviada, sem mudança de permissões');});}
function abrirPublicarGrupo(){sheet(`<h2>Enviar treino ao grupo</h2><p class="small">Será visível aos participantes deste grupo. Cada atleta adiciona uma cópia ao seu calendário, sem sobrescrever treinos ou tempos anteriores.</p><div class="field"><label for="gpTitulo">Título</label><input id="gpTitulo" maxlength="100"></div><div class="grid2"><div class="field"><label for="gpData">Data</label><input id="gpData" type="date" value="${hoje()}"></div><div class="field"><label for="gpPiscina">Piscina</label><select id="gpPiscina"><option>SC25</option><option>LC50</option></select></div></div><div class="field"><label for="gpTexto">Treino escrito pelo técnico</label><textarea id="gpTexto" maxlength="12000" rows="8" placeholder="Aquecimento&#10;4x50 livre"></textarea></div><button class="primary full" onclick="publicarTreinoGrupo()">Publicar no grupo</button>`);}
async function publicarTreinoGrupo(){await grAcao(async()=>{const g=S.grDetalhe.g,titulo=val('gpTitulo'),texto=val('gpTexto'),data=val('gpData'),piscina=val('gpPiscina');if(!g.possoTreinar||g.arquivado)throw Error('É necessário convite ativo e verificação profissional');if(!titulo||!/^\d{4}-\d{2}-\d{2}$/.test(data)||!texto||!interpretar(texto).some(b=>b.itens.length))throw Error('Informe título, data e ao menos uma série válida');await grSet('group_workouts',grUid(),{groupId:g.id,titulo,texto,data,piscina,autor:S.u.nome,publishedBy:S.u.id,status:'publicado',criadoEm:Date.now()});fecharSheet();await abrirGrupo(g.id);});}
async function cancelarTreinoGrupo(id){await grAcao(async()=>{const t=await grGet('group_workouts',id);await grSet('group_workouts',id,{...t,status:'cancelado'});await abrirGrupo(t.groupId);});}
async function copiarTreinoGrupo(id){await grAcao(async()=>{
  const t=await grGet('group_workouts',id);if(!t||t.status!=='publicado')throw Error('Treino indisponível');
  const pessoalId='grupo'+id;if(await DB.get(kPTr(S.u.id,pessoalId)))throw Error('Você já adicionou este treino. Abra Meus treinos; nenhuma cópia foi sobrescrita.');
  const novo={id:pessoalId,titulo:t.titulo,data:t.data,piscina:t.piscina,textoBruto:t.texto,blocos:interpretar(t.texto),para:[S.u.id],registros:{},feito:{},_pessoal:true,criadoPor:S.u.id,autor:t.autor,atualizado:Date.now(),origem:{tipo:'grupo',groupId:t.groupId,workoutId:id}};
  await salvarTreinoPessoalNovo(novo);toast('Treino recebido adicionado como planejado');
},false);}
function temposParaCompartilhar(t,id){
  const itens=(t.blocos||[]).flatMap(b=>b.itens||[]),out={};
  const numero=v=>Number.isFinite(v)&&v>=0?v:null;
  const rodada=r=>({tempos:(r.tempos||[]).map(numero),parciais:(r.parciais||[]).map(numero),tot:numero(r.tot)});
  for(const [k,r] of Object.entries(t.registros?.[id]||{})){
    const i=itens.find(i=>i.id===k);if(!i)continue;
    out[k]={serie:`${i.reps||1} × ${i.dist||0} m ${i.estilo||''}`,...rodada(r),
      rd:(r.rd||[]).map(rodada),ritmo100:numero(r.ritmo100)};
  }return out;
}
function resumoTemposGrupo(tempos){
  const lista=v=>Array.isArray(v)?v:[],tempo=v=>Number.isFinite(v)&&v>=0?esc(fmt(v)):'—';
  const linhas=Object.values(tempos||{}).filter(r=>r&&typeof r==='object').map(r=>{
    const rodada=(v,n)=>{if(!v||typeof v!=='object')return '';return `<div class="xs">${n?`Rodada ${n}: `:''}${lista(v.tempos).map(tempo).join(' · ')||'Sem tempos'}${lista(v.parciais).some(x=>Number.isFinite(x))?'<br>Parciais: '+v.parciais.map(tempo).join(' · '):''}${Number.isFinite(v.tot)?'<br>Total: '+tempo(v.tot):''}</div>`;};
    return `<div style="margin:8px 0"><b class="xs">${esc(r.serie||'Série compartilhada')}</b>${lista(r.rd).length?r.rd.map((v,i)=>rodada(v,i+1)).join(''):rodada(r)}${Number.isFinite(r.ritmo100)?'<p class="xs">Ritmo por 100 m: '+tempo(r.ritmo100)+'</p>':''}</div>`;
  });return linhas.join('')||'<p class="xs muted">Nenhum tempo enviado.</p>';
}
async function compartilharTreinoGrupo(){await grAcao(async()=>{
  const t=S.treino,id=S.u.id,o=t?.origem;if(o?.tipo!=='grupo')throw Error('Este treino não veio de um grupo');
  if(!confirm('Compartilhar somente a conclusão, duração, esforço e seus tempos deste treino com os técnicos habilitados do grupo? Exames e dados do relógio não serão enviados.'))return;
  const se=t.sessao?.[id]||{};
  await grSet('group_records',grMembroId(o.workoutId,id),{groupId:o.groupId,workoutId:o.workoutId,uid:id,nome:S.u.nome,titulo:t.titulo,data:t.data,feito:treinoFeito(t,id),dur:se.dur??null,rpe:se.rpe??null,tempos:temposParaCompartilhar(t,id),atualizado:Date.now()});toast('Acompanhamento compartilhado');
},false);}
async function revogarCompartilhamentoGrupo(){await grAcao(async()=>{const o=S.treino?.origem;if(o?.tipo!=='grupo')throw Error('Treino sem origem de grupo');const id=grMembroId(o.workoutId,S.u.id);if(FB)await fdb.collection('group_records').doc(id).delete();else await grSet('group_records',id,{groupId:o.groupId,uid:S.u.id,revogado:true});toast('Compartilhamento removido do grupo');},false);}
async function apagarDadosGruposDaConta(){
  const u=grIdentidade(),donos=await grLista('groups',[['ownerUid',u.id]]);
  if(donos.some(g=>!g.arquivado))throw Error('Transfira a responsabilidade ou arquive seus grupos antes de apagar a conta.');
  const pares=await Promise.all([grLista('group_records',[['uid',u.id]]),grLista('group_members',[['uid',u.id]]),grLista('group_invites',[['email',u.email.toLowerCase()]]),grLista('group_claims',[['uid',u.id]])]);
  const cols=['group_records','group_members','group_invites','group_claims'];
  for(let n=0;n<pares.length;n++)for(const d of pares[n]){if(FB)await fdb.collection(cols[n]).doc(d.id).delete();else await DB.set('grlocal_'+cols[n]+'_'+d.id,null);}
  if(FB)await fdb.collection('professionals').doc(u.id).delete();else await DB.set('grlocal_professionals_'+u.id,null);
  escreverFilaSaude(u.id,[]);
}
async function abrirRevisoesAdmin(){
  if(!ehAdmin())return;
  try{
    const ps=await grLista('professionals',[]),cs=await grLista('group_claims',[]);
    S.grProfissionais=ps;S.grReivindicacoes=cs;
    sheet(`<h2>Verificações administrativas</h2><p class="small">Nenhuma conferência é automática. Registre a fonte consultada e confirme a identidade da conta por canal confiável.</p>
      ${ps.map(p=>`<div class="grupo-linha"><b>${esc(p.nome)}</b><p class="small">${esc(p.cref)} · ${esc(p.uf)} · ${esc(p.status)}</p><p class="xs treino-texto">UID da conta: ${esc(p.id)}</p><button class="full" onclick="revisarProfissional('${p.id}')">Conferir ou revogar</button></div>`).join('')||'<p class="small">Nenhum pedido profissional.</p>'}
      <h3>Representação de grupos</h3>${cs.map(c=>`<div class="grupo-linha"><p class="small">${esc(c.groupId)} · ${esc(c.contato)} · ${esc(c.status)}</p><p class="xs">${esc(c.fonte)}</p><button class="full" onclick="revisarRepresentacao('${c.id}')">Registrar conferência</button></div>`).join('')||'<p class="small">Nenhuma solicitação.</p>'}
      <button class="primary full" style="margin-top:16px" onclick="abrirRevisaoGerador()">Revisão e liberação do gerador</button>`);
  }catch(e){alerta('Não consegui abrir as verificações',esc(e.message));}
}
function revisarProfissional(id){S.grProfRevisao=id;const p=S.grProfissionais.find(p=>p.id===id);sheet(`<h2>Conferir profissional</h2><p class="small">${esc(p.nome)} · ${esc(p.cref)}. Um registro encontrado não comprova a identidade da conta.</p><p class="xs treino-texto">Confira a conta pelo UID ${esc(id)} em Firebase Authentication. Não aceite um e-mail digitado pelo solicitante como prova.</p><div class="field"><label for="rvFonte">URL oficial usada na conferência</label><input id="rvFonte" type="url" value="${esc(p.fonte||'')}"></div><label class="small"><input id="rvConfirmo" type="checkbox"> Conferi registro e identidade por canal independente.</label><button class="primary full" style="margin-top:14px" onclick="decidirProfissional(true)">Registrar aprovação</button><button class="danger full" style="margin-top:8px" onclick="decidirProfissional(false)">Revogar ou recusar</button>`);}
async function decidirProfissional(ok){await grAcao(async()=>{if(!ehAdmin())throw Error('Apenas administrador');const p=await grGet('professionals',S.grProfRevisao),fonte=val('rvFonte');if(ok&&(!/^https:\/\//.test(fonte)||!document.getElementById('rvConfirmo')?.checked))throw Error('Registre fonte e confirmação da conferência');await grSet('professionals',p.id,{...p,status:ok?'aprovado':'recusado',fonte:fonte||null,verificadoPor:S.u.id,verificadoEm:Date.now()});await abrirRevisoesAdmin();});}
function revisarRepresentacao(id){S.grClaimRevisao=id;sheet('<h2>Representação institucional</h2><p class="small">Confirme o contato institucional independentemente do pedido. Aprovar não altera o responsável e não importa dados de equipes legadas.</p><div class="field"><label for="rcFonte">Fonte oficial da confirmação</label><input id="rcFonte" type="url"></div><label class="small"><input id="rcConfirmo" type="checkbox"> Confirmei a representação por canal independente.</label><button class="primary full" style="margin-top:14px" onclick="decidirRepresentacao()">Registrar representação verificada</button>');}
async function decidirRepresentacao(){await grAcao(async()=>{if(!ehAdmin()||!document.getElementById('rcConfirmo')?.checked||!/^https:\/\//.test(val('rcFonte')))throw Error('Confirme a conferência e a fonte');const c=await grGet('group_claims',S.grClaimRevisao),g=await grGet('groups',c.groupId);await grSet('group_claims',c.id,{...c,status:'aprovado',verificadoPor:S.u.id,fonteVerificacao:val('rcFonte')});await grSet('groups',g.id,{...g,verificacao:'verificado',fonteVerificacao:val('rcFonte')});await abrirRevisoesAdmin();});}
function abrirRevisaoGerador(){const ps=(S.grProfissionais||[]).filter(p=>p.status==='aprovado');sheet(`<h2>Liberação do gerador ${GERADOR_REVISAO}</h2><p class="small">A revisão precisa abranger o algoritmo e todas as combinações de nível, capacidade, tempo e piscina. Nenhuma aprovação foi presumida pelo desenvolvimento.</p><div class="field"><label for="rgProf">Profissional responsável pela revisão</label><select id="rgProf"><option value="">Escolher…</option>${ps.map(p=>`<option value="${p.id}">${esc(p.nome)} · ${esc(p.cref)}</option>`).join('')}</select></div><label class="small"><input id="rgConfirmo" type="checkbox"> A revisão profissional desta versão foi concluída e autorizou sua liberação.</label><button class="primary full" style="margin-top:14px" onclick="salvarRevisaoGerador(true)">Liberar esta versão</button><button class="danger full" style="margin-top:8px" onclick="salvarRevisaoGerador(false)">Suspender geração</button>`);}
async function salvarRevisaoGerador(ok){await grAcao(async()=>{if(!ehAdmin())throw Error('Apenas administrador');let p=null;if(ok){p=await grGet('professionals',val('rgProf'));if(p?.status!=='aprovado'||!document.getElementById('rgConfirmo')?.checked)throw Error('Informe o profissional e confirme a revisão');}await grSet('app_config','generator',{status:ok?'aprovado':'suspenso',versao:GERADOR_REVISAO,profissionalUid:p?.uid||null,profissionalNome:p?.nome||null,cref:p?.cref||null,aprovadoPor:S.u.id,aprovadoEm:Date.now()});toast(ok?'Gerador liberado para esta versão':'Gerador suspenso');fecharSheet();});}

function registrarTestesInicioGrupos(){
  teste('grupos','compartilhar tempos não transporta campos arbitrários ou dados de outra pessoa',a=>{const t={blocos:[{itens:[{id:'i',reps:2,dist:50,estilo:'livre'}]}],registros:{eu:{i:{tempos:[30000],exames:['privado'],hrv:50}},outro:{i:{tempos:[20000]}}}};const r=temposParaCompartilhar(t,'eu');a.eq(r.i.tempos,[30000]);a.ok(!JSON.stringify(r).includes('privado'));a.ok(!JSON.stringify(r).includes('20000'));});
  teste('gerador','PRO não ganha geração nem perde treino próprio',a=>{const u=S.u;S.u={perfil:'pro'};a.ok(!podeGerarTreino());S.u=u;});
  teste('gerador','rejeita falta de segurança e piscina incompatível',a=>{for(const op of [{nivel:'iniciante',piscina:25,minutos:30,continuo:25,seguro:false},{nivel:'iniciante',piscina:50,minutos:30,continuo:25,seguro:true}]){let erro=false;try{gerarSessaoPiscina(op);}catch(_){erro=true;}a.ok(erro);}});
  teste('gerador','todas as combinações respeitam piscina, capacidade e contagem',a=>{for(const nivel of ['iniciante','intermediario','avancado'])for(const piscina of [25,50])for(const minutos of [15,30,60])for(const continuo of [piscina,200,1000]){const s=gerarSessaoPiscina({nivel,piscina,minutos,continuo,seguro:true});a.eq(s.volume,s.blocos.reduce((n,b)=>n+b.itens.reduce((v,i)=>v+i.reps*i.dist,0),0));a.ok(s.blocos.every(b=>b.itens.every(i=>i.dist%piscina===0&&i.dist<=continuo&&!i.forte)));}});
  teste('saúde três vias','editar exame não regride VFC alterada no outro aparelho',a=>{const b={garmin:[{data:'2026-10-18',hrv:40}],exames:[]};const l={...copiaDados(b),exames:[{id:'e1'}]},r={...copiaDados(b),garmin:[{data:'2026-10-18',hrv:60}]};a.eq(aplicarDiff(r,diffDados(b,l)).garmin[0].hrv,60);});
  teste('saúde três vias','não ressuscita excluído ao adicionar outro dado',a=>{const b={exames:[{id:'e1'},{id:'e2'}],garmin:[]},l={...copiaDados(b),garmin:[{data:'2026-10-18',peso:80}]};a.eq(aplicarDiff({exames:[{id:'e1'}],garmin:[]},diffDados(b,l)).exames.length,1);});
  teste('saúde três vias','exclusão preserva inclusão independente',a=>{const b={exames:[{id:'e1'},{id:'e2'}]},l={exames:[{id:'e1'}]},r={exames:[...b.exames,{id:'e3'}]};a.eq(aplicarDiff(r,diffDados(b,l)).exames.map(x=>x.id),['e1','e3']);});
  teste('saúde três vias','conflito no mesmo campo é explícito',a=>{let erro=false;try{aplicarDiff({hrv:60},diffDados({hrv:40},{hrv:50}));}catch(_){erro=true;}a.ok(erro);});
  teste('saúde três vias','atividade Garmin usa chave estável sem duplicar edição concorrente',a=>{const b={ativs:[{k:'a',min:30,dist:500}]},l={ativs:[{k:'a',min:35,dist:500}]},r={ativs:[{k:'a',min:30,dist:600}]};a.eq(aplicarDiff(r,diffDados(b,l)).ativs,[{k:'a',min:35,dist:600}]);});
  teste('grupos','registro malformado não derruba a tela do técnico',a=>{a.ok(typeof resumoTemposGrupo({a:null,b:{tempos:'inválido',rd:'inválido'},c:{rd:[null]}})==='string');});
  teste('VFC calendário','150 dias não contam como uma base de 60 dias',a=>{const g=Array.from({length:16},(_,i)=>({data:_dAtras(i*10),hrv:40+i%3,hrvF:'noite'}));a.eq(faixaHRV(g),null);});
}
