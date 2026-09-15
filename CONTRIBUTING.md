# Como contribuir — PARCIAL

Guia rápido para quem for desenvolver o app. Leia isto **antes** de começar.

---

## 1. Visão geral do projeto

O **PARCIAL** é um app de performance de natação. Características importantes:

- **PWA single-file**: praticamente tudo vive em [`index.html`](index.html) (~380 KB) — HTML + CSS + JS puro, **sem build, sem framework, sem `npm install`**.
- **Sync na nuvem**: usa **Firebase / Firestore** (projeto `parcial-cdb0e`) para sincronizar dados entre usuários.
- **Deploy automático**: todo push na branch `main` publica em **https://parcial-natacao.github.io** (GitHub Pages).

Antes de tocar no código, leia nesta ordem:

1. [`ARQUITETURA.md`](ARQUITETURA.md) — o mapa do app (estado global `S`, `render()`, helpers do Firestore, motor de performance, histórico de versões). **É a leitura mais importante.**
2. [`README.md`](README.md) — visão geral e setup.
3. [`ESPECIFICACAO.md`](ESPECIFICACAO.md) — regras de negócio.

---

## 2. Setup do ambiente

```bash
git clone https://github.com/parcial-natacao/parcial-natacao.github.io.git
cd parcial-natacao.github.io
```

Não há dependências para instalar. Para rodar localmente, basta abrir o `index.html` no navegador ou servir a pasta com qualquer servidor estático, por exemplo:

```bash
python -m http.server 8000
```

E acessar `http://localhost:8000`.

---

## 3. Fluxo de trabalho (Git)

Trabalhe sempre em uma branch por tarefa e abra Pull Request. **Não commite direto na `main`** — ela vai direto para produção.

```bash
git checkout main
git pull origin main          # sempre parta da versão mais recente
git checkout -b minha-tarefa  # uma branch por tarefa
# ... edições ...
git commit -am "descrição curta e clara"
git push -u origin minha-tarefa
```

Depois, abra um **Pull Request** no GitHub para revisão antes do merge em `main`.

### Convenção de commits

- Mensagens curtas, no imperativo, em português: `corrige parsing de duração hh:mm`, `adiciona check-in diário`.
- Um assunto por commit sempre que possível.

### Versão do app

O app tem uma constante `VER` no `index.html` (ex.: `'v67'`). **Ao fazer uma mudança visível ao usuário, incremente `VER`** — é o que sinaliza aos usuários que há versão nova (e ajuda no cache-busting do PWA).

---

## 4. Regras de segurança e dados (LEIA)

- **Nunca** commite segredos: chaves de API, `.env`, service accounts do Firebase, tokens ou dados pessoais. O [`.gitignore`](.gitignore) já bloqueia os padrões comuns, mas confira o `git status` antes de commitar.
- **Nunca** commite códigos de recuperação, senhas ou dados de atletas reais.
- Os dados dos atletas no Firestore são privados. As **regras de segurança** ficam em [`firebase/firestore.rules`](firebase/firestore.rules).
  - Só o dono escreve seus próprios documentos `pro_<uid>`.
  - O técnico vê performance/fadiga/composição/prontidão (score), mas **não** vê Saúde bruta (Garmin VFC/sono, exames, respostas cruas do check-in).
  - A conta de desenvolvedor tem leitura total; escrita em `pro_` continua exclusiva do dono.
  - **Mudou uma regra? Tem que publicá-la no console do Firebase** — o arquivo no repositório é só a fonte; ele não se aplica sozinho.
- A chave da IA (Anthropic) fica como **variável de ambiente no Cloudflare Worker** (`ANTHROPIC_API_KEY`), nunca no código. Veja [`backend/BACKEND-IA.md`](backend/BACKEND-IA.md).

---

## 5. Padrões de código

Siga o estilo já existente no `index.html`:

- Estado global em `S`; a UI é reconstruída chamando `render()`, que reescreve `#app`.
- Handlers via `onclick` inline chamando funções globais.
- Acesso ao Firestore pelos helpers `DB.get(k)` / `DB.set(k, v)` e pelas funções `k*` (`kUser`, `kEq`, `kPerf`, etc.). Não fale com o Firestore direto sem necessidade.
- Persistência offline está ativada; escritas são otimistas (atualiza a tela e depois confirma com "Salvo ✓").
- Mantenha a densidade de comentários e a nomenclatura do código ao redor.

---

## 6. Antes de abrir o Pull Request

- [ ] Testei a mudança no navegador (inclusive em largura de celular, ~400px).
- [ ] Não deixei `console.log` de depuração nem código morto.
- [ ] Não há segredos nem dados pessoais no diff (`git status` / revisão do diff).
- [ ] Incrementei `VER` se a mudança é visível ao usuário.
- [ ] Se mexi em `firestore.rules`, publiquei no console do Firebase.
- [ ] Atualizei `ARQUITETURA.md` se mudei a arquitetura ou adicionei um recurso relevante.

---

Dúvidas de arquitetura? Comece pelo [`ARQUITETURA.md`](ARQUITETURA.md). Bom trabalho! 🏊
