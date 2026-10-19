/* Persistência da Saúde por diferença de três vias. O cliente envia apenas o
   que editou, e o servidor aplica sobre a versão atual dentro de transação.
   Offline guardamos OPERAÇÕES duráveis por uid, nunca substituímos o documento
   inteiro por um snapshot antigo. As regras existentes continuam valendo. */
function copiaDados(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function igualDados(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function diffDados(antes,depois){
  if(igualDados(antes,depois))return null;
  if(antes===undefined&&Array.isArray(depois))return diffDados([],depois);
  if(Array.isArray(antes)&&Array.isArray(depois)){
    const k=[...antes,...depois].every(x=>x&&typeof x==='object'&&x.id!=null)?'id'
      :[...antes,...depois].every(x=>x&&typeof x==='object'&&x.data!=null)?'data'
      :[...antes,...depois].every(x=>x&&typeof x==='object'&&x.k!=null)?'k':null;
    if(k){
      const a=new Map(antes.map(x=>[String(x[k]),x])),b=new Map(depois.map(x=>[String(x[k]),x]));
      const itens={};for(const id of new Set([...a.keys(),...b.keys()])){
        const d=diffDados(a.get(id),b.get(id));if(d)itens[id]=d;
      }
      return {tipo:'lista',chave:k,itens};
    }
    return {tipo:'conjunto',adicionar:depois.filter(x=>!antes.some(y=>igualDados(x,y))),
      remover:antes.filter(x=>!depois.some(y=>igualDados(x,y)))};
  }
  if((antes===undefined||antes&&typeof antes==='object'&&!Array.isArray(antes))&&depois&&typeof depois==='object'&&!Array.isArray(depois)){
    const campos={};for(const k of new Set([...Object.keys(antes||{}),...Object.keys(depois)])){
      if(['__proto__','constructor','prototype'].includes(k))throw Error('Campo inválido no arquivo');
      const d=diffDados(antes?.[k],depois[k]);if(d)campos[k]=d;
    }
    return {tipo:'objeto',campos,novo:antes===undefined};
  }
  return {tipo:'valor',antes:copiaDados(antes),depois:copiaDados(depois),apagar:depois===undefined};
}
function aplicarDiff(atual,d,caminho){
  if(!d)return copiaDados(atual);
  const erro=()=>{throw Error('Conflito em '+(caminho||'Saúde')+': outro aparelho alterou ou apagou este dado.');};
  if(d.tipo==='valor'){
    if(!igualDados(atual,d.antes)&&!igualDados(atual,d.depois))erro();
    return d.apagar?undefined:copiaDados(d.depois);
  }
  if(d.tipo==='objeto'){
    if(atual==null&&!d.novo)erro();
    const r={...atual};for(const [k,v] of Object.entries(d.campos)){
      const n=aplicarDiff(r[k],v,(caminho?caminho+'.':'')+k);
      if(n===undefined)delete r[k];else r[k]=n;
    }return r;
  }
  if(d.tipo==='conjunto'){
    const r=(Array.isArray(atual)?atual:[]).filter(x=>!d.remover.some(y=>igualDados(x,y)));
    for(const x of d.adicionar)if(!r.some(y=>igualDados(x,y)))r.push(copiaDados(x));
    return r;
  }
  const m=new Map((atual||[]).map(x=>[String(x[d.chave]),copiaDados(x)]));
  for(const [id,v] of Object.entries(d.itens)){
    const n=aplicarDiff(m.get(id),v,(caminho||'')+'['+id+']');
    if(n===undefined)m.delete(id);else m.set(id,n);
  }return [...m.values()];
}
function chaveFilaSaude(id){return 'parcial_saude_ops_'+id;}
function lerFilaSaude(id){try{const a=JSON.parse(localStorage.getItem(chaveFilaSaude(id))||'[]');return Array.isArray(a)?a:[];}catch(_){throw Error('A fila local de Saúde não pôde ser lida. Exporte os dados antes de continuar.');}}
function escreverFilaSaude(id,fila){localStorage.setItem(chaveFilaSaude(id),JSON.stringify(fila));}
function donoDaSessao(){return S.u&&(!FB||!fauth||fauth.currentUser?.uid===S.u.id)&&!S.laudoAtleta&&!S.pro?._espelho&&(!S.pro?._dono||S.pro._dono===S.u.id);}
async function operacaoSaudeServidor(op){
  const k=kSau(op.uid);
  if(!FB){
    const rem=await DB.get(k),base=rem||op.semente;
    const n=aplicarDiff(base,op.diff);n._dono=op.uid;
    if(await DB.set(k,n)===false)throw Error('Não consegui gravar a Saúde');return n;
  }
  const ref=fdb.collection('kv').doc(fkey(k));
  return fdb.runTransaction(async tx=>{
    const s=await tx.get(ref),rem=s.exists?JSON.parse(s.data().v):null;
    if(rem?._dono&&rem._dono!==op.uid)throw Error('Proprietário incompatível');
    if((rem?._operacoes||[]).includes(op.id))return rem;
    const n=aplicarDiff(rem||op.semente,op.diff);n._dono=op.uid;
    n._operacoes=[...(rem?._operacoes||[]),op.id].slice(-256);
    const json=JSON.stringify(n);if(!checaTamanho(k,json).ok)throw Error('Saúde acima do limite de armazenamento');
    tx.set(ref,{v:json,at:firebase.firestore.FieldValue.serverTimestamp(),...camposSeguranca(k,n)});return n;
  });
}
const FILAS_EM_CURSO=new Map();
async function sincronizarFilaSaude(id){
  if(FILAS_EM_CURSO.has(id))return FILAS_EM_CURSO.get(id);
  const tarefa=(async()=>{
    let fila=lerFilaSaude(id);
    while(fila.length){
      if(!S.u||S.u.id!==id)return;
      const op=fila[0];if(op.erro)return;
      try{
        const visao=S.u?.id===id?JSON.stringify(soSaude(S.pro)):null;
        const gravado=await operacaoSaudeServidor(op);
        fila=lerFilaSaude(id).filter(x=>x.id!==op.id);escreverFilaSaude(id,fila);
        if(S.u?.id===id&&!S.laudoAtleta&&visao===JSON.stringify(soSaude(S.pro))){
          const tela=sobreporFilaSaude(soSaude(gravado),id);
          for(const k of CAMPOS_SAUDE)S.pro[k]=tela[k]||[];
          S._sauBase=copiaDados(tela);S._sauOk=true;
        }
      }catch(e){
        if(/Conflito|Proprietário|limite/.test(e.message)||e.code==='permission-denied'){
          fila=lerFilaSaude(id);if(fila[0]){fila[0].erro=e.message;fila[0].tipoErro=e.code||'conflito';}escreverFilaSaude(id,fila);
        }
        return;
      }
    }
  })();
  FILAS_EM_CURSO.set(id,tarefa);try{await tarefa;}finally{FILAS_EM_CURSO.delete(id);marcarSincronia();}
}
function sobreporFilaSaude(base,id){
  let r=copiaDados(base);for(const op of lerFilaSaude(id)){
    try{r=aplicarDiff(r,op.diff);}catch(_){/* conflito fica na fila, nunca sobrescreve o servidor */}
  }return r;
}
async function juntarSaudeSeguro(){
  if(!S.u||!temDadosPessoais()||S.laudoAtleta||S.pro?._espelho)return;
  if(!S.pro)S.pro=proVazio(S.u.id);
  const id=S.u.id,legado=soSaude(S.pro),sau=await DB.get(kSau(id));
  if(!S.u||S.u.id!==id)return;
  if(sau?._dono&&sau._dono!==id)throw Error('Saúde de outra conta recusada');
  const base=soSaude(sau||legado);
  S._sauOk=!!sau;S._sauBase=copiaDados(base);
  const tela=sobreporFilaSaude(base,id);
  for(const k of CAMPOS_SAUDE)S.pro[k]=tela[k]||[];
  // O diff seguinte parte do que este aparelho efetivamente mostrou, inclusive sua fila.
  S._sauBase=copiaDados(tela);
}
async function salvarSaudeSeguro(opcoes){
  if(!donoDaSessao()||!temDadosPessoais())return alerta('Gravação bloqueada','Esta tela não pertence à sua conta.'),false;
  const id=S.u.id,local=soSaude(S.pro);local._dono=id;
  const perdas=opcoes?.apagando?[]:perdasPro(S._sauCenso,local);
  if(perdas.length)return alerta('Gravação bloqueada','Esta gravação apagaria '+esc(perdas.join(', '))+'. Nada foi enviado. Recarregue os dados antes de continuar.'),false;
  const base=S._sauBase||soSaude(S._proCarregado?JSON.parse(S._proCarregado):proVazio(id));base._dono=id;
  const diff=diffDados(base,local);
  if(!diff)return salvarPro(opcoes);
  const op={id:uid(),uid:id,diff,semente:copiaDados(base),em:Date.now()};
  try{const fila=lerFilaSaude(id);if(fila.some(x=>x.erro)){alerta('Resolva o conflito primeiro','Há uma alteração pendente em conflito. Abra Conta › Dados e backup › Pendências de Saúde antes de salvar novamente.');return false;}fila.push(op);escreverFilaSaude(id,fila);}catch(e){alerta('Não foi salvo',esc(e.message)+' Libere espaço ou exporte um backup.');return false;}
  S._sauBase=copiaDados(local);S._sauCenso=censoSaude(local);
  const tarefa=sincronizarFilaSaude(id);
  await Promise.race([tarefa,new Promise(r=>setTimeout(r,ESPERA_SERVIDOR))]);
  const fila=lerFilaSaude(id),pend=fila.find(x=>x.id===op.id);
  if(pend?.erro){alerta('Alterações em conflito',esc(pend.erro)+' Abra Conta › Dados e backup › Pendências de Saúde.');return false;}
  if(pend)toast('Salvo neste aparelho — sincroniza quando a internet voltar');else S._sauOk=true;
  // O snapshot do técnico nunca pode prender a gravação principal offline.
  if(await salvarPro(opcoes)===false)return false;
  return true;
}
function pendenciasSaude(){if(!S.u)return 0;try{return lerFilaSaude(S.u.id).length;}catch(_){return 1;}}
function abrirPendenciasSaude(){
  const fila=lerFilaSaude(S.u.id);
  sheet(`<h2>Pendências de Saúde</h2><p class="small">${fila.length} alteração(ões) guardada(s) neste aparelho. Nada é enviado para outra conta.</p>
    ${fila.map(x=>`<p class="small">${esc(x.erro||'Aguardando conexão')}</p>`).join('')}
    <button class="primary full" onclick="sincronizarFilaSaude(S.u.id).then(abrirPendenciasSaude)">Tentar sincronizar</button>
    <button class="full" style="margin-top:8px" onclick="baixarFilaSaude()">Baixar as alterações pendentes</button>
    ${fila.some(x=>x.erro)?'<button class="danger full" style="margin-top:8px" onclick="descartarFilaSaude()">Descartar pendências e recarregar do servidor…</button>':''}
    <button class="ghost full" style="margin-top:8px" onclick="fecharSheet()">Fechar</button>`);
}
function baixarFilaSaude(){const b=new Blob([JSON.stringify({conta:S.u.email,operacoes:lerFilaSaude(S.u.id)},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='meros-pendencias-saude.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}
async function descartarFilaSaude(){if(!confirm('Primeiro baixe as pendências se quiser guardá-las. Descartar remove somente as alterações não sincronizadas deste aparelho. Continuar?'))return;escreverFilaSaude(S.u.id,[]);await juntarSaudeSeguro();fecharSheet();render();}
async function restaurarVersaoSeguro(slot){
  if(!donoDaSessao())return false;
  if(pendenciasSaude())return alerta('Há alterações pendentes','Sincronize ou resolva as pendências de Saúde antes de restaurar.'),false;
  const id=S.u.id,v=await DB.get(kProBk(id,slot));
  if(!v?.pro||v.pro._dono!==id)return alerta('Não restaurado','A versão não existe ou não comprova o proprietário.'),false;
  const novo=copiaDados(v.pro),anterior=copiaDados(S.pro);
  const undo={_dono:id,em:Date.now(),dia:hoje(),ver:VER,censo:censoPro(anterior),pro:anterior};
  try{
    if(FB){
      // Transação online: Saúde, principal e desfazer confirmam juntos ou nenhum confirma.
      await fdb.runTransaction(async tx=>{
        await tx.get(fdb.collection('kv').doc(fkey(kSau(id))));
        for(const [k,obj] of [[kProBk(id,'undo'),undo],[kSau(id),soSaude(novo)],[kPro(id),semSaude(novo)]]){
          const json=JSON.stringify(obj);if(!checaTamanho(k,json).ok)throw Error('A versão excede o espaço disponível');
          tx.set(fdb.collection('kv').doc(fkey(k)),{v:json,...camposSeguranca(k,obj),at:firebase.firestore.FieldValue.serverTimestamp()});
        }
      });
    }else{
      for(const [k,obj] of [[kProBk(id,'undo'),undo],[kSau(id),soSaude(novo)],[kPro(id),semSaude(novo)]])if(await DB.set(k,obj)===false)throw Error('Falha na restauração local');
    }
    if(S.u?.id!==id)return;
    S.pro=novo;S._sauOk=true;S._sauBase=copiaDados(soSaude(novo));S._proCenso=censoPro(novo);S._proCarregado=JSON.stringify(novo);
    fecharSheet();toast('Versão restaurada e confirmada');render();return true;
  }catch(e){alerta('Não consegui restaurar',esc(e.message)+' A restauração em rede exige conexão.');return false;}
}
async function importarBackupSeguro(inp){
  const f=inp.files?.[0];if(!f||!S.u)return;
  try{
    if(pendenciasSaude())throw Error('Resolva as pendências de Saúde antes de importar');
    const j=JSON.parse(await f.text()),id=S.u.id,email=S.u.email.toLowerCase();
    if(!j.dados||String(j.conta||'').toLowerCase()!==email||(j.uid&&j.uid!==id))throw Error('O backup não pertence à conta conectada');
    if(j.pendenciasSaude?.length&&!j.pendenciasSaude.every(o=>o.uid===id&&o.id&&o.diff))throw Error('Pendências do arquivo inválidas ou de outra conta');
    const pares=Object.entries(j.dados).filter(([k])=>k===kUser(email)||k===kPro(id)||k===kSau(id)||k===kPTrIdx(id)||k.startsWith('pt_'+id+'_'));
    if(!pares.length||pares.length>400)throw Error('Quantidade de documentos inválida');
    for(const [k,v] of pares){
      if(!v||typeof v!=='object'||v._espelho||(k.startsWith('pro_')&&Array.isArray(v))||(v._dono&&v._dono!==id))throw Error('Documento inválido ou de outro proprietário');
      if(k===kUser(email))Object.assign(v,{id,email,perfil:S.u.perfil,aprovado:S.u.aprovado,equipe:S.u.equipe,equipeNome:S.u.equipeNome});
      if(k.startsWith('pro_'))v._dono=id;
      if(!checaTamanho(k,JSON.stringify(v)).ok)throw Error('Um documento do backup excede o limite');
    }
    if(!pares.some(([k])=>k===kSau(id))){
      const legado=pares.find(([k])=>k===kPro(id))?.[1];
      if(legado&&CAMPOS_SAUDE.some(k=>legado[k]?.length))pares.push([kSau(id),soSaude(legado)]);
      else throw Error('Este backup não contém a Saúde. Não vou substituir dados com uma cópia incompleta.');
    }
    if(FB){
      await fdb.collection('kv').doc(fkey(kUser(email))).get({source:'server'});
      const batch=fdb.batch();for(const [k,v] of pares)batch.set(fdb.collection('kv').doc(fkey(k)),{v:JSON.stringify(v),...camposSeguranca(k,v),at:firebase.firestore.FieldValue.serverTimestamp()});
      await batch.commit();
    }else for(const [k,v] of pares)if(await DB.set(k,v)===false)throw Error('Falha ao restaurar o backup');
    if(j.pendenciasSaude?.length){
      escreverFilaSaude(id,j.pendenciasSaude);sincronizarFilaSaude(id);
    }
    await carregarDados();fecharSheet();toast('Backup restaurado · '+pares.length+' documentos próprios');render();
  }catch(e){alerta('Backup não restaurado integralmente',esc(e.message));}
}
async function exportarBackupSeguro(){
  try{
    if(!S.u)throw Error('Entre na sua conta para exportar');
    const u=copiaDados(S.u),dados={},ler=async k=>{
      if(!FB)return DB.get(k);
      const s=await fdb.collection('kv').doc(fkey(k)).get();
      if(!s.exists&&s.metadata.fromCache)throw Error('Não há uma cópia completa no cache. Conecte para confirmar o backup.');
      return s.exists?JSON.parse(s.data().v):null;
    };
    toast('Montando sua cópia…');
    const chaves=[kUser(u.email),kPro(u.id),kSau(u.id),kPTrIdx(u.id)];
    const idx=await ler(kPTrIdx(u.id))||[];
    for(const t of idx)if(t?.id)chaves.push(kPTr(u.id,t.id));
    for(const k of chaves){const v=await ler(k);if(v!=null)dados[k]=v;}
    if(!dados[kUser(u.email)])throw Error('Não consegui confirmar seu cadastro. Nenhum arquivo vazio foi gerado.');
    if(!dados[kSau(u.id)])dados[kSau(u.id)]=soSaude(dados[kPro(u.id)]||proVazio(u.id));
    if(!dados[kPro(u.id)])dados[kPro(u.id)]=semSaude(proVazio(u.id));
    const pacote={app:APP_NOME,versao:VER,em:new Date().toISOString(),conta:u.email,uid:u.id,
      censo:censoPro(S.pro),pendenciasSaude:lerFilaSaude(u.id),dados};
    const url=URL.createObjectURL(new Blob([JSON.stringify(pacote,null,1)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='meros360-backup-'+hoje()+'.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),4000);toast('Backup pessoal gerado, com Saúde e pendências');return pacote;
  }catch(e){alerta('Backup não gerado',esc(e.message));return false;}
}
