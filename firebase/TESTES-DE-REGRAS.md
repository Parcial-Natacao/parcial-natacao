# Testes das regras do Firestore

A auditoria apontou, com razão, que **não existe suíte automatizada**. Este
documento é o meio-termo honesto enquanto ela não existe: os casos que
**precisam** passar, escritos de forma que qualquer pessoa consiga rodar.

Há dois caminhos. O **A** não exige instalar nada e roda em 10 minutos. O **B**
é a suíte de verdade, para quem tiver Node.

---

## A. Rules Playground (sem instalar nada)

Console do Firebase › **Firestore Database** › aba **Regras** › **Rules Playground**.

Em cada caso, preencha **Authentication → Authenticated**, informe o `uid` e
adicione o *custom claim* **`email`** (as regras usam o e-mail, porque a conta é
indexada por ele: `u_<email>`).

> Antes de começar, pegue na aba **Dados** um `uid` seu, um de outro atleta e o
> slug da equipe. Substitua nos caminhos abaixo.

| # | O que testa | Operação e caminho | Quem | Esperado |
|---|---|---|---|---|
| 1 | Saúde é privada | `get` · `/kv/pro_<uid-DE-OUTRO>` | você (dev) | ❌ **Deny** |
| 2 | Dono lê o próprio | `get` · `/kv/pro_<seu-uid>` | você | ✅ Allow |
| 3 | Sem aprovação não vê a equipe | `get` · `/kv/eq_<slug>_tridx` | atleta com `aprovado:false` | ❌ **Deny** |
| 4 | Membro aprovado vê | `get` · `/kv/eq_<slug>_tridx` | atleta aprovado da equipe | ✅ Allow |
| 5 | Equipe alheia | `get` · `/kv/eq_<OUTRA>_tridx` | atleta aprovado da sua | ❌ **Deny** |
| 6 | **Autopromoção** | `update` · `/kv/u_<seu-email>` com `perfil:"tecnico"` | você mesmo | ❌ **Deny** |
| 7 | **Autoaprovação** | `update` · `/kv/u_<seu-email>` com `aprovado:true` | atleta pendente | ❌ **Deny** |
| 8 | Sair da equipe | `update` · `/kv/u_<seu-email>` com `aprovado:false` | você mesmo | ✅ Allow |
| 9 | Cadastro nasce pendente | `create` · `/kv/u_<email-novo>` com `aprovado:true` | o próprio | ❌ **Deny** |
| 10 | Atleta lança o próprio tempo | `update` · `/kv/eq_<slug>_tr_<id>` | atleta aprovado | ✅ Allow |
| 11 | Atleta não edita o índice | `update` · `/kv/eq_<slug>_tridx` | atleta comum aprovado | ❌ **Deny** |
| 12 | Técnico edita o índice | `update` · `/kv/eq_<slug>_tridx` | técnico aprovado da equipe | ✅ Allow |
| 13 | Snapshot próprio | `update` · `/kv/eq_<slug>_perf_<seu-uid>` | você | ✅ Allow |
| 14 | Snapshot alheio | `update` · `/kv/eq_<slug>_perf_<uid-DE-OUTRO>` | você (não técnico) | ❌ **Deny** |

**Os mais importantes são o 1, o 6 e o 7.** O 1 é a privacidade dos dados de
saúde; o 6 e o 7 são a escalada de privilégio que motivou toda a correção.

> ⚠️ O Playground escreve de verdade quando você manda `update`/`create` com
> "Allow". Use um documento de teste, ou rode só os casos que esperam **Deny**.

---

## B. Suíte automatizada (precisa de Node)

```bash
npm i -D @firebase/rules-unit-testing firebase-tools vitest
npx firebase emulators:exec --only firestore "npx vitest run"
```

Esqueleto para `firebase/regras.test.js`:

```js
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { beforeAll, afterAll, test } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'parcial-cdb0e',
    firestore: { rules: readFileSync('firebase/firestore.rules.v2', 'utf8') }
  });
  // semeia os cadastros SEM passar pelas regras
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'kv/u_atleta@x.com'),
      { v: '{}', dono: 'UID_ATLETA', equipe: 'a3', perfil: 'atleta', aprovado: true, donoEmail: null });
    await setDoc(doc(db, 'kv/pro_UID_OUTRO'), { v: '{}', dono: 'UID_OUTRO' });
  });
});
afterAll(() => env.cleanup());

const como = (uid, email) => env.authenticatedContext(uid, { email }).firestore();

test('não lê a saúde de outro atleta', async () => {
  const db = como('UID_ATLETA', 'atleta@x.com');
  await assertFails(getDoc(doc(db, 'kv/pro_UID_OUTRO')));
});

test('não se promove a técnico', async () => {
  const db = como('UID_ATLETA', 'atleta@x.com');
  await assertFails(setDoc(doc(db, 'kv/u_atleta@x.com'),
    { v: '{}', dono: 'UID_ATLETA', equipe: 'a3', perfil: 'tecnico', aprovado: true, donoEmail: null }));
});
```

Converta cada linha da tabela do caminho A num `test()`. O ganho de ter isso é
que **mudar uma regra deixa de ser um ato de fé**.

---

## Se um caso falhar

Anote o número, o caminho e quem era o usuário, e compare com
[`firestore.rules.v2`](firestore.rules.v2) — o arquivo está comentado regra a
regra. Cuidado com duas armadilhas que já custaram tempo neste projeto:

1. **As regras não leem dentro de `v`.** Autorização só enxerga os campos
   espelhados (`dono`, `donoEmail`, `equipe`, `perfil`, `aprovado`). Documento
   sem eles é documento que ninguém acessa — rode a migração no Diagnóstico.
2. **Consulta de coleção é negada por inteiro** se um único documento do
   resultado for ilegível. O Firestore não filtra. Por isso o app varre por
   faixas (`varrerKv`) e escuta documentos específicos, nunca a coleção toda.
