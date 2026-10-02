/* ─────────────────────────────────────────────────────────────────────────
   PARCIAL — service worker

   PARA QUE SERVE
     • instalar o app de verdade (ícone, tela cheia, sem barra do navegador);
     • funcionar sem internet: à beira da piscina o sinal costuma cair, e o
       treino tem que abrir mesmo assim;
     • RESOLVER O CACHE. O GitHub Pages serve o index.html com
       `Cache-Control: max-age=600`, e sem service worker o navegador entregava
       a cópia velha por até 10 minutos — o que já fez uma correção recém
       publicada parecer que não tinha funcionado.

   REGRA DE OURO DESTE ARQUIVO: **rede primeiro para o HTML.**
   Um service worker mal escrito faz o oposto (cache primeiro) e prende o
   usuário numa versão antiga de forma muito difícil de desfazer. Aqui o
   cache do documento é só rede de segurança para quando não há conexão.

   Se algum dia for preciso desligar tudo: mande a mensagem 'desligar' pelo
   console — navigator.serviceWorker.controller.postMessage('desligar')
   ───────────────────────────────────────────────────────────────────────── */

/* ⚠️ INCREMENTE `VERSAO` SEMPRE que mudar QUALQUER arquivo da lista abaixo.
   O nome do cache deriva dela; sem incrementar, o cache antigo continua sendo
   servido e o arquivo novo nunca chega. Aconteceu na v86: o ícone foi trocado,
   a VERSAO não, e o app seguiu mostrando o ícone velho. */
const VERSAO = 'v100';
const CACHE  = 'parcial-' + VERSAO;
/* Os ícones têm NOME versionado (app-icone-*) em vez de `?v=`: para o ícone da
   tela de início o iOS às vezes ignora a query e guarda por caminho, e o ícone
   antigo continuava aparecendo mesmo com tudo certo no servidor. Trocar o nome
   do arquivo é o único jeito que funciona sempre. */
const ESSENCIAIS = ['./', './index.html', './manifest.webmanifest',
                    './icone-r2-192.png', './icone-r2-512.png', './icone-r2-180.png'];

self.addEventListener('install', e => {
  self.skipWaiting();                       /* versão nova assume sem esperar */
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESSENCIAIS)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    /* apaga os caches das versões anteriores — senão eles se acumulam e um
       arquivo velho pode ressuscitar */
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }

  /* Só cuidamos do NOSSO site. Firebase, fontes e CDN passam direto: o app
     precisa dos dados sempre frescos, e cachear autenticação daria problema. */
  if (url.origin !== self.location.origin) return;

  const ehDocumento = req.mode === 'navigate'
    || url.pathname.endsWith('/') || url.pathname.endsWith('.html');

  if (ehDocumento) {
    /* REDE PRIMEIRO: se há internet, o usuário recebe SEMPRE a versão nova. */
    e.respondWith((async () => {
      try {
        const r = await fetch(req, { cache: 'no-store' });
        if (r && r.ok) { const c = await caches.open(CACHE); c.put('./index.html', r.clone()); }
        return r;
      } catch (_) {
        const c = await caches.match('./index.html');
        return c || new Response('<h1>Sem conexão</h1><p>Abra o app uma vez com internet.</p>',
          { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 503 });
      }
    })());
    return;
  }

  /* Estáticos nossos (ícones, manifest): cache primeiro, atualizando atrás. */
  e.respondWith((async () => {
    const cacheado = await caches.match(req);
    const daRede = fetch(req).then(r => {
      if (r && r.ok) caches.open(CACHE).then(c => c.put(req, r.clone()));
      return r;
    }).catch(() => null);
    return cacheado || (await daRede) || new Response('', { status: 504 });
  })());
});

/* Válvula de escape: desliga o service worker e limpa tudo. */
self.addEventListener('message', async e => {
  if (e.data === 'desligar') {
    const ks = await caches.keys();
    await Promise.all(ks.map(k => caches.delete(k)));
    await self.registration.unregister();
  }
});
