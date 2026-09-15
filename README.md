# PARCIAL — prancheta digital de natação

Aplicativo web de página única para equipes de natação masters. Um arquivo,
sem build, sem dependências instaladas. Abre em qualquer navegador e se
comporta como app instalado no iPhone.

**Versão atual:** v08
**Autor do conteúdo técnico:** Bruno Barbato (atleta e engenheiro)
**Contexto:** equipe de natação masters, Campo Grande — MS

---

## Publicar no GitHub Pages

```bash
git init
git add index.html
git commit -m "PARCIAL v08"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/parcial.git
git push -u origin main
```

Depois, no GitHub: **Settings › Pages › Source: Deploy from a branch ›
main / (root) › Save**. Em um ou dois minutos o endereço fica no ar:

```
https://SEU_USUARIO.github.io/parcial/
```

O arquivo **precisa** se chamar `index.html` e ficar na raiz do repositório.

### Instalar no iPhone

Abrir o endereço no **Safari** (não funciona pelo Chrome no iOS), tocar em
Compartilhar › **Adicionar à Tela de Início**. O app abre em tela cheia, sem
barra de navegador. Os metadados `apple-mobile-web-app-*` já estão no arquivo.

> Um arquivo `.html` baixado e aberto pelo app Arquivos do iPhone **não
> funciona** — o iOS mostra o código-fonte. Só funciona por URL, no Safari.

---

## Onde os dados moram

O app detecta o ambiente sozinho e mostra o modo na etiqueta do cabeçalho:

| Modo | Quando acontece | Sincroniza? |
|---|---|---|
| **em rede** | publicado como artefato da Claude (`window.storage` disponível) | sim, entre todos os usuários |
| **neste aparelho** | GitHub Pages ou qualquer host estático (`localStorage`) | não |
| **temporário** | navegador sem armazenamento | não |

A camada de dados está isolada no objeto `DB` (funções `get` e `set`), no topo
do bloco `<script>`. **Trocar de armazenamento significa reescrever só esse
objeto** — nenhuma tela precisa ser tocada.

### Backup

Enquanto não houver servidor, o backup é a rede de segurança. Cabeçalho ›
etiqueta de modo › **Exportar backup** gera um JSON com contas, treinos,
competições e dados PRO. A importação restaura tudo.

---

## Estrutura sugerida ao migrar para Supabase

```
parcial/
├── index.html
├── README.md
├── ESPECIFICACAO.md
└── supabase/
    ├── schema.sql       -- tabelas e políticas de acesso
    └── db-adapter.js    -- substituto do objeto DB
```

---

## Pendências conhecidas

1. **Sincronia em host estático** — resolvida apenas no modo "em rede".
   Migração para Supabase descrita em `ESPECIFICACAO.md`.
2. **E-mail de recuperação de senha** — o fluxo existe e gera token com
   validade de 2 horas, mas o envio precisa de servidor. Hoje o link é
   exibido para cópia manual.
3. **Leitura do balizamento por foto** — funciona apenas no modo "em rede",
   onde a chamada à API é autenticada pela plataforma. Em host estático a
   chave não pode ser embutida; precisa de função de borda.
4. **Senhas** — guardadas como SHA-256 com sal por usuário. Melhor que texto
   puro, mas não substitui autenticação real. Some junto com o item 2.

## Licença

Uso privado da equipe.
