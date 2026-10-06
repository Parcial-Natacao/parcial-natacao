# PARCIAL — prancheta digital de natação

Aplicativo web de página única para equipes de natação masters: prescrição de
treinos, registro de tempos e parciais, competições, marcas, carga/fadiga e
relatório de performance. **Um arquivo, sem build, sem dependências
instaladas.**

**Versão atual:** v79 (o número aparece no cabeçalho do app e em `const VER`)
**Autor do conteúdo técnico:** Bruno Barbato (atleta e engenheiro)
**Contexto:** equipe de natação masters, Campo Grande — MS

Leia antes de mexer no código:
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — fluxo de trabalho, regras de segurança e padrões.
- [`ARQUITETURA.md`](ARQUITETURA.md) — o mapa técnico: estado, render, motor de performance, histórico de versões.

---

## Como roda

| | |
|---|---|
| **Código** | `index.html` — HTML + CSS + JS num arquivo só, sem framework e sem build |
| **Banco** | Firebase **Firestore**, projeto `parcial-cdb0e`, coleção única `kv` |
| **Autenticação** | Firebase Auth (e-mail e senha) |
| **Hospedagem** | GitHub Pages — `https://parcial-natacao.github.io/parcial-natacao/` |
| **Deploy** | automático a cada push na branch `main` |

Não há passo de build: editar o `index.html` e dar push já publica.

### Rodar localmente

Abrir o `index.html` no navegador, ou servir a pasta:

```bash
python -m http.server 8000
```

> ⚠️ O GitHub Pages serve o `index.html` com `Cache-Control: max-age=600`, e o
> app **não tem service worker**. Depois de publicar, o navegador pode entregar
> a versão antiga por até 10 minutos. Por isso o app verifica sozinho se há
> versão nova e oferece o botão **Atualizar** (Conta › Atualizar app), que
> limpa o cache e recarrega da fonte.

### Instalar no iPhone

Abrir o endereço no **Safari**, tocar em Compartilhar › **Adicionar à Tela de
Início**. O atalho guarda a versão em cache de forma agressiva: para atualizar,
use o botão **Atualizar app** ou apague e readicione o ícone.

---

## Onde os dados moram

Tudo vive na coleção `kv` do Firestore, com o conteúdo serializado em JSON no
campo `v`. A camada de acesso está isolada no objeto `DB` (`get` e `set`), no
topo do `<script>` — trocar de banco significa reescrever só esse objeto.

**Chaves principais:**

| Chave | Conteúdo |
|---|---|
| `u_<email>` | conta do usuário (perfil, equipe, aprovação, dados cadastrais) |
| `pro_<uid>` | dados privados do atleta: marcas, Garmin, exames, fora d'água |
| `eq_<slug>` | equipe; `_users`, `_libs`, `_tridx`, `_cidx` complementam |
| `eq_<slug>_tr_<id>` | treino, com os registros de cada atleta |
| `eq_<slug>_cmp_<id>` | competição |
| `eq_<slug>_perf_<uid>` | snapshot de performance que o técnico lê (**sem** Saúde) |
| `dev_*` | listas auxiliares (equipes, técnicos pendentes) |

### Campos espelhados — não remova

Além do `v`, cada documento carrega `dono`, `donoEmail`, `equipe`, `perfil` e
`aprovado` como **campos reais**. Eles existem porque as regras do Firestore
**não conseguem ler JSON dentro de uma string** — sem eles, nenhuma
autorização por dono, equipe ou função é possível. São gravados por
`camposSeguranca()` em toda escrita. Ver `ARQUITETURA.md` §8.

---

## Segurança

As regras em produção estão em [`firebase/firestore.rules.v2`](firebase/firestore.rules.v2).
O arquivo `firestore.rules` é a **versão anterior, mantida como rollback**.

Resumo do modelo:

- `pro_<uid>` (saúde, marcas, exames): **o dono e o administrador global**. O
  técnico **não** lê — ele vê o snapshot `eq_<slug>_perf_<uid>`, que traz
  performance, fadiga, composição e o *score* de prontidão, mas não o dado cru
  de saúde (VFC e sono do Garmin, exames, respostas do check-in).
- `u_<email>`: o próprio, o técnico aprovado da equipe dele, e o administrador.
  `perfil` e `dono` são congelados; `aprovado` só cai ou é elevado pelo dono da
  equipe.
- `eq_*`: membros **aprovados** daquela equipe. Quem não foi aprovado não lê nada.
- Todo cadastro nasce `aprovado = false`.

### O administrador global

`ADMIN_EMAILS` (no `index.html`) e `ehAdmin()` (nas regras) dão acesso de
leitura **e escrita** a tudo, inclusive aos `pro_` de terceiros — é o que
sustenta o painel de administração e o suporte. É o único papel assim: nem o
técnico nem o dono da equipe chegam perto disso.

Quem decide é o e-mail do **token assinado pelo Firebase Auth**, não um campo
do cadastro — mexer no HTML ou no próprio perfil não concede esse acesso.

Ser administrador não substitui ser atleta: `ehGestor()` exige que ele **ligue**
o modo gestão. Deixar `ehAdmin()` solto ali já custou as abas Marcas, Saúde e
Relatório do próprio administrador, sem jeito de desligar (v105).

**Ao mudar as regras**, leia o cabeçalho do `firestore.rules.v2`: a publicação
tem pré-requisitos (campos espelhados migrados, app na v73+) e publicar fora de
ordem **tranca todos os usuários para fora**.

⚠️ **Consultas de coleção são negadas por inteiro** quando um só documento do
resultado é ilegível — o Firestore exige que os filtros provem a legibilidade,
ele não filtra. Por isso o app varre por faixas (`varrerKv`) e escuta
documentos específicos, nunca a coleção toda.

---

## Pendências conhecidas (auditoria de 2026-09)

1. **Worker de IA** — autentica só pelo cabeçalho `Origin`, sem token do
   Firebase, quota ou rate limit. Está **inativo** (`IA_URL` vazia) e não pode
   ser publicado assim.
2. **Anexos dentro do `pro_`** — fotos e PDFs das sessões fora d'água vão em
   base64 no documento único, que tem teto de 1 MiB. Há trava (avisa em 650 KB,
   recusa em 900 KB) e medidor no Diagnóstico, mas a migração para o Firebase
   Storage continua pendente.
3. **Sanitização/XSS** — há interpolação de conteúdo em HTML sem validação
   suficiente.
4. **Código PRO no cliente** (`CODIGO_PRO`) — visível no navegador; só faz
   sentido enquanto não houver cobrança.
5. **Ciclo de vida da conta** — e-mail não é verificado antes da sessão; não há
   exclusão completa nem política de retenção.
6. **Sem transações** — edições gravam o documento inteiro; escritas
   concorrentes podem se sobrescrever.
7. **Sem manifest e sem service worker** — não é PWA completa (não instala nem
   funciona offline de verdade).
8. **Sem suíte automatizada de testes** — a validação é manual. Os casos que
   precisam passar estão em [`firebase/TESTES-DE-REGRAS.md`](firebase/TESTES-DE-REGRAS.md),
   com um caminho sem instalar nada (Rules Playground) e o esqueleto da suíte.
9. **CSP com `'unsafe-inline'`** — o app é um arquivo único com handlers
   inline, então a CSP não bloqueia script injetado no próprio HTML. Quem
   cobre esse lado é `esc()` e `urlSegura()`. Resolver de vez exigiria tirar
   os `onclick` do HTML.

## Licença

Uso privado da equipe.
