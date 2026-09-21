// Incremente a versão sempre que alterar arquivos do app
const CACHE_NAME = 'apontamentos-cache-v3';

const ASSETS = [
    './',
    './login.html',           // Tela inicial obrigatória
    './index.html',
    './listaapontamento.html', // Nome alinhado (um 'a')
    './novoapontamento.html',
    './relatorios.html',
    './manifest.json',
    './icoapontamento.png'
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

    // Ignora chamadas de API do Supabase e CDN externa (deixa trafegar direto pela rede)
    if (url.origin.includes('supabase.co') || event.request.method !== 'GET') {
        return;
    }

    // Estratégia Network First para Navegação (Páginas HTML)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    // Guarda cópia atualizada no cache se a rede respondeu com sucesso
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Sem internet: entrega a página salva em cache ou redireciona para login
                    return caches.match(event.request).then((cachedResponse) => {
                        return cachedResponse || caches.match('./login.html');
                    });
                })
        );
        return;
    }

    // Estratégia Cache First com fallback de rede para imagens, ícones e assets estáticos
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