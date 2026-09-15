# PARCIAL — ligar a leitura por IA (passo a passo detalhado)

Isto dá ao app duas coisas que o navegador sozinho não faz:

1. **Ler PDF de imagem** (bioimpedância InBody, laudos escaneados/foto) e transcrever os valores.
2. **Gerar um laudo consolidado** escrito por IA (no padrão dos seus relatórios).

Como funciona: um pequeno servidor (**Cloudflare Worker**) guarda a sua chave da
Anthropic. O app só chama a URL desse servidor — a chave **nunca** aparece no app.

> **Custo:** o Worker é **grátis** (100 mil chamadas/dia, sem cartão). Cada
> leitura/laudo custa **centavos** da Anthropic (você paga por uso). Enquanto
> você não colar a URL no app (Parte 3), continua tudo como está.

Tempo total: ~15 minutos.

---

# PARTE 1 — Anthropic (a chave e o crédito)

### 1.1 Criar a conta
1. Abra <https://console.anthropic.com>.
2. **Sign up** (criar conta) com seu e-mail, ou entre com Google.
3. Confirme o e-mail se pedir.

### 1.2 Pôr um crédito (a API é pré-paga)
1. No canto, abra **Settings** (Configurações) → **Billing** (Faturamento).
   Pode aparecer como "Plans & Billing".
2. **Add payment method** → cadastre o cartão.
3. **Buy credits** / **Add credits** → compre **US$ 5** (dura muito para exames).

> Sem crédito, a leitura dá erro de cobrança. Com US$ 5 você faz centenas de leituras.

### 1.3 Gerar a chave
1. **Settings** → **API Keys**.
2. **Create Key** → dê um nome (ex.: `parcial`) → **Create**.
3. **Copie a chave agora** (`sk-ant-...`). Ela só aparece uma vez —
   guarde num bloco de notas por enquanto. Vai colar na Parte 2.6.

---

# PARTE 2 — Cloudflare (o servidor)

### 2.1 Criar a conta
1. Abra <https://dash.cloudflare.com>.
2. **Sign up** com e-mail e senha → confirme o e-mail.
   (Workers é grátis, **não pede cartão**.)

### 2.2 Criar o Worker
1. No menu à esquerda: **Workers & Pages** (pode aparecer como **Compute**).
2. **Create application** → **Create Worker**
   (ou "Start with Hello World"). Se pedir para escolher um **subdomínio**
   `algo.workers.dev`, escolha um nome e confirme.
3. Dê um nome ao Worker: `parcial-ia` → **Deploy**
   (ele cria um exemplo "Hello World").

### 2.3 Colar o nosso código
1. Na página do Worker, clique **Edit code** (ou **Quick edit**).
2. **Apague todo** o código de exemplo (Ctrl+A, Delete).
3. Abra o arquivo **`worker.js`** desta pasta, copie **tudo**, e **cole** no editor.
4. Clique **Deploy** (canto superior direito).

### 2.4 Guardar a chave da Anthropic (como segredo)
1. Volte para a página do Worker → **Settings**.
2. Procure **Variables and Secrets** (ou "Variables").
3. **Add** / **Add variable**:
   - **Type:** escolha **Secret** (Encrypt) — importante, para ficar oculto.
   - **Name / Variable name:** `ANTHROPIC_API_KEY` (exatamente assim).
   - **Value:** cole a chave `sk-ant-...` da Parte 1.3.
4. **Save** / **Deploy**.

### 2.5 Copiar a URL do Worker
No topo da página do Worker aparece o endereço, algo como:

```
https://parcial-ia.SEU-SUBDOMINIO.workers.dev
```

Copie essa URL. É ela que vai no app.

---

# PARTE 3 — Ligar no app

1. Abra o **`index.html`** e procure a linha (perto do começo do `<script>`):

   ```js
   const IA_URL='';
   ```

2. Cole a URL do Worker entre as aspas:

   ```js
   const IA_URL='https://parcial-ia.SEU-SUBDOMINIO.workers.dev';
   ```

3. Suba o `index.html` no GitHub (Add file → Upload files → Commit), como sempre.
4. Abra o app **furando o cache** (feche e reabra, ou puxe a página para baixo).

Agora aparecem os botões **"Ler por IA"** (no exame e na bioimpedância, na aba
**Saúde**) e **"Laudo por IA"** (no **Relatório**).

---

# PARTE 4 — Testar

1. No app (como PRO), aba **Saúde** → **Ler por IA** → escolha um PDF de exame.
2. Espere alguns segundos: deve abrir a ficha do exame já preenchida. Confira e
   **Salvar**.
3. Vá ao **Relatório** → **Laudo por IA** → deve aparecer o laudo em texto.

---

# PARTE 5 — Se der erro (a mensagem aparece na tela)

| Mensagem | O que significa | O que fazer |
|---|---|---|
| **falta configurar ANTHROPIC_API_KEY** | O segredo não foi salvo no Worker | Refaça a Parte 2.4 (nome exatamente `ANTHROPIC_API_KEY`) e Deploy |
| **origem não autorizada** | A URL do app não está na lista do Worker | No `worker.js`, confira a lista `ORIGENS_OK` (deve ter `https://parcial-natacao.github.io`). Corrija e Deploy |
| **Anthropic: ... credit / billing** | Falta crédito na Anthropic | Parte 1.2 (comprar crédito) |
| **Anthropic: 401 / authentication** | Chave errada ou incompleta | Gere outra chave (Parte 1.3) e atualize o segredo |
| Botão nem aparece | `IA_URL` vazio ou cache antigo | Confira a Parte 3 e reabra furando o cache |

---

# Manutenção

- **Baratear:** no `worker.js`, troque `const MODELO = 'claude-opus-5'` por
  `'claude-sonnet-5'` (bom, ~metade do preço) ou `'claude-haiku-4-5'` (o mais
  barato). Re-cole e **Deploy**.
- **Trocar a URL do app:** se o endereço do GitHub Pages mudar, edite a lista
  `ORIGENS_OK` no topo do `worker.js`.
- **Segurança:** a IA lê muito bem laudos limpos, mas pode errar um dígito em
  foto tremida — por isso o app **sempre abre os valores para você conferir
  antes de salvar**. E o Worker só aceita chamadas vindas do endereço do seu
  app, para ninguém gastar sua chave.
