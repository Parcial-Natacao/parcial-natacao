import {readFileSync} from 'node:fs';
import {beforeAll,beforeEach,afterAll,test,expect} from 'vitest';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,deleteDoc,writeBatch,collection,query,where,getDocs} from 'firebase/firestore';
let env;
const gid='a'.repeat(32),gid2='b'.repeat(32),iid='c'.repeat(64),wid='d'.repeat(32);
const group=ownerUid=>({nome:'Grupo QA',ownerUid,verificacao:'nao_verificado',arquivado:false,criadoEm:Date.now(),transferUid:null,transferExp:0});
const member=(uid,role='atleta',g=gid)=>({groupId:g,uid,email:uid.toLowerCase()+'@example.test',nome:'Pessoa '+uid,role,ativo:true,criadoEm:Date.now(),inviteId:null});
const invite=(email='athlete@example.test',role='atleta')=>({groupId:gid,email,role,status:'aberto',expiraEm:Date.now()+3600000,criadoPor:'OWNER',criadoEm:Date.now(),aceitoPor:null});
const workout=()=>({groupId:gid,titulo:'Treino QA',texto:'4x25 livre',data:'2026-10-18',piscina:'SC25',autor:'Técnico QA',publishedBy:'COACH',status:'publicado',criadoEm:Date.now()});
const professional=(uid,status='aprovado')=>({uid,nome:'Profissional QA',cref:'12345-G',uf:'MS',email:uid.toLowerCase()+'@example.test',status,fonte:'https://www.confef.org.br/registrados/',verificadoPor:'ADMIN',verificadoEm:Date.now()});
const db=(u,email=u.toLowerCase()+'@example.test',verified=true)=>env.authenticatedContext(u,{email,email_verified:verified}).firestore();
const ref=(d,c,id)=>doc(d,c,id);
const admin=()=>db('ADMIN','barbato.bruno@gmail.com');
async function seed(c,id,v){await env.withSecurityRulesDisabled(ctx=>setDoc(ref(ctx.firestore(),c,id),v));}
beforeAll(async()=>{env=await initializeTestEnvironment({projectId:'parcial-grupos-test',firestore:{rules:readFileSync(new URL('./firestore.rules.v2',import.meta.url),'utf8')}});});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{const d=ctx.firestore();const b=writeBatch(d);for(const [c,id,v] of [
  ['groups',gid,group('OWNER')],['groups',gid2,group('OTHER')],
  ['group_members',gid+'_OWNER',member('OWNER')],['group_members',gid+'_COACH',member('COACH','tecnico')],['group_members',gid+'_PENDING',member('PENDING','tecnico')],['group_members',gid+'_ATHLETE',member('ATHLETE')],
  ['professionals','COACH',professional('COACH')],['professionals','PENDING',professional('PENDING','pendente')],
  ['group_invites',iid,invite()],['group_workouts',wid,workout()],
  ['kv','pro_ATHLETE_sau',{dono:'ATHLETE',v:'{"_dono":"ATHLETE","exames":[{"id":"e1"}]}'}]
])b.set(ref(d,c,id),v);await b.commit();});});
afterAll(async()=>{await env.cleanup();});
test('grupo novo exige e-mail confirmado',async()=>{await assertFails(setDoc(ref(db('NEW',undefined,false),'groups','e'.repeat(32)),group('NEW')));});
test('criador administra somente seu próprio grupo independente',async()=>{const d=db('NEW'),g='e'.repeat(32),b=writeBatch(d);b.set(ref(d,'groups',g),group('NEW'));b.set(ref(d,'group_members',g+'_NEW'),member('NEW','atleta',g));await assertSucceeds(b.commit());});
test('não cria grupo com dono alheio nem selo institucional',async()=>{await assertFails(setDoc(ref(db('NEW'),'groups','e'.repeat(32)),group('OWNER')));await assertFails(setDoc(ref(db('NEW'),'groups','e'.repeat(32)),{...group('NEW'),verificacao:'verificado'}));});
test('lista somente grupos em que é responsável',async()=>{await assertSucceeds(getDocs(query(collection(db('OWNER'),'groups'),where('ownerUid','==','OWNER'))));});
test('administrador lista e gerencia qualquer grupo sem tomar sua propriedade',async()=>{const d=admin();await assertSucceeds(getDocs(collection(d,'groups')));await assertSucceeds(updateDoc(ref(d,'groups',gid),{nome:'Conferido pelo administrador'}));await assertSucceeds(setDoc(ref(d,'group_invites','e'.repeat(64)),{...invite('new@example.test'),criadoPor:'ADMIN'}));expect((await getDoc(ref(d,'groups',gid))).data().ownerUid).toBe('OWNER');});
test('membro consulta suas participações',async()=>{await assertSucceeds(getDocs(query(collection(db('ATHLETE'),'group_members'),where('uid','==','ATHLETE'),where('ativo','==',true))));});
test('responsável não toma outro grupo',async()=>{await assertFails(updateDoc(ref(db('OWNER'),'groups',gid2),{ownerUid:'OWNER'}));});
test('nome público não concede gestão de equipe legada',async()=>{await assertFails(setDoc(ref(db('OWNER'),'kv','eq_grupoqa'),{v:'{}',donoEmail:'owner@example.test',equipe:'grupoqa'}));});
test('responsável sem habilitação não publica treino',async()=>{await assertFails(setDoc(ref(db('OWNER'),'group_workouts','x'),{...workout(),publishedBy:'OWNER'}));});
test('técnico convidado pendente não publica',async()=>{await assertFails(setDoc(ref(db('PENDING'),'group_workouts','x'),{...workout(),publishedBy:'PENDING'}));});
test('técnico verificado e autorizado publica no seu grupo',async()=>{await assertSucceeds(setDoc(ref(db('COACH'),'group_workouts','e'.repeat(32)),workout()));});
test('identificador arbitrário de publicação é recusado',async()=>{await assertFails(setDoc(ref(db('COACH'),'group_workouts',"x');alert(1)"),workout()));});
test('técnico não publica no grupo alheio',async()=>{await assertFails(setDoc(ref(db('COACH'),'group_workouts','x'),{...workout(),groupId:gid2}));});
test('membro não altera prescrição',async()=>{await assertFails(updateDoc(ref(db('ATHLETE'),'group_workouts',wid),{texto:'mudou'}));});
test('responsável e técnico não ganham leitura de Saúde',async()=>{for(const u of ['OWNER','COACH'])await assertFails(getDoc(ref(db(u),'kv','pro_ATHLETE_sau')));});
test('atleta não promove a si mesmo a técnico',async()=>{await assertFails(updateDoc(ref(db('ATHLETE'),'group_members',gid+'_ATHLETE'),{role:'tecnico'}));});
test('responsável cria convite com destinatário e validade',async()=>{await assertSucceeds(setDoc(ref(db('OWNER'),'group_invites','e'.repeat(64)),invite('new@example.test','tecnico')));});
test('outra pessoa não lê convite alheio',async()=>{await assertFails(getDoc(ref(db('OTHER'),'group_invites',iid)));});
async function accept(d,id=iid){const b=writeBatch(d);b.set(ref(d,'group_members',gid+'_ATHLETE'),{...member('ATHLETE'),inviteId:id});b.update(ref(d,'group_invites',id),{status:'aceito',aceitoPor:'ATHLETE'});return b.commit();}
test('aceite vincula membro e consome convite atomicamente',async()=>{await assertSucceeds(accept(db('ATHLETE')));expect((await getDoc(ref(db('ATHLETE'),'group_invites',iid))).data().status).toBe('aceito');});
test('não aceita convite usando e-mail diferente',async()=>{await assertFails(accept(db('OTHER')));});
test('convite vencido não libera acesso',async()=>{await seed('group_invites',iid,{...invite(),expiraEm:Date.now()-10000});await assertFails(accept(db('ATHLETE')));});
test('convite revogado não libera acesso',async()=>{await seed('group_invites',iid,{...invite(),status:'revogado'});await assertFails(accept(db('ATHLETE')));});
test('convite não pode ser reutilizado',async()=>{await accept(db('ATHLETE'));await assertFails(accept(db('ATHLETE')));});
test('aceitar convite não pode trocar o papel definido',async()=>{const d=db('ATHLETE'),b=writeBatch(d);b.set(ref(d,'group_members',gid+'_ATHLETE'),{...member('ATHLETE','tecnico'),inviteId:iid});b.update(ref(d,'group_invites',iid),{status:'aceito',aceitoPor:'ATHLETE'});await assertFails(b.commit());});
test('transferência só muda o dono depois do aceite do destinatário',async()=>{await assertSucceeds(updateDoc(ref(db('OWNER'),'groups',gid),{transferUid:'ATHLETE',transferExp:Date.now()+3600000}));await assertFails(updateDoc(ref(db('COACH'),'groups',gid),{ownerUid:'COACH',transferUid:null,transferExp:0}));await assertSucceeds(updateDoc(ref(db('ATHLETE'),'groups',gid),{ownerUid:'ATHLETE',transferUid:null,transferExp:0}));await assertFails(updateDoc(ref(db('OWNER'),'groups',gid),{nome:'Não manda mais'}));});
test('remover técnico revoga publicação imediatamente',async()=>{await updateDoc(ref(db('OWNER'),'group_members',gid+'_COACH'),{ativo:false});await assertFails(setDoc(ref(db('COACH'),'group_workouts','x'),workout()));});
test('CREF informado não permite autoaprovação',async()=>{await assertFails(updateDoc(ref(db('PENDING'),'professionals','PENDING'),{status:'aprovado'}));});
test('somente admin registra verificação de profissional',async()=>{await assertSucceeds(updateDoc(ref(admin(),'professionals','PENDING'),{status:'aprovado',verificadoPor:'ADMIN',verificadoEm:Date.now()}));});
test('atleta compartilha só o próprio acompanhamento; responsável sem papel técnico não lê',async()=>{const r={groupId:gid,workoutId:wid,uid:'ATHLETE',nome:'Atleta QA',titulo:'Treino',data:'2026-10-18',feito:true,dur:30,rpe:4,tempos:{},atualizado:Date.now()},id=wid+'_ATHLETE';await assertSucceeds(setDoc(ref(db('ATHLETE'),'group_records',id),r));await assertSucceeds(getDoc(ref(db('COACH'),'group_records',id)));await assertFails(getDoc(ref(db('OWNER'),'group_records',id)));await assertFails(setDoc(ref(db('OTHER'),'group_records',id),r));await assertSucceeds(deleteDoc(ref(db('ATHLETE'),'group_records',id)));});
test('documento de acompanhamento recusa exames e VFC no nível superior',async()=>{const r={groupId:gid,workoutId:wid,uid:'ATHLETE',nome:'QA',titulo:'Treino',data:'2026-10-18',feito:false,dur:null,rpe:null,tempos:{},atualizado:Date.now(),exames:[]};await assertFails(setDoc(ref(db('ATHLETE'),'group_records',wid+'_ATHLETE'),r));});
test('gerador exige revisão e não pode ser liberado pelo atleta',async()=>{const cfg={status:'aprovado',versao:'g1',profissionalUid:'COACH',profissionalNome:'QA',cref:'12345-G',aprovadoPor:'ATHLETE',aprovadoEm:Date.now()};await assertFails(setDoc(ref(db('ATHLETE'),'app_config','generator'),cfg));await assertSucceeds(setDoc(ref(admin(),'app_config','generator'),{...cfg,aprovadoPor:'ADMIN'}));});
test('treino gerado não nasce antes da liberação da versão',async()=>{const t={v:'{}',dono:'ATHLETE',geradorVersao:'g1'};await assertFails(setDoc(ref(db('ATHLETE'),'kv','pt_ATHLETE_gerado'),t));await seed('app_config','generator',{status:'aprovado',versao:'g1',profissionalUid:'COACH'});await assertSucceeds(setDoc(ref(db('ATHLETE'),'kv','pt_ATHLETE_gerado'),t));});
test('dono pode ler ausência antes de criar Saúde e índice atomicamente',async()=>{await assertSucceeds(getDoc(ref(db('NEW'),'kv','pro_NEW_sau')));await assertSucceeds(getDoc(ref(db('NEW'),'kv','pt_NEW_idx')));await assertFails(getDoc(ref(db('OTHER'),'kv','pro_NEW_sau')));await assertFails(getDoc(ref(db('OTHER'),'kv','pt_NEW_idx')));});
