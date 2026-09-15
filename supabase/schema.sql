-- PARCIAL — esquema Supabase
-- Rode no SQL Editor do projeto. Cria tabelas, índices e políticas de acesso.
-- A autenticação usa o auth.users nativo; perfis ficam em public.perfis.

-- ============================================================
-- EQUIPES
-- ============================================================
create table public.equipes (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  nome        text not null,
  tecnico_id  uuid references auth.users(id) on delete set null,
  criado_em   timestamptz default now()
);

-- ============================================================
-- PERFIS (um por usuário autenticado)
-- ============================================================
create type perfil_tipo as enum ('atleta','pro','tecnico');
create type nivel_tipo  as enum ('Master','Aperfeiçoamento','Águas Abertas');

create table public.perfis (
  id         uuid primary key references auth.users(id) on delete cascade,
  equipe_id  uuid references public.equipes(id) on delete set null,
  perfil     perfil_tipo not null,
  nome       text not null,
  idade      int  check (idade between 8 and 110),
  telefone   text,
  cpf        text,
  tipo       text check (tipo in ('piscina','aguas')),
  nivel      nivel_tipo,
  ativo      boolean default true,
  criado_em  timestamptz default now()
);
create index on public.perfis(equipe_id);

-- ============================================================
-- LIBERAÇÕES DE CPF (controle de quem pode se cadastrar)
-- ============================================================
create table public.liberacoes (
  id        uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  cpf       text not null,
  nome      text,
  nivel     nivel_tipo default 'Master',
  usado     boolean default false,
  criado_em timestamptz default now(),
  unique (equipe_id, cpf)
);

-- ============================================================
-- TREINOS
-- ============================================================
create table public.treinos (
  id          uuid primary key default gen_random_uuid(),
  equipe_id   uuid not null references public.equipes(id) on delete cascade,
  data        date not null,
  titulo      text not null,
  nivel       nivel_tipo,
  texto_bruto text,
  blocos      jsonb not null default '[]',
  volume      int default 0,
  criado_por  uuid references auth.users(id),
  atualizado  timestamptz default now()
);
create index on public.treinos(equipe_id, data desc);

-- destinatários: quem recebeu o treino
create table public.treino_atletas (
  treino_id uuid not null references public.treinos(id) on delete cascade,
  atleta_id uuid not null references public.perfis(id) on delete cascade,
  primary key (treino_id, atleta_id)
);

-- tempos lançados: uma linha por série por atleta
create table public.registros (
  id        uuid primary key default gen_random_uuid(),
  treino_id uuid not null references public.treinos(id) on delete cascade,
  atleta_id uuid not null references public.perfis(id) on delete cascade,
  item_id   text not null,          -- id da série dentro de blocos
  tempos    int[] default '{}',     -- milissegundos
  parciais  int[] default '{}',
  atualizado timestamptz default now(),
  unique (treino_id, atleta_id, item_id)
);

-- ============================================================
-- COMPETIÇÕES
-- ============================================================
create table public.competicoes (
  id        uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  nome      text not null,
  data      date not null,
  local     text,
  piscina   text check (piscina in ('SC25','LC50')) default 'SC25'
);

create table public.provas (
  id           uuid primary key default gen_random_uuid(),
  competicao_id uuid not null references public.competicoes(id) on delete cascade,
  tipo         text check (tipo in ('ind','rev')) default 'ind',
  codigo       text,
  dist         int,
  percurso     int,      -- distância de cada percurso em revezamento
  n_percursos  int,
  estilo       text,
  genero       text,
  categoria    text,
  ordem        int default 0
);

create table public.inscritos (
  id        uuid primary key default gen_random_uuid(),
  prova_id  uuid not null references public.provas(id) on delete cascade,
  atleta_id uuid references public.perfis(id) on delete set null,
  nome      text not null,          -- preserva nome de quem não é da equipe
  equipe    text,
  serie     int default 1,
  raia      int,
  inscricao int,                    -- milissegundos
  parciais  int[] default '{}'      -- acumulados
);
create index on public.inscritos(prova_id);

-- ============================================================
-- DADOS PRO (privados do atleta)
-- ============================================================
create table public.pro_marcas (
  id        uuid primary key default gen_random_uuid(),
  atleta_id uuid not null references public.perfis(id) on delete cascade,
  dist      int not null,
  estilo    text not null,
  piscina   text not null,
  tempo     int not null,
  unique (atleta_id, dist, estilo, piscina)
);

create table public.pro_resultados (
  id        uuid primary key default gen_random_uuid(),
  atleta_id uuid not null references public.perfis(id) on delete cascade,
  chave     text,
  competicao text, data date, piscina text, prova text,
  dist int, estilo text, tempo int, parciais int[], inscricao int,
  unique (atleta_id, chave)
);

