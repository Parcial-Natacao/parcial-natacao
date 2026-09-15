/* PARCIAL — adaptador Supabase
   Substitui o objeto DB do index.html. Mantém a mesma interface (get/set),
   para que nenhuma tela precise mudar durante a migração.

   Passo a passo:
   1. incluir no <head>:
      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   2. preencher URL e chave pública abaixo (a anon key pode ficar no código:
      a proteção real são as políticas do schema.sql)
   3. trocar o objeto DB do index.html por este
   4. trocar cadastrar/autenticar pelas funções do final deste arquivo
*/

const SUPABASE_URL  = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_ANON = 'SUA_CHAVE_PUBLICA';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* ------------------------------------------------------------------
   Estratégia de migração em duas etapas.

   ETAPA 1 — ponte: manter o formato chave-valor numa tabela única.
   Migra em uma tarde, já resolve sincronia. Perde consultas SQL.

   ETAPA 2 — tabelas reais do schema.sql. Melhor, mas exige reescrever
   carregarDados() e as funções de gravação. Fazer depois que a equipe
   já estiver usando.
   ------------------------------------------------------------------ */

/* ===================== ETAPA 1 — ponte chave-valor ===================== */
/* create table public.kv (
     chave text primary key,
     valor jsonb,
     equipe text,
     dono uuid references auth.users(id),
     atualizado timestamptz default now()
   );
   alter table public.kv enable row level security;
   -- chaves que começam com pro_ são do dono; o resto é da equipe
   create policy kv_ler on public.kv for select
     using (dono = auth.uid() or equipe = (select equipe_id::text from public.perfis where id = auth.uid()));
   create policy kv_escrever on public.kv for all
     using (dono = auth.uid() or equipe = (select equipe_id::text from public.perfis where id = auth.uid()))
     with check (dono = auth.uid() or equipe = (select equipe_id::text from public.perfis where id = auth.uid()));
*/

const DB = {
  async get(chave, pessoal = true) {
    if (chave === 'sessao') {                    // sessão continua local
      try { const v = localStorage.getItem('parcial_sessao'); return v ? JSON.parse(v) : null }
      catch (e) { return null }
    }
    const { data, error } = await sb.from('kv').select('valor').eq('chave', chave).maybeSingle();
    if (error) { console.warn('DB.get', chave, error.message); return null }
    return data ? data.valor : null;
  },

  async set(chave, valor, pessoal = true) {
    if (chave === 'sessao') {
      try { localStorage.setItem('parcial_sessao', JSON.stringify(valor)); return true }
      catch (e) { return false }
    }
    const u = (await sb.auth.getUser()).data.user;
    const linha = {
      chave, valor,
      dono: chave.startsWith('pro_') ? u?.id : null,
      equipe: chave.startsWith('eq_') ? chave.split('_')[1] : null,
      atualizado: new Date().toISOString()
    };
    const { error } = await sb.from('kv').upsert(linha, { onConflict: 'chave' });
    if (error) { toast('Falha ao salvar'); return false }
    return true;
  }
};

/* Sincronia instantânea: substitui o setInterval de 12 segundos.
   Chame uma vez depois do login. */
function ligarSincronia() {
  sb.channel('kv-mudancas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kv' }, () => {
      if (!S.escrevendo) sincronizar(true);
    })
    .subscribe();
}

/* ===================== Autenticação nativa ===================== */
/* Substituem cadastrar() e autenticar(). Podem sumir:
   hash(), novoSal(), pedirReset(), aplicarReset(), trocarSenha(). */

async function cadastrarSb(d) {
  if (!d.senha || d.senha.length < 6) return toast('A senha precisa de ao menos 6 caracteres');
  if (d.senha !== d.senha2)           return toast('As senhas não conferem');
  if (!telValido(d.telefone))         return toast('Telefone inválido');

  const { data, error } = await sb.auth.signUp({
    email: d.email, password: d.senha,
    options: { data: { nome: d.nome, perfil: d.perfil } }
  });
  if (error) return toast(traduzErro(error.message));

  /* as mesmas regras de antes continuam valendo aqui:
     - atleta  → exige CPF liberado (consultar tabela liberacoes)
     - pro     → exige CODIGO_PRO, cria a equipe se não existir
     - tecnico → cria ou assume a equipe                              */
  await sb.from('perfis').insert({
    id: data.user.id, perfil: d.perfil, nome: d.nome, idade: +d.idade,
    telefone: soDig(d.telefone), cpf: cpfLimpo(d.cpf || ''),
    tipo: d.tipo || null, nivel: d.perfil === 'tecnico' ? null : (d.nivel || 'Master')
  });
  toast('Conta criada. Confirme o e-mail que enviamos.');
}

async function autenticarSb(email, senha) {
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) return toast(traduzErro(error.message));
  const { data: perfil } = await sb.from('perfis').select('*, equipes(*)').eq('id', (await sb.auth.getUser()).data.user.id).single();
  if (perfil.ativo === false) { await sb.auth.signOut(); return toast('Conta desativada pelo técnico') }
  S.u = perfil; await carregarDados(); ligarSincronia(); render();
}

/* Recuperação de senha: agora o e-mail sai de verdade.
   Configure o modelo em Authentication › Email Templates. */
async function pedirResetSb(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname + '#recuperar'
  });
  toast(error ? traduzErro(error.message) : 'Link enviado para o seu e-mail');
}
async function aplicarResetSb(senha, senha2) {
  if (senha.length < 6)   return toast('Mínimo de 6 caracteres');
  if (senha !== senha2)   return toast('As senhas não conferem');
  const { error } = await sb.auth.updateUser({ password: senha });
  toast(error ? traduzErro(error.message) : 'Senha redefinida');
}

function traduzErro(m) {
  if (/already registered/i.test(m))       return 'Já existe conta com este e-mail';
  if (/Invalid login/i.test(m))            return 'E-mail ou senha incorretos';
  if (/Email not confirmed/i.test(m))      return 'Confirme o e-mail antes de entrar';
  if (/rate limit/i.test(m))               return 'Muitas tentativas. Aguarde um instante';
  return 'Não consegui completar. Tente de novo';
}

/* ===================== Fotos do treino em seco =====================
   Hoje ficam em base64 dentro do registro. Com Supabase, vão para o
   Storage e a tabela guarda só o caminho. */
async function enviarFotoSeco(arquivo, atletaId) {
  const caminho = `${atletaId}/${Date.now()}.jpg`;
  const { error } = await sb.storage.from('seco').upload(caminho, arquivo, { contentType: 'image/jpeg' });
  if (error) { toast('Falha ao enviar a foto'); return null }
  return caminho;
}

/* ===================== Balizamento por foto =====================
   A chave da API não pode ficar na página. Criar uma Edge Function
   chamada 'balizamento' que recebe o arquivo e devolve o JSON. */
async function lerBalizamentoSb(arquivo) {
  const fd = new FormData(); fd.append('arquivo', arquivo);
  const { data, error } = await sb.functions.invoke('balizamento', { body: fd });
  if (error) throw error;
  return data;
}
