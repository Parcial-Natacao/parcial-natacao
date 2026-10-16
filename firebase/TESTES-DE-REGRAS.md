# Testes das regras do Firestore

A suíte automatizada está em `firebase/regras.test.mjs` e hoje cobre 36 casos
de dono, equipe, administração, cadastro independente, PRO competitivo,
afiliação pública e treinos pessoais. Este documento mantém também um roteiro
manual para conferir casos críticos no Rules Playground.

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
| 1 | Saúde é privada | `get` · `/kv/pro_<uid-DE-OUTRO>` | atleta comum | ❌ **Deny** |
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
| 15 | Administração global | `get` e `update` · `/kv/pro_<uid-DE-OUTRO>` | `barbato.bruno@gmail.com` | ✅ Allow |
| 16 | Pendente não altera elenco | `update` · `/kv/eq_<slug>_users` | atleta pendente | ❌ **Deny** |
| 17 | Usuário não troca de equipe aprovado | `update` · `/kv/u_<seu-email>` mantendo `aprovado:true` | o próprio | ❌ **Deny** |
| 18 | Cadastro sem equipe | `create` · `/kv/u_<email-novo>` com `equipe:null` e `aprovado:false` | o próprio | ✅ Allow |
| 19 | Gestor enxerga pendentes | consulta `where equipe == <slug>` em `/kv` | técnico da equipe | ✅ Allow |
| 20 | Atleta não varre cadastros | consulta `where equipe == <slug>` em `/kv` | atleta comum | ❌ **Deny** |
| 21 | Criação de equipe restrita | `create` · `/kv/eq_<slug>` | usuário comum | ❌ **Deny** |
| 22 | Dono legado não se autoaprova | `update aprovado:true` · `/kv/u_<email>` | técnico pendente | ❌ **Deny** |
| 23 | Cancelar pedido de equipe | `update equipe:null, aprovado:false` · `/kv/u_<email>` | atleta pendente | ✅ Allow |
| 24 | Aprovação pelo técnico | `update aprovado:true` · `/kv/u_<atleta>` | técnico da equipe | ✅ Allow |

**Os mais importantes são o 1, o 6 e o 7.** O 1 é a privacidade dos dados de
saúde; o 6 e o 7 são a escalada de privilégio que motivou toda a correção.

> ⚠️ O Playground escreve de verdade quando você manda `update`/`create` com
> "Allow". Use um documento de teste, ou rode só os casos que esperam **Deny**.

---

## B. Suíte automatizada (precisa de Node)

Na pasta `firebase`:

```bash
npm install
npx firebase emulators:exec --only firestore --project parcial-regras-test "npm run test:rules"
```

O arquivo de teste carrega `firestore.rules.v2` diretamente no ambiente do
emulador. Entre os casos adicionais estão: PRO não recebe gestão, técnico pode
aprovar PRO da própria equipe, PRO pode nascer sem equipe, dono acessa os seus
treinos pessoais e outra conta não consegue lê-los, alterá-los ou ocupar a
chave correspondente ao UID alheio.

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
