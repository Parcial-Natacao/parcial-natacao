# PARCIAL — ligar a sincronia entre pessoas (Firebase)

Guia para sair do "cada aparelho por si" e chegar em **técnico e atletas
compartilhando os mesmos dados, cada um com a sua conta**, com login de
verdade e recuperação de senha por e-mail.

O código do app **já está pronto** para o Firebase. O que falta é criar o
projeto no console e colar a configuração. Nada de programar.

> Enquanto o bloco `FB_CONFIG` do `index.html` estiver com os campos vazios,
> o app continua funcionando só neste aparelho (modo de teste). Ele só entra
> em "modo em rede" quando você preencher a configuração.

---

## 1. Criar (ou reaproveitar) o projeto no Firebase

Acesse <https://console.firebase.google.com>.

- **Novo projeto** (recomendado, mantém o PARCIAL separado do Controle de OS):
  "Adicionar projeto" → nome `parcial` → pode desligar o Google Analytics.
- Ou **reaproveitar o projeto do Controle de OS**: também funciona, os dados
  do PARCIAL ficam numa coleção própria (`kv`) e não se misturam.

## 2. Ativar o login por e-mail e senha

Menu lateral → **Authentication** → "Vamos começar" → aba **Sign-in method**
→ **E-mail/senha** → ativar → salvar.

## 3. Criar o banco Firestore

Menu lateral → **Firestore Database** → "Criar banco de dados" →
**modo de produção** → escolher a região `southamerica-east1` (São Paulo) →
ativar.

## 4. Publicar as regras de segurança

Ainda no Firestore, aba **Regras**. Apague o que estiver lá, cole o conteúdo
do arquivo [`firestore.rules`](firestore.rules) desta pasta e clique
**Publicar**. É isso que garante que os dados PRO (Garmin, marcas) fiquem
privados — nem o técnico enxerga.

## 5. Registrar o app web e copiar a configuração

Engrenagem ⚙ (ao lado de "Visão geral do projeto") → **Configurações do
projeto** → role até **Seus aplicativos** → ícone **`</>`** (Web) → dê um
apelido (`parcial`) → registrar.

Vai aparecer um bloco `const firebaseConfig = { ... }`. Copie os valores e
cole no **`index.html`**, no bloco `FB_CONFIG` (logo no começo do `<script>`):

```js
const FB_CONFIG={
  apiKey:'AIza...........',
  authDomain:'parcial-xxxx.firebaseapp.com',
  projectId:'parcial-xxxx',
  storageBucket:'parcial-xxxx.appspot.com',
  messagingSenderId:'000000000000',
  appId:'1:0000:web:xxxxxxxx'
};
```

> Essa chave pode ficar no código publicado — ela é pública de propósito.
> Quem protege os dados são as **regras** do passo 4.

## 6. Autorizar o endereço do GitHub Pages

Authentication → aba **Settings** → **Authorized domains** → **Add domain** →
adicione `SEU_USUARIO.github.io` (o domínio onde o app fica publicado). Sem
isso o login é recusado no ar. O `localhost` já vem autorizado para testes.

## 7. Publicar

Suba o `index.html` no GitHub Pages como você já fez com o Controle de OS
(README explica). Abra o endereço: a etiqueta no cabeçalho deve mostrar
**"em rede"**.

---

## Primeiro uso, na ordem certa

1. **Você entra como Técnico** e cria a equipe (basta escolher o perfil
   Técnico no cadastro e informar o nome da equipe). A equipe nasce nesse
   momento.
2. No **Elenco**, você libera os **CPFs** dos atletas e define o nível de cada
   um. Sem CPF liberado, o atleta não consegue criar conta — é a trava da
   equipe, de propósito.
3. Cada **atleta** cria a conta com o próprio e-mail, senha e o CPF liberado.
4. **Você, como PRO:** cadastre-se também no perfil **Atleta PRO** usando o
   código mestre (`CODIGO_PRO` no topo do `index.html`, hoje
   `BARBATO-PRO-2026`). O PRO não depende de liberação.

A partir daí, o que um lança o outro vê em segundos, no computador e no
celular.

---

## Detalhes bons de saber

- **Recuperação de senha:** já sai e-mail de verdade (o link é a página do
  próprio Firebase). Dá para personalizar o texto em Authentication →
  Templates → "Redefinição de senha", inclusive traduzir para português.
- **Dados de demonstração:** os botões "Ver como..." **não funcionam** no modo
  em rede — lá as contas são reais. Eles seguem valendo no modo de teste
  (config vazia).
- **Backup:** continua funcionando como rede de segurança (cabeçalho →
  etiqueta de modo → Exportar backup).
- **Custo:** o plano gratuito Spark do Firebase cobra de sobra uma equipe
  desse tamanho.

## O que fica para a Etapa 2

Hoje qualquer pessoa logada consegue, em tese, escrever em treinos e
competições (a regra "só o técnico edita" está no app, não no banco). Os dados
PRO já estão travados de verdade. Na Etapa 2 migramos a ponte chave-valor para
tabelas reais e passamos essa separação de perfis para dentro do banco — o
modelo-alvo já está desenhado em [`../supabase/schema.sql`](../supabase/schema.sql)
e vale como referência das permissões, mesmo usando Firebase.
