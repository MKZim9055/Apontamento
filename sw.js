// Incremente sempre que fizer alterações que precisem forçar a limpeza imediata
const CACHE_NAME = 'apontamentos-cache-v5';

const ASSETS = [
    './',
    './login.html',
    './index.html',
    './listaapontamento.html',
    './novoapontamento.html',
    './relatorios.html',
    './configuracoes.html',
    './direct.html',
    './supabase-config.js',                             // Incluído para suporte offline
    './db.js',                                         // Camada IndexedDB local
    './manifest.json',
    './icoapontamento.png',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// 1. Instalação e Cache Inicial dos Assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting(); // Assume o controle imediatamente
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
    self.clients.claim(); // Força todas as abas e instâncias do PWA a usarem o novo SW
});

// 3. Interceptação de Requisições
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ignora chamadas ao Supabase ou requisições que não sejam GET
    if (url.origin.includes('supabase.co') || event.request.method !== 'GET') {
        return;
    }

    // Estratégia Network First para Navegação (Páginas HTML)
    // Se tiver rede, busca a tela nova na Vercel; se offline, serve o cache
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
                    return caches.match(event.request).then((cachedResponse) => {
                        return cachedResponse || caches.match('./login.html');
                    });
                })
        );
        return;
    }

    // Estratégia Stale-While-Revalidate para Scripts, CSS, Imagens e CDNs
    // Retorna o cache para ser rápido/offline, mas busca a versão nova na rede em segundo plano
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => null);

            return cachedResponse || fetchPromise;
        })
    );
});