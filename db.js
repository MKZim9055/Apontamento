// db.js - Gerenciador do Banco Local IndexedDB
const DB_NAME = 'ApontamentoAppDB';
const DB_VERSION = 1;

const LocalDB = {
    _db: null,

    // 1. Abre a conexão e cria as tabelas (Object Stores) se não existirem
    async abrirConexao() {
        if (this._db) return this._db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Tabela de Apontamentos
                if (!db.objectStoreNames.contains('apontamentos')) {
                    const storeApontamentos = db.createObjectStore('apontamentos', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    storeApontamentos.createIndex('ordem_servico', 'ordem_servico', { unique: false });
                    storeApontamentos.createIndex('data', 'data', { unique: false });
                    storeApontamentos.createIndex('data_sincronizado', 'data_sincronizado', { unique: false });
                }

                // Tabela de Setores (para cache offline)
                if (!db.objectStoreNames.contains('setores')) {
                    const storeSetores = db.createObjectStore('setores', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    storeSetores.createIndex('nome', 'nome', { unique: true });
                }
            };

            request.onsuccess = (event) => {
                this._db = event.target.result;
                resolve(this._db);
            };

            request.onerror = (event) => {
                console.error("Erro ao abrir IndexedDB:", event.target.error);
                reject(event.target.error);
            };
        });
    },

    // -------------------------------------------------------------
    // MÉTODOS DE APONTAMENTOS
    // -------------------------------------------------------------

    // Salvar ou Atualizar Apontamento
    async salvarApontamento(apontamento) {
        const db = await this.abrirConexao();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['apontamentos'], 'readwrite');
            const store = tx.objectStore('apontamentos');

            // Se tiver ID numérico válido, atualiza (put); caso contrário, insere (add)
            const itemSalvar = { ...apontamento };
            if (!itemSalvar.id) delete itemSalvar.id;

            const request = store.put(itemSalvar);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // Obter todos os apontamentos locais
    async obterApontamentosLocais() {
        const db = await this.abrirConexao();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['apontamentos'], 'readonly');
            const store = tx.objectStore('apontamentos');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    // Obter um apontamento específico por ID
    async obterApontamentoPorId(id) {
        const db = await this.abrirConexao();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['apontamentos'], 'readonly');
            const store = tx.objectStore('apontamentos');
            const request = store.get(Number(id));

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // Excluir um apontamento por ID
    async excluirApontamento(id) {
        const db = await this.abrirConexao();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['apontamentos'], 'readwrite');
            const store = tx.objectStore('apontamentos');
            const request = store.delete(Number(id));

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    },

    // -------------------------------------------------------------
    // MÉTODOS DE SETORES (Cache Offline)
    // -------------------------------------------------------------

    // Salva ou atualiza um setor
    async salvarSetor(nome, nuvemId = null) {
        const db = await this.abrirConexao();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['setores'], 'readwrite');
            const store = tx.objectStore('setores');
            const indexNome = store.index('nome');
            const checkReq = indexNome.get(nome);

            checkReq.onsuccess = () => {
                const existente = checkReq.result;
                if (!existente) {
                    store.add({ nome: nome, nuvem_id: nuvemId });
                }
                resolve();
            };

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    // Lista todos os setores salvos localmente
    async obterSetores() {
        const db = await this.abrirConexao();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['setores'], 'readonly');
            const store = tx.objectStore('setores');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }
};

// Torna o objeto acessível globalmente em qualquer script
window.LocalDB = LocalDB;