create table public.pro_saude (
  atleta_id uuid not null references public.perfis(id) on delete cascade,
  data      date not null,
  fc        int, hrv int, sono numeric(3,1), pse int, nado int,
  primary key (atleta_id, data)
);

create table public.pro_seco (
  id        uuid primary key default gen_random_uuid(),
  atleta_id uuid not null references public.perfis(id) on delete cascade,
  data      date not null,
  tipo      text, obs text,
  img_path  text        -- caminho no Storage, não a imagem em base64
);

-- ============================================================
-- FUNÇÕES AUXILIARES
-- ============================================================
create or replace function public.minha_equipe()
returns uuid language sql stable security definer as $$
  select equipe_id from public.perfis where id = auth.uid()
$$;

create or replace function public.sou_tecnico()
returns boolean language sql stable security definer as $$
  select coalesce((select perfil = 'tecnico' from public.perfis where id = auth.uid()), false)
$$;

-- ============================================================
-- POLÍTICAS DE ACESSO
-- Princípio: o técnico enxerga a equipe inteira; o atleta enxerga o que é
-- dele e os treinos endereçados a ele. Dados PRO são privados do dono.
-- ============================================================
alter table public.equipes        enable row level security;
alter table public.perfis         enable row level security;
alter table public.liberacoes     enable row level security;
alter table public.treinos        enable row level security;
alter table public.treino_atletas enable row level security;
alter table public.registros      enable row level security;
alter table public.competicoes    enable row level security;
alter table public.provas         enable row level security;
alter table public.inscritos      enable row level security;
alter table public.pro_marcas     enable row level security;
alter table public.pro_resultados enable row level security;
alter table public.pro_saude      enable row level security;
alter table public.pro_seco       enable row level security;

-- equipe: todos da equipe leem; só o técnico altera
create policy eq_ler on public.equipes for select
  using (id = public.minha_equipe());
create policy eq_editar on public.equipes for update
  using (id = public.minha_equipe() and public.sou_tecnico());

-- perfis: a equipe se enxerga; cada um edita o próprio; o técnico edita todos
create policy pf_ler on public.perfis for select
  using (equipe_id = public.minha_equipe() or id = auth.uid());
create policy pf_criar on public.perfis for insert with check (id = auth.uid());
create policy pf_editar on public.perfis for update
  using (id = auth.uid() or (equipe_id = public.minha_equipe() and public.sou_tecnico()));

-- liberações: só o técnico
create policy lb_tecnico on public.liberacoes for all
  using (equipe_id = public.minha_equipe() and public.sou_tecnico())
  with check (equipe_id = public.minha_equipe() and public.sou_tecnico());

-- treinos: a equipe lê; só o técnico escreve
create policy tr_ler on public.treinos for select
  using (equipe_id = public.minha_equipe());
create policy tr_escrever on public.treinos for all
  using (equipe_id = public.minha_equipe() and public.sou_tecnico())
  with check (equipe_id = public.minha_equipe() and public.sou_tecnico());

create policy ta_ler on public.treino_atletas for select using (true);
create policy ta_escrever on public.treino_atletas for all
  using (public.sou_tecnico()) with check (public.sou_tecnico());

-- registros: o atleta escreve os próprios; o técnico escreve os de todos
create policy rg_ler on public.registros for select
  using (atleta_id = auth.uid() or public.sou_tecnico());
create policy rg_escrever on public.registros for all
  using (atleta_id = auth.uid() or public.sou_tecnico())
  with check (atleta_id = auth.uid() or public.sou_tecnico());

-- competição: a equipe lê; só o técnico escreve
create policy cp_ler on public.competicoes for select
  using (equipe_id = public.minha_equipe());
create policy cp_escrever on public.competicoes for all
  using (equipe_id = public.minha_equipe() and public.sou_tecnico())
  with check (equipe_id = public.minha_equipe() and public.sou_tecnico());
create policy pv_ler on public.provas for select using (true);
create policy pv_escrever on public.provas for all
  using (public.sou_tecnico()) with check (public.sou_tecnico());
create policy in_ler on public.inscritos for select using (true);
create policy in_escrever on public.inscritos for all
  using (public.sou_tecnico()) with check (public.sou_tecnico());

-- dados PRO: exclusivos do dono, o técnico não enxerga
create policy pm_dono on public.pro_marcas     for all using (atleta_id = auth.uid()) with check (atleta_id = auth.uid());
create policy pr_dono on public.pro_resultados for all using (atleta_id = auth.uid()) with check (atleta_id = auth.uid());
create policy ps_dono on public.pro_saude      for all using (atleta_id = auth.uid()) with check (atleta_id = auth.uid());
create policy pk_dono on public.pro_seco       for all using (atleta_id = auth.uid()) with check (atleta_id = auth.uid());

-- ============================================================
-- SINCRONIA INSTANTÂNEA
-- ============================================================
alter publication supabase_realtime add table
  public.treinos, public.registros, public.competicoes,
  public.provas, public.inscritos, public.perfis;
