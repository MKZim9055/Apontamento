// Incremente a versão sempre que alterar arquivos do app
const CACHE_NAME = 'apontamentos-cache-v4';

const ASSETS = [
    './',
    './login.html',
    './index.html',
    './listaapontamento.html',
    './novoapontamento.html',
    './relatorios.html',
    './configuracoes.html',
    './direct.html',
    './db.js',                       // ESSENCIAL: Camada IndexedDB local
    './manifest.json',
    './icoapontamento.png',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2' // ESSENCIAL: SDK do Supabase offline
];

// 1. Instalação e Cache Inicial dos Assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// 2. Limpeza de Caches Antigos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// 3. Interceptação de Requisições
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ignora chamadas diretas à API REST do Supabase e métodos que não sejam GET
    // (O tratamento offline dos dados é feito pelo db.js via IndexedDB)
    if (url.origin.includes('supabase.co') || event.request.method !== 'GET') {
        return;
    }

    // Estratégia Network First para Navegação (Páginas HTML)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Sem internet: entrega a página salva em cache ou o fallback para login.html
                    return caches.match(event.request).then((cachedResponse) => {
                        return cachedResponse || caches.match('./login.html');
                    });
                })
        );
        return;
    }

    // Estratégia Cache First com fallback de rede para scripts, CSS, CDN e imagens
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            });
        })
    );
});