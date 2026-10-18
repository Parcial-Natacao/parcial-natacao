/* Somente emuladores. Não usa credenciais ou contas reais. Executar pelo roteiro
   de QA; MEROS_PLAYWRIGHT aponta para a instalação local de Playwright. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {chromium}=require(process.env.MEROS_PLAYWRIGHT||'playwright');
const {initializeTestEnvironment}=require('../firebase/node_modules/@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,collection,getDocs,query,where}=require('../firebase/node_modules/firebase/firestore');
const root=path.resolve(__dirname,'..'),project='demo-meros-v174',out=process.env.MEROS_QA_OUT||path.join(require('node:os').tmpdir(),'meros-v174-qa');
fs.mkdirSync(out,{recursive:true});
const results=[];
async function test(name,fn){let timer;try{const detail=await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Cenário excedeu 45 segundos')),45000);})]);results.push({name,pass:true,detail});console.log('PASS '+name+(detail?' '+JSON.stringify(detail):''));}catch(e){results.push({name,pass:false,error:e.message});console.log('FAIL '+name+' '+e.message);}finally{clearTimeout(timer);fs.writeFileSync(path.join(out,'partial-results.json'),JSON.stringify(results,null,2));}}
async function auth(email){
  const url='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/';
  const post=async(method,body)=>{const r=await fetch(url+method+'?key=qa',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(JSON.stringify(data));return data;};
  const a=await post('accounts:signUp',{email,password:'SomenteQA2026!',returnSecureToken:true});
  await post('accounts:sendOobCode',{requestType:'VERIFY_EMAIL',idToken:a.idToken});
  const codes=await(await fetch('http://127.0.0.1:9099/emulator/v1/projects/'+project+'/oobCodes')).json();
  const code=codes.oobCodes.findLast(x=>x.email===email&&x.requestType==='VERIFY_EMAIL');
  await post('accounts:update',{oobCode:code.oobCode});return {...a,email};
}
(async()=>{
  const env=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port:8089,rules:fs.readFileSync(path.join(root,'firebase/firestore.rules.v2'),'utf8')}});
  await env.clearFirestore();
  const users={};for(const [k,email] of Object.entries({athlete:'qa-atleta@example.test',solo:'qa-solo@example.test',pro:'qa-pro@example.test',coach:'qa-tecnico@example.test',admin:'barbato.bruno@gmail.com'}))users[k]=await auth(email);
  await env.withSecurityRulesDisabled(async ctx=>{for(const [k,u] of Object.entries(users)){const v={id:u.localId,email:u.email,nome:'Pessoa QA '+k,perfil:['athlete','solo'].includes(k)?'atleta':k==='coach'?'tecnico':'pro',esporte:'Natação',ativo:true,aprovado:false,equipe:null,afiliacao:null,nascimento:'1990-01-01',telefone:'67999990000',confirmacaoEmail:{status:'confirmado'}};await setDoc(doc(ctx.firestore(),'kv','u_'+u.email),{v:JSON.stringify(v),dono:u.localId,donoEmail:null,equipe:null,perfil:v.perfil,aprovado:false,categoria:null});}});
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace("connect-src 'self'","connect-src http://127.0.0.1:8089 http://127.0.0.1:9099 'self'").replace("projectId:'parcial-cdb0e'","projectId:'"+project+"'").replace('firebase.initializeApp(FB_CONFIG);',"firebase.initializeApp(FB_CONFIG); firebase.auth().useEmulator('http://127.0.0.1:9099',{disableWarnings:true}); firebase.firestore().useEmulator('127.0.0.1',8089);");
  assert.ok(html.includes("projectId:'"+project+"'"),'Must replace production project ID');
  const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname;if(p==='/'||p==='/index.html'){res.setHeader('content-type','text/html');res.end(html);return;}const f=path.join(root,p);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);res.end();return;}if(f.endsWith('.js'))res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(f));});
  await new Promise(r=>server.listen(8018,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const pages={},contexts=[],pageErrors=[];
  async function capture(page,file,modal=false){
    await page.waitForFunction(open=>{const s=document.getElementById('sheet');return !s||Number(getComputedStyle(s).opacity)===(open?1:0);},modal);
    await page.waitForFunction(()=>{const t=document.getElementById('toast');return !t||Number(getComputedStyle(t).opacity)===0;});
    await page.screenshot({path:path.join(out,file),fullPage:true});
  }
  async function open(k){const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});contexts.push(ctx);const p=await ctx.newPage();p.on('pageerror',e=>pageErrors.push({user:k,message:e.message}));p.on('dialog',d=>d.accept());await p.goto('http://127.0.0.1:8018/?qa=v174',{waitUntil:'domcontentloaded'});await p.getByRole('button',{name:'Já tenho conta',exact:true}).click();await p.locator('#lgEmail').fill(users[k].email);await p.locator('#lgSenha').fill('SomenteQA2026!');await p.getByRole('button',{name:'Entrar',exact:true}).click();await p.waitForFunction(()=>!!S.u&&S.vista==='app');await p.waitForFunction(()=>S.grupos!==null&&S.grupos!==undefined);pages[k]=p;return p;}
  for(const [perfil,texto] of [['atleta','Para quem nada por saúde'],['pro','Para quem compete'],['tecnico','Comanda a equipe']])await test('cadastro real '+perfil+' sem equipe e confirmação no emulador',async()=>{
    const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});contexts.push(ctx);const q=await ctx.newPage();q.on('pageerror',e=>pageErrors.push({user:'cadastro-'+perfil,message:e.message}));
    await q.goto('http://127.0.0.1:8018/');await q.locator('button.perfil').filter({hasText:texto}).click();await q.getByRole('button',{name:'Criar conta',exact:true}).click();
    await q.getByRole('button',{name:'Ainda não tenho equipe',exact:true}).click();await q.getByRole('button',{name:'Continuar',exact:true}).click();
    const email='cadastro-'+perfil+'@example.test';await q.locator('#cdNome').fill('Cadastro Fictício');await q.locator('#cdEmail').fill(email);await q.locator('#cdNasc').fill('1990-01-01');await q.locator('#cdTel').fill('67999990000');await q.getByRole('button',{name:'Continuar',exact:true}).click();
    await q.locator('#cdSenha').fill('SomenteQA2026!');await q.locator('#cdSenha2').fill('SomenteQA2026!');await q.locator('#cdAceite').check();await q.getByRole('button',{name:'Criar conta',exact:true}).click();await q.waitForFunction(()=>S.vista==='verificar'&&!CAD_ENVIANDO);
    const codes=await(await fetch('http://127.0.0.1:9099/emulator/v1/projects/'+project+'/oobCodes')).json();const code=codes.oobCodes.findLast(x=>x.email===email&&x.requestType==='VERIFY_EMAIL');assert.ok(code,'Código de confirmação ausente');
    const verified=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=qa',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({oobCode:code.oobCode})});assert.ok(verified.ok);
    await q.getByRole('button',{name:'Já confirmei',exact:true}).click();await q.waitForFunction(()=>!!S.u&&S.vista==='app');await q.getByRole('button',{name:/^Natação/}).click();
    await q.evaluate(()=>carregarGrupos());
    assert.deepEqual(await q.evaluate(()=>({perfil:S.u.perfil,equipe:S.u.equipe,aprovado:S.u.aprovado})),{perfil,equipe:null,aprovado:false});
    if(perfil==='tecnico')await q.getByRole('heading',{name:'Meus grupos de treinos',exact:true}).waitFor();else await q.getByRole('button',{name:'+ Piscina',exact:true}).waitFor();
  });
  const p=await open('athlete');
  await test('sem equipe: primeiro acesso orientado e piscina acessível',async()=>{await p.getByRole('heading',{name:'Como você quer começar?'}).waitFor();await p.getByRole('button',{name:'Adicionar meu treino',exact:true}).waitFor();await p.getByRole('button',{name:'Gerar um treino',exact:true}).waitFor();});
  await capture(p,'mobile-inicio.png');
  await test('console sem erro no carregamento',()=>assert.equal(pageErrors.length,0,JSON.stringify(pageErrors)));
  await test('gerador não finge revisão profissional',async()=>{await p.getByRole('button',{name:'Gerar um treino',exact:true}).click();await p.getByRole('heading',{name:'Gerador em revisão',exact:true}).waitFor();await p.evaluate(()=>fecharSheet());});
  await test('Atleta comum adiciona treino de piscina sem técnico',async()=>{await p.getByRole('button',{name:'Adicionar meu treino',exact:true}).click();await p.locator('#ntTexto').fill('Aquecimento\n4x25 livre\nPrincipal\n4x50 livre');await p.evaluate(()=>salvarTreino());await p.waitForFunction(()=>S.sub==='detalhe'&&S.treino?._pessoal);assert.equal(await p.evaluate(()=>treinoFeito(S.treino,S.u.id)),false);});
  await test('treino pessoal do Atleta persiste após recarga',async()=>{await p.reload();await p.waitForFunction(()=>!!S.u&&S.tridx.length>0);assert.equal(await p.evaluate(()=>S.tridx[0]._pessoal),true);});
  await test('criar grupo não promove conta nem representa clube',async()=>{await p.evaluate(()=>abrirMeusGrupos());await p.getByRole('button',{name:'Criar um grupo privado',exact:true}).click();await p.locator('#grNome').fill('Grupo privado QA');await p.getByRole('button',{name:'Criar grupo',exact:true}).click();await p.waitForFunction(()=>S.grupos?.length===1);assert.equal(await p.evaluate(()=>S.u.perfil),'atleta');assert.equal(await p.evaluate(()=>S.grupos[0].verificacao),'nao_verificado');});
  const gid=await p.evaluate(()=>S.grupos[0].id);
  const ad=await open('admin');
  await test('Bruno acessa grupo de outra pessoa sem tomar propriedade',async()=>{await ad.evaluate(()=>abrirMeusGrupos());await ad.evaluate(id=>abrirGrupo(id),gid);await ad.getByRole('button',{name:'Convidar atleta ou técnico',exact:true}).waitFor();assert.notEqual(await ad.evaluate(()=>S.grDetalhe.g.ownerUid),users.admin.localId);});
  await test('responsável vê gestão mas não publicação de técnico',async()=>{await p.evaluate(id=>abrirGrupo(id),gid);await p.getByRole('button',{name:'Convidar atleta ou técnico',exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Enviar treino para o grupo',exact:true}).count(),0);});
  await capture(p,'mobile-grupo.png');
  let token;
  await test('convite individual de técnico é criado',async()=>{await p.getByRole('button',{name:'Convidar atleta ou técnico',exact:true}).click();await p.locator('#giEmail').fill(users.coach.email);await p.locator('#giRole').selectOption('tecnico');await p.getByRole('button',{name:'Criar convite individual',exact:true}).click();await p.locator('#giLink').waitFor();token=(await p.locator('#giLink').inputValue()).split('convite=')[1];assert.match(token,/^[a-f0-9]{64}$/);});
  const c=await open('coach');
  await test('técnico sem equipe entra e aceita convite sem herdar gestão',async()=>{await c.evaluate(t=>verConviteGrupo(t),token);await c.getByRole('button',{name:'Aceitar convite',exact:true}).click();await c.waitForFunction(()=>!S.grBusy&&S.grupos?.some(g=>g.meuPapel==='tecnico'));assert.equal(await c.evaluate(()=>S.grupos[0].possoTreinar),false);});
  await test('CREF digitado permanece pendente',async()=>{await c.evaluate(()=>abrirCredencial());await c.locator('#crCref').fill('12345-G');await c.locator('#crUf').fill('MS');await c.getByRole('button',{name:'Enviar para conferência',exact:true}).click();await c.waitForFunction(()=>!S.grBusy);assert.equal((await getDoc(doc(env.authenticatedContext(users.coach.localId,{email:users.coach.email,email_verified:true}).firestore(),'professionals',users.coach.localId))).data().status,'pendente');});
  // Aprovação fictícia somente no emulador. Não é uma revisão profissional real.
  await env.withSecurityRulesDisabled(async ctx=>{await setDoc(doc(ctx.firestore(),'professionals',users.coach.localId),{uid:users.coach.localId,nome:'Profissional fictício QA',cref:'QA-12345',uf:'MS',email:users.coach.email,status:'aprovado',fonte:'https://example.test/qa',verificadoPor:users.admin.localId,verificadoEm:Date.now()});await setDoc(doc(ctx.firestore(),'app_config','generator'),{status:'aprovado',versao:'g1',profissionalUid:users.coach.localId,profissionalNome:'Profissional fictício QA',cref:'QA-12345',aprovadoPor:users.admin.localId,aprovadoEm:Date.now()});});
  await test('técnico habilitado pode publicar no grupo',async()=>{await c.evaluate(()=>carregarGrupos());await c.evaluate(id=>abrirGrupo(id),gid);await c.getByRole('button',{name:'Enviar treino para o grupo',exact:true}).click();await c.locator('#gpTitulo').fill('Sessão QA recebida');await c.locator('#gpTexto').fill('Aquecimento\n4x25 livre\nPrincipal\n4x50 livre');await c.getByRole('button',{name:'Publicar no grupo',exact:true}).click();await c.waitForFunction(()=>S.grDetalhe?.treinos.length===1&&!S.grBusy);});
  await test('atleta recebe uma cópia privada sem marcar feito',async()=>{await p.evaluate(()=>fecharSheet());await p.evaluate(id=>abrirGrupo(id),gid);await p.getByRole('button',{name:'Adicionar aos meus treinos',exact:true}).click();await p.waitForFunction(()=>S.treino?.origem?.tipo==='grupo');assert.equal(await p.evaluate(()=>treinoFeito(S.treino,S.u.id)),false);});
  await test('compartilhamento explícito não leva saúde',async()=>{await p.evaluate(()=>compartilharTreinoGrupo());const d=env.authenticatedContext(users.athlete.localId,{email:users.athlete.email,email_verified:true}).firestore();const rs=await getDocs(query(collection(d,'group_records'),where('uid','==',users.athlete.localId)));assert.equal(rs.size,1);assert.equal(rs.docs[0].data().garmin,undefined);assert.equal(rs.docs[0].data().exames,undefined);});
  const pro=await open('pro');
  await test('PRO independente mantém piscina e não ganha geração',async()=>{await pro.getByRole('button',{name:'+ Piscina',exact:true}).waitFor();assert.equal(await pro.getByRole('button',{name:'Gerar um treino',exact:true}).count(),0);});
  const solo=await open('solo');
  await test('gerador liberado valida respostas e mantém sessão como plano',async()=>{await solo.evaluate(()=>abrirGerador());await solo.locator('#gnContinuo').fill('100');await solo.locator('#gnSeguro').check();await solo.getByRole('button',{name:'Ver treino antes de adicionar',exact:true}).click();await solo.getByRole('heading',{name:'Confira seu treino',exact:true}).waitFor();await capture(solo,'mobile-gerador.png',true);await solo.getByRole('button',{name:'Adicionar ao meu calendário',exact:true}).click();await solo.waitForFunction(()=>S.treino?.origem?.tipo==='gerador');assert.equal(await solo.evaluate(()=>treinoFeito(S.treino,S.u.id)),false);});
  await test('Saúde: gravação confirmada, backup inclui partição e restauração persiste',async()=>{
    const r=await pro.evaluate(async()=>{await juntarSaude();S.pro.garmin=[{data:hoje(),hrv:50}];if(await salvarSaude()===false)throw Error('Saúde recusada');await sincronizarFilaSaude(S.u.id);const bk=await exportarBackup();if(!bk.dados[kSau(S.u.id)])throw Error('Sem Saúde');await DB.set(kProBk(S.u.id,1),{_dono:S.u.id,pro:{...proVazio(S.u.id),garmin:[{data:hoje(),hrv:40}]},dia:hoje()});const ok=await restaurarVersao(1);await juntarSaude();return{ok,hrv:S.pro.garmin[0].hrv};});assert.deepEqual(r,{ok:true,hrv:40});
  });
  const second=await open('pro');
  await test('dois aparelhos: edição de outro campo não regride VFC',async()=>{
    await pro.evaluate(async()=>{await juntarSaude();S.pro.garmin[0].hrv=60;await salvarSaude();await sincronizarFilaSaude(S.u.id);});
    await second.evaluate(async()=>{S.pro.exames.push({id:'qa-e1',data:hoje(),vals:{}});await salvarSaude();await sincronizarFilaSaude(S.u.id);await juntarSaude();});
    assert.equal(await second.evaluate(()=>S.pro.garmin[0].hrv),60);
  });
  await test('dois aparelhos: exclusão não ressuscita nem apaga inclusão independente',async()=>{
    await pro.evaluate(async()=>{await juntarSaude();S.pro.exames.push({id:'qa-e2',data:hoje(),vals:{}});await salvarSaude();await sincronizarFilaSaude(S.u.id);});
    await second.evaluate(()=>juntarSaude());
    await pro.evaluate(async()=>{S.pro.exames=S.pro.exames.filter(e=>e.id!=='qa-e2');await salvarSaude({apagando:true});await sincronizarFilaSaude(S.u.id);});
    await second.evaluate(async()=>{S.pro.exames.push({id:'qa-e3',data:hoje(),vals:{}});await salvarSaude();await sincronizarFilaSaude(S.u.id);});
    await pro.evaluate(async()=>{S.pro.exames=S.pro.exames.filter(e=>e.id!=='qa-e1');await salvarSaude({apagando:true});await sincronizarFilaSaude(S.u.id);await juntarSaude();});
    assert.deepEqual(await pro.evaluate(()=>S.pro.exames.map(e=>e.id)),['qa-e3']);
  });
  await test('backup próprio pode ser importado duas vezes sem duplicação',async()=>{
    const r=await pro.evaluate(async()=>{const bk=await exportarBackup();const inp={files:[{text:async()=>JSON.stringify(bk)}]};await importarBackup(inp);await importarBackup(inp);return S.pro.exames.map(e=>e.id);});
    assert.deepEqual(r,['qa-e3']);
  });
  await test('backup de outra conta não altera a Saúde',async()=>{
    const r=await pro.evaluate(async()=>{const bk=await exportarBackup();bk.uid='OUTRA-CONTA';bk.dados[kSau(S.u.id)].garmin[0].hrv=999;await importarBackup({files:[{text:async()=>JSON.stringify(bk)}]});await juntarSaude();const hrv=S.pro.garmin[0].hrv;fecharSheet();return hrv;});assert.equal(r,60);
  });
  await test('Saúde offline retorna e pendência sobrevive à recarga',async()=>{
    // disableNetwork() do SDK não interrompe necessariamente o RPC das transações.
    // Aqui cortamos a rede real do navegador, não apenas o listener do Firestore.
    try{
      await pro.context().setOffline(true);
      const r=await pro.evaluate(async()=>{S.pro.garmin[0].peso=80;const ini=Date.now();const ok=await salvarSaude();return{ok,ms:Date.now()-ini,n:pendenciasSaude()};});
      assert.equal(r.ok,true);assert.ok(r.ms<9000,JSON.stringify(r));assert.ok(r.n>0,JSON.stringify(r));
      await pro.addInitScript(()=>{window.__qaFilaInicial=Object.keys(localStorage).filter(k=>k.startsWith('parcial_saude_ops_')).map(k=>JSON.parse(localStorage.getItem(k))).flat().length;});
      await pro.context().setOffline(false);await pro.reload();
      assert.ok(await pro.evaluate(()=>window.__qaFilaInicial)>0,'Fila durável ausente antes da inicialização');
      await pro.waitForFunction(()=>!!S.u&&S.pro?.garmin?.length);
      await pro.evaluate(()=>sincronizarFilaSaude(S.u.id));
      assert.equal(await pro.evaluate(()=>pendenciasSaude()),0);
      await pro.evaluate(()=>juntarSaude());assert.equal(await pro.evaluate(()=>S.pro.garmin[0].peso),80);
      return r;
    }finally{await pro.context().setOffline(false);}
  });
  await test('suíte completa em navegador',async()=>{const r=await pro.evaluate(async()=>{S.escrevendo=true;try{const rs=await rodarTestes();return{total:rs.length,falhas:rs.filter(x=>x.falhas.length).map(x=>({grupo:x.grupo,nome:x.nome,falhas:x.falhas}))};}finally{S.escrevendo=false;}});assert.equal(r.falhas.length,0,JSON.stringify(r));return{total:r.total};});
  await p.setViewportSize({width:1280,height:900});await p.evaluate(()=>{fecharSheet();S.aba='treinos';S.sub=null;S.treino=null;render();});await capture(p,'desktop-treinos.png');
  await test('sem overflow horizontal em desktop',async()=>assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)));
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,pageErrors},null,2));
  console.log('RESULT '+results.filter(x=>x.pass).length+'/'+results.length+'; '+out);
  await browser.close();await new Promise(r=>server.close(r));await env.cleanup();if(results.some(x=>!x.pass))process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>setTimeout(()=>process.exit(process.exitCode||0),500));
