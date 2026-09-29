// db.js - Gerenciador do Banco Local IndexedDB
const DB_NAME = 'ApontamentoAppDB';
const DB_VERSION = 4; // Versão 4 garante tabelas e índices limpos

const LocalDB = {
    _db: null,

    // 1. Abre a conexão e cria/atualiza as tabelas (Object Stores)
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

                // Tabela de Setores (coluna 'nome')
                if (!db.objectStoreNames.contains('setores')) {
                    const storeSetores = db.createObjectStore('setores', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    storeSetores.createIndex('nome', 'nome', { unique: true });
                }

                // Tabela de Grupos (coluna 'grupo')
                if (!db.objectStoreNames.contains('grupos')) {
                    const storeGrupos = db.createObjectStore('grupos', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    storeGrupos.createIndex('grupo', 'grupo', { unique: true });
                }
            };

            request.onsuccess = (event) => {
                this._db = event.target.result;
                resolve(this._db);
            };

            request.onerror = (event) => {
                console.error("[LocalDB] Erro ao abrir IndexedDB:", event.target.error);
                reject(event.target.error);
            };
        });
    },

    // -------------------------------------------------------------
    // MÉTODOS DE GRUPOS (Tabela Supabase: 'grupos' | Coluna: 'grupo')
    // -------------------------------------------------------------
    async salvarGrupo(nomeGrupo, nuvemId = null) {
        const db = await this.abrirConexao();
        const valor = (nomeGrupo || '').trim();
        if (!valor) return;

        return new Promise((resolve, reject) => {
            const tx = db.transaction(['grupos'], 'readwrite');
            const store = tx.objectStore('grupos');
            const indexGrupo = store.index('grupo');
            const checkReq = indexGrupo.get(valor);

            checkReq.onsuccess = () => {
                const existente = checkReq.result;
                if (!existente) {
                    store.add({
                        grupo: valor,
                        nome: valor,
                        nuvem_id: nuvemId || valor
                    });
                }
            };

            tx.oncomplete = async () => {
                await this._atualizarCacheGrupos();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    },

    async sincronizarGruposLocais(listaGruposNuvem) {
        if (!Array.isArray(listaGruposNuvem)) return;
        const db = await this.abrirConexao();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(['grupos'], 'readwrite');
            const store = tx.objectStore('grupos');

            const clearReq = store.clear();
            clearReq.onsuccess = () => {
                listaGruposNuvem.forEach(g => {
                    // Pega o valor da coluna 'grupo' do Supabase
                    const valor = typeof g === 'string' ? g.trim() : (g.grupo || g.nome || '').trim();
                    if (valor) {
                        store.add({
                            grupo: valor,
                            nome: valor,
                            nuvem_id: valor
                        });
                    }
                });
            };

            tx.oncomplete = async () => {
                await this._atualizarCacheGrupos();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    },

    async obterGrupos() {
        const db = await this.abrirConexao();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['grupos'], 'readonly');
            const store = tx.objectStore('grupos');
            const request = store.getAll();

            request.onsuccess = () => {
                const resultados = (request.result || []).map(r => ({
                    ...r,
                    grupo: r.grupo || r.nome,
                    nome: r.grupo || r.nome
                }));
                resolve(resultados);
            };
            request.onerror = () => reject(request.error);
        });
    },

    async excluirGrupoPorNome(nomeGrupo) {
        const db = await this.abrirConexao();
        const valor = (nomeGrupo || '').trim();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(['grupos'], 'readwrite');
            const store = tx.objectStore('grupos');
            const index = store.index('grupo');
            const req = index.getKey(valor);

            req.onsuccess = () => {
                if (req.result !== undefined) {
                    store.delete(req.result);
                }
            };

            tx.oncomplete = async () => {
                await this._atualizarCacheGrupos();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    },

    async _atualizarCacheGrupos() {
        try {
            const grupos = await this.obterGrupos();
            const nomes = grupos.map(g => g.grupo).filter(Boolean);
            localStorage.setItem('GruposCache', JSON.stringify(nomes));
        } catch (e) {
            console.warn("[LocalDB] Falha ao atualizar GruposCache:", e);
        }
    },

    // -------------------------------------------------------------
    // MÉTODOS DE SETORES (Tabela Supabase: 'setores' | Coluna: 'nome')
    // -------------------------------------------------------------
    async salvarSetor(nomeSetor, nuvemId = null) {
        const db = await this.abrirConexao();
        const valor = (nomeSetor || '').trim();
        if (!valor) return;

        return new Promise((resolve, reject) => {
            const tx = db.transaction(['setores'], 'readwrite');
            const store = tx.objectStore('setores');
            const indexNome = store.index('nome');
            const checkReq = indexNome.get(valor);

            checkReq.onsuccess = () => {
                const existente = checkReq.result;
                if (!existente) {
                    store.add({
                        nome: valor,
                        nuvem_id: nuvemId || valor
                    });
                }
            };

            tx.oncomplete = async () => {
                await this._atualizarCacheSetores();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    },

    async sincronizarSetoresLocais(listaSetoresNuvem) {
        if (!Array.isArray(listaSetoresNuvem)) return;
        const db = await this.abrirConexao();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(['setores'], 'readwrite');
            const store = tx.objectStore('setores');

            const clearReq = store.clear();
            clearReq.onsuccess = () => {
                listaSetoresNuvem.forEach(s => {
                    // Pega o valor da coluna 'nome' do Supabase
                    const valor = typeof s === 'string' ? s.trim() : (s.nome || '').trim();
                    const nuvemId = typeof s === 'object' ? (s.id || valor) : valor;
                    if (valor) {
                        store.add({
                            nome: valor,
                            nuvem_id: nuvemId
                        });
                    }
                });
            };

            tx.oncomplete = async () => {
                await this._atualizarCacheSetores();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    },

    async obterSetores() {
        const db = await this.abrirConexao();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['setores'], 'readonly');
            const store = tx.objectStore('setores');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    async excluirSetorPorNome(nomeSetor) {
        const db = await this.abrirConexao();
        const valor = (nomeSetor || '').trim();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(['setores'], 'readwrite');
            const store = tx.objectStore('setores');
            const index = store.index('nome');
            const req = index.getKey(valor);

            req.onsuccess = () => {
                if (req.result !== undefined) {
                    store.delete(req.result);
                }
            };

            tx.oncomplete = async () => {
                await this._atualizarCacheSetores();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        });
    },

    async _atualizarCacheSetores() {
        try {
            const setores = await this.obterSetores();
            const nomes = setores.map(s => s.nome).filter(Boolean);
            localStorage.setItem('SetoresCache', JSON.stringify(nomes));
        } catch (e) {
            console.warn("[LocalDB] Falha ao atualizar SetoresCache:", e);
        }
    },

    // -------------------------------------------------------------
    // MÉTODOS DE APONTAMENTOS (O.S.)
    // -------------------------------------------------------------
    async salvarApontamento(apontamento) {
        const db = await this.abrirConexao();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['apontamentos'], 'readwrite');
            const store = tx.objectStore('apontamentos');

            const itemSalvar = { ...apontamento };
            if (!itemSalvar.id) delete itemSalvar.id;

            const request = store.put(itemSalvar);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

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

    async excluirApontamento(id) {
        const db = await this.abrirConexao();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['apontamentos'], 'readwrite');
            const store = tx.objectStore('apontamentos');
            const request = store.delete(Number(id));

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
};

window.LocalDB = LocalDB;