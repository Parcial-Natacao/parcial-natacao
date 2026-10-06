import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'parcial-regras-test';
const ADMIN_EMAIL = 'barbato.bruno@gmail.com';
let env;

const perfil = ({ uid, email, equipe, tipo = 'atleta', aprovado = true }) => ({
  v: JSON.stringify({ id: uid, email, equipe, perfil: tipo, aprovado }),
  dono: uid,
  donoEmail: null,
  equipe,
  perfil: tipo,
  aprovado,
});

const dadosBase = {
  'u_atleta@x.com': perfil({ uid: 'UID_ATLETA', email: 'atleta@x.com', equipe: 'a3' }),
  'u_pendente@x.com': perfil({ uid: 'UID_PENDENTE', email: 'pendente@x.com', equipe: 'a3', aprovado: false }),
  'u_tecnico@x.com': perfil({ uid: 'UID_TECNICO', email: 'tecnico@x.com', equipe: 'a3', tipo: 'tecnico' }),
  'u_outro@x.com': perfil({ uid: 'UID_OUTRO', email: 'outro@x.com', equipe: 'b' }),
  'u_barbato.bruno@gmail.com': perfil({ uid: 'UID_ADMIN', email: ADMIN_EMAIL, equipe: 'admin', tipo: 'pro' }),
  'eq_a3': { v: '{}', donoEmail: 'tecnico@x.com', equipe: 'a3' },
  'eq_b': { v: '{}', donoEmail: 'outro@x.com', equipe: 'b' },
  'eq_a3_users': { v: '[]', donoEmail: 'tecnico@x.com', equipe: 'a3' },
  'eq_a3_tridx': { v: '[]', donoEmail: 'tecnico@x.com', equipe: 'a3' },
  'eq_b_tridx': { v: '[]', donoEmail: 'outro@x.com', equipe: 'b' },
  'eq_a3_tr_t1': { v: '{}', donoEmail: 'tecnico@x.com', equipe: 'a3' },
  'eq_a3_perf_UID_ATLETA': { v: '{}', donoEmail: 'atleta@x.com', equipe: 'a3' },
  'eq_a3_perf_UID_OUTRO': { v: '{}', donoEmail: 'outro@x.com', equipe: 'a3' },
  'pro_UID_ATLETA': { v: '{}', dono: 'UID_ATLETA', donoEmail: 'atleta@x.com' },
  'pro_UID_OUTRO': { v: '{}', dono: 'UID_OUTRO', donoEmail: 'outro@x.com' },
};

const banco = (uid, email) => env.authenticatedContext(uid, { email }).firestore();
const kv = (db, chave) => doc(db, 'kv', chave);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(new URL('./firestore.rules.v2', import.meta.url), 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await Promise.all(Object.entries(dadosBase).map(([chave, valor]) => setDoc(kv(db, chave), valor)));
  });
});

afterAll(async () => env.cleanup());

describe('regras do PARCIAL', () => {
  test('1. atleta comum não lê dados PRO de outro atleta', async () => {
    await assertFails(getDoc(kv(banco('UID_ATLETA', 'atleta@x.com'), 'pro_UID_OUTRO')));
  });

  test('2. atleta lê os próprios dados PRO', async () => {
    await assertSucceeds(getDoc(kv(banco('UID_ATLETA', 'atleta@x.com'), 'pro_UID_ATLETA')));
  });

  test('3. pendente não lê documentos internos da equipe', async () => {
    await assertFails(getDoc(kv(banco('UID_PENDENTE', 'pendente@x.com'), 'eq_a3_tridx')));
  });

  test('4. membro aprovado lê documentos da própria equipe', async () => {
    await assertSucceeds(getDoc(kv(banco('UID_ATLETA', 'atleta@x.com'), 'eq_a3_tridx')));
  });

  test('5. membro não lê documentos de outra equipe', async () => {
    await assertFails(getDoc(kv(banco('UID_ATLETA', 'atleta@x.com'), 'eq_b_tridx')));
  });

  test('6. atleta não promove o próprio perfil para técnico', async () => {
    const db = banco('UID_ATLETA', 'atleta@x.com');
    await assertFails(updateDoc(kv(db, 'u_atleta@x.com'), { perfil: 'tecnico' }));
  });

  test('7. pendente não aprova a própria conta', async () => {
    const db = banco('UID_PENDENTE', 'pendente@x.com');
    await assertFails(updateDoc(kv(db, 'u_pendente@x.com'), { aprovado: true }));
  });

  test('8. usuário aprovado pode sair e ficar pendente', async () => {
    const db = banco('UID_ATLETA', 'atleta@x.com');
    await assertSucceeds(updateDoc(kv(db, 'u_atleta@x.com'), { aprovado: false, equipe: '' }));
  });

  test('9. cadastro novo não pode nascer aprovado', async () => {
    const db = banco('UID_NOVO', 'novo@x.com');
    await assertFails(setDoc(kv(db, 'u_novo@x.com'), perfil({ uid: 'UID_NOVO', email: 'novo@x.com', equipe: 'a3' })));
  });

  test('10. atleta aprovado lança resultado em treino da equipe', async () => {
    const db = banco('UID_ATLETA', 'atleta@x.com');
    await assertSucceeds(updateDoc(kv(db, 'eq_a3_tr_t1'), { v: '{"resultado":1}' }));
  });

  test('11. atleta comum não edita índice de treinos', async () => {
    const db = banco('UID_ATLETA', 'atleta@x.com');
    await assertFails(updateDoc(kv(db, 'eq_a3_tridx'), { v: '["t2"]' }));
  });

  test('12. técnico aprovado edita índice da própria equipe', async () => {
    const db = banco('UID_TECNICO', 'tecnico@x.com');
    await assertSucceeds(updateDoc(kv(db, 'eq_a3_tridx'), { v: '["t2"]' }));
  });

  test('13. atleta atualiza o próprio snapshot de performance', async () => {
    const db = banco('UID_ATLETA', 'atleta@x.com');
    await assertSucceeds(updateDoc(kv(db, 'eq_a3_perf_UID_ATLETA'), { v: '{"pbs":{}}' }));
  });

  test('14. atleta não atualiza snapshot alheio', async () => {
    const db = banco('UID_ATLETA', 'atleta@x.com');
    await assertFails(updateDoc(kv(db, 'eq_a3_perf_UID_OUTRO'), { v: '{"pbs":{}}' }));
  });

  test('15. Bruno lê e edita dados globais como administrador', async () => {
    const db = banco('UID_ADMIN', ADMIN_EMAIL);
    await assertSucceeds(getDoc(kv(db, 'pro_UID_OUTRO')));
    await assertSucceeds(updateDoc(kv(db, 'pro_UID_OUTRO'), { v: '{"revisado":true}' }));
  });

  test('16. usuário pendente não altera a lista da equipe', async () => {
    const db = banco('UID_PENDENTE', 'pendente@x.com');
    await assertFails(updateDoc(kv(db, 'eq_a3_users'), { v: '["pendente@x.com"]' }));
  });

  test('17. usuário aprovado não troca sozinho de equipe mantendo aprovação', async () => {
    const db = banco('UID_ATLETA', 'atleta@x.com');
    await assertFails(updateDoc(kv(db, 'u_atleta@x.com'), { equipe: 'b', aprovado: true }));
  });
});
