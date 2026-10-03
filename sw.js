// sw.js - Service Worker PWA com Suporte Nativo a Web Push (VAPID)

// Incremente a versão para forçar a atualização imediata em todos os aparelhos
const CACHE_NAME = 'apontamentos-cache-v7';

const ASSETS = [
    './',
    './login.html',
    './index.html',
    './listaapontamento.html',
    './novoapontamento.html',
    './relatorios.html',
    './configuracoes.html',
    './direct.html',
    './supabase-config.js',
    './db.js',
    './manifest.json',
    './icoapontamento.png',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// 1. Instalação e Pré-cache dos Assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting(); // Assume controle imediato sem esperar fechar as abas
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
    self.clients.claim(); // Força todas as páginas abertas a usarem este SW ativo
});

// 3. Interceptação de Requisições (Cache & Network)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ignora requisições de API, chamadas ao Supabase, Vercel APIs e métodos não-GET
    if (
        url.origin.includes('supabase.co') ||
        url.pathname.startsWith('/api/') ||
        event.request.method !== 'GET'
    ) {
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
                    return caches.match(event.request).then((cachedResponse) => {
                        return cachedResponse || caches.match('./login.html');
                    });
                })
        );
        return;
    }

    // Estratégia Stale-While-Revalidate para Scripts, CSS, Imagens e CDNs
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

// 4. Recebimento de Push Notification (Tela apagada / App fechado)
self.addEventListener('push', (event) => {
    let payload = {
        title: 'Direct & Avisos',
        body: 'Você recebeu uma nova mensagem!',
        url: './direct.html'
    };

    if (event.data) {
        try {
            payload = Object.assign(payload, event.data.json());
        } catch (_) {
            payload.body = event.data.text();
        }
    }

    const options = {
        body: payload.body,
        icon: './icoapontamento.png',
        badge: './icoapontamento.png',
        vibrate: [200, 100, 200],
        tag: `push-msg-${Date.now()}`,
        renotify: true,
        data: {
            url: payload.url || './direct.html'
        }
    };

    event.waitUntil(
        self.registration.showNotification(payload.title, options)
    );
});

// 5. Clique na Notificação (Foca na aba aberta ou abre o Direct)
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = new URL(event.notification.data?.url || './direct.html', self.location.origin).href;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Se já houver aba aberta no direct, foca nela
            for (const client of windowClients) {
                if (client.url.includes('direct.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            // Se houver qualquer outra aba do app aberta, foca e redireciona para o direct
            for (const client of windowClients) {
                if ('focus' in client && 'navigate' in client) {
                    client.focus();
                    return client.navigate(targetUrl);
                }
            }
            // Se o app estiver totalmente fechado, abre uma nova janela/aba
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});