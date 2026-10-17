import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

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
const timePublico = ({ uid, nome = 'Equipe Pública' }) => ({
  v: JSON.stringify({ id: uid, dono: uid, nome, ativo: true }),
  dono: uid, donoEmail: null, equipe: null, perfil: null, aprovado: null, categoria: 'time',
});

const dadosBase = {
  'u_atleta@x.com': perfil({ uid: 'UID_ATLETA', email: 'atleta@x.com', equipe: 'a3' }),
  'u_pendente@x.com': perfil({ uid: 'UID_PENDENTE', email: 'pendente@x.com', equipe: 'a3', aprovado: false }),
  'u_pro@x.com': perfil({ uid: 'UID_PRO', email: 'pro@x.com', equipe: 'a3', tipo: 'pro' }),
  'u_pro-pendente@x.com': perfil({ uid: 'UID_PRO_PENDENTE', email: 'pro-pendente@x.com', equipe: 'a3', tipo: 'pro', aprovado: false }),
  'u_dono-pendente@x.com': perfil({ uid: 'UID_DONO_PENDENTE', email: 'dono-pendente@x.com', equipe: 'falsa', tipo: 'tecnico', aprovado: false }),
  'u_tecnico@x.com': perfil({ uid: 'UID_TECNICO', email: 'tecnico@x.com', equipe: 'a3', tipo: 'tecnico' }),
  'u_outro@x.com': perfil({ uid: 'UID_OUTRO', email: 'outro@x.com', equipe: 'b' }),
  'u_barbato.bruno@gmail.com': perfil({ uid: 'UID_ADMIN', email: ADMIN_EMAIL, equipe: 'admin', tipo: 'pro' }),
  'eq_a3': { v: '{}', donoEmail: 'tecnico@x.com', equipe: 'a3' },
  'eq_b': { v: '{}', donoEmail: 'outro@x.com', equipe: 'b' },
  'eq_falsa': { v: '{}', donoEmail: 'dono-pendente@x.com', equipe: 'falsa' },
  'eq_a3_users': { v: '[]', donoEmail: 'tecnico@x.com', equipe: 'a3' },
  'eq_a3_tridx': { v: '[]', donoEmail: 'tecnico@x.com', equipe: 'a3' },
  'eq_b_tridx': { v: '[]', donoEmail: 'outro@x.com', equipe: 'b' },
  'eq_a3_tr_t1': { v: '{}', donoEmail: 'tecnico@x.com', equipe: 'a3' },
  'eq_a3_perf_UID_ATLETA': { v: '{}', donoEmail: 'atleta@x.com', equipe: 'a3' },
  'eq_a3_perf_UID_OUTRO': { v: '{}', donoEmail: 'outro@x.com', equipe: 'a3' },
  'pro_UID_ATLETA': { v: '{}', dono: 'UID_ATLETA', donoEmail: 'atleta@x.com' },
  'pro_UID_OUTRO': { v: '{}', dono: 'UID_OUTRO', donoEmail: 'outro@x.com' },
  'pt_UID_PRO_idx': { v: '[]', dono: 'UID_PRO', donoEmail: null, equipe: null, perfil: null, aprovado: null },
  'pt_UID_PRO_t1': { v: '{}', dono: 'UID_PRO', donoEmail: null, equipe: null, perfil: null, aprovado: null },
  'time_UID_OUTRO': timePublico({ uid: 'UID_OUTRO', nome: 'Equipe do Outro' }),
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

  test('18. atleta pode criar cadastro pendente sem equipe', async () => {
    const db = banco('UID_SEM_EQUIPE', 'semequipe@x.com');
    await assertSucceeds(setDoc(kv(db, 'u_semequipe@x.com'), perfil({
      uid: 'UID_SEM_EQUIPE', email: 'semequipe@x.com', equipe: null, aprovado: false,
    })));
  });

  test('19. técnico consulta inclusive cadastros pendentes da própria equipe', async () => {
    const db = banco('UID_TECNICO', 'tecnico@x.com');
    const porEquipe=query(collection(db, 'kv'),where('equipe','==','a3'),where('perfil','==','atleta'));
    await assertSucceeds(getDocs(porEquipe));
  });

  test('20. atleta comum não consulta todos os cadastros da equipe', async () => {
    const db = banco('UID_ATLETA', 'atleta@x.com');
    const porEquipe=query(collection(db, 'kv'),where('equipe','==','a3'),where('perfil','==','atleta'));
    await assertFails(getDocs(porEquipe));
  });

  test('21. usuário comum não cria uma equipe nova', async () => {
    const db = banco('UID_GOLPE', 'golpe@x.com');
    await assertFails(setDoc(kv(db, 'eq_golpe'), {
      v: JSON.stringify({ slug: 'golpe', nome: 'Equipe Golpe', tecnicoEmail: 'golpe@x.com' }),
      dono: null, donoEmail: 'golpe@x.com', equipe: 'golpe', perfil: null, aprovado: null,
    }));
  });

  test('22. dono legado pendente não aprova a própria conta', async () => {
    const db = banco('UID_DONO_PENDENTE', 'dono-pendente@x.com');
    await assertFails(updateDoc(kv(db, 'u_dono-pendente@x.com'), { aprovado: true }));
  });

  test('23. atleta pendente pode cancelar o pedido e voltar a ficar sem equipe', async () => {
    const db = banco('UID_PENDENTE', 'pendente@x.com');
    await assertSucceeds(updateDoc(kv(db, 'u_pendente@x.com'), { equipe: null, aprovado: false }));
  });

  test('24. técnico aprovado pode aprovar atleta pendente da própria equipe', async () => {
    const db = banco('UID_TECNICO', 'tecnico@x.com');
    await assertSucceeds(updateDoc(kv(db, 'u_pendente@x.com'), { aprovado: true }));
  });

  test('25. atleta cria uma afiliação pública sem virar gestor', async () => {
    const db = banco('UID_ATLETA', 'atleta@x.com');
    await assertSucceeds(setDoc(kv(db, 'time_UID_ATLETA'), timePublico({ uid: 'UID_ATLETA' })));
    await assertFails(setDoc(kv(db, 'eq_time-golpe'), {
      v: '{}', dono: null, donoEmail: 'atleta@x.com', equipe: 'time-golpe', perfil: null, aprovado: null,
    }));
  });

  test('26. uma conta não cria equipe pública em nome de outra', async () => {
    const db = banco('UID_ATLETA', 'atleta@x.com');
    await assertFails(setDoc(kv(db, 'time_UID_FALSO'), timePublico({ uid: 'UID_FALSO' })));
  });

  test('27. equipes públicas podem ser listadas por qualquer usuário logado', async () => {
    const db = banco('UID_PENDENTE', 'pendente@x.com');
    const lista=query(collection(db, 'kv'),where('categoria','==','time'));
    await assertSucceeds(getDocs(lista));
  });

  test('28. outro usuário não altera a equipe pública alheia', async () => {
    const db = banco('UID_ATLETA', 'atleta@x.com');
    await assertFails(updateDoc(kv(db, 'time_UID_OUTRO'), { v: JSON.stringify({ nome: 'Tomada' }) }));
  });

  test('29. PRO é atleta competitivo e não edita a gestão da equipe', async () => {
    const db = banco('UID_PRO', 'pro@x.com');
    await assertFails(updateDoc(kv(db, 'eq_a3_tridx'), { v: '["tomado"]' }));
  });

  test('30. técnico aprovado pode aprovar PRO pendente da própria equipe', async () => {
    const db = banco('UID_TECNICO', 'tecnico@x.com');
    await assertSucceeds(updateDoc(kv(db, 'u_pro-pendente@x.com'), { aprovado: true }));
  });

  test('31. PRO pode criar cadastro pendente sem equipe', async () => {
    const db = banco('UID_PRO_NOVO', 'pro-novo@x.com');
    await assertSucceeds(setDoc(kv(db, 'u_pro-novo@x.com'), perfil({
      uid: 'UID_PRO_NOVO', email: 'pro-novo@x.com', equipe: null, tipo: 'pro', aprovado: false,
    })));
  });

  test('32. PRO lê e atualiza o próprio treino pessoal', async () => {
    const db = banco('UID_PRO', 'pro@x.com');
    await assertSucceeds(getDoc(kv(db, 'pt_UID_PRO_t1')));
    await assertSucceeds(updateDoc(kv(db, 'pt_UID_PRO_t1'), { v: '{"feito":true}' }));
  });

  test('33. outro atleta não lê nem altera treino pessoal do PRO', async () => {
    const db = banco('UID_OUTRO', 'outro@x.com');
    await assertFails(getDoc(kv(db, 'pt_UID_PRO_t1')));
    await assertFails(updateDoc(kv(db, 'pt_UID_PRO_t1'), { v: '{"tomado":true}' }));
  });

  test('34. usuário não cria treino pessoal em nome de outro', async () => {
    const db = banco('UID_OUTRO', 'outro@x.com');
    await assertFails(setDoc(kv(db, 'pt_UID_PRO_falso'), {
      v: '{}', dono: 'UID_PRO', donoEmail: null, equipe: null, perfil: null, aprovado: null,
    }));
  });

  test('35. usuário não ocupa a chave pessoal de outro nem usando o próprio dono', async () => {
    const db = banco('UID_OUTRO', 'outro@x.com');
    await assertFails(setDoc(kv(db, 'pt_UID_VITIMA_novo'), {
      v: '{}', dono: 'UID_OUTRO', donoEmail: null, equipe: null, perfil: null, aprovado: null,
    }));
  });

  test('36. usuário não ocupa o documento PRO de outro UID', async () => {
    const db = banco('UID_OUTRO', 'outro@x.com');
    await assertFails(setDoc(kv(db, 'pro_UID_VITIMA'), {
      v: '{}', dono: 'UID_OUTRO', donoEmail: null, equipe: null, perfil: null, aprovado: null,
    }));
  });

  // Os dados pessoais não cabem mais num documento só: a Saúde fica em
  // pro_<uid>_sau e as versões diárias em pro_<uid>_bk<N> (v159/v160). Uma
  // regra que exija a chave EXATA `pro_<uid>` bloqueia os dois — e com eles a
  // separação que protege VFC/sono/check-in e o único histórico que o plano
  // gratuito permite. Estes três casos existem para que isso não volte.
  test('37. atleta grava o próprio documento de Saúde', async () => {
    const db = banco('UID_ATLETA', 'atleta@x.com');
    await assertSucceeds(setDoc(kv(db, 'pro_UID_ATLETA_sau'), {
      v: '{}', dono: 'UID_ATLETA', donoEmail: null, equipe: null, perfil: null, aprovado: null,
    }));
  });

  test('38. atleta grava as próprias versões diárias', async () => {
    const db = banco('UID_ATLETA', 'atleta@x.com');
    await assertSucceeds(setDoc(kv(db, 'pro_UID_ATLETA_bk3'), {
      v: '{}', dono: 'UID_ATLETA', donoEmail: null, equipe: null, perfil: null, aprovado: null,
    }));
  });

  test('39. usuário não grava a Saúde nem as versões de outro UID', async () => {
    const db = banco('UID_OUTRO', 'outro@x.com');
    await assertFails(setDoc(kv(db, 'pro_UID_VITIMA_sau'), {
      v: '{}', dono: 'UID_OUTRO', donoEmail: null, equipe: null, perfil: null, aprovado: null,
    }));
    await assertFails(setDoc(kv(db, 'pro_UID_VITIMA_bk0'), {
      v: '{}', dono: 'UID_OUTRO', donoEmail: null, equipe: null, perfil: null, aprovado: null,
    }));
  });
});
