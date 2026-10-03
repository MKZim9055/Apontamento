// api/enviar-push.js
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    // 1. Permite apenas POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        // 2. Garante parsing correto do body vindo do pg_net
        let bodyData = req.body;
        if (typeof bodyData === 'string') {
            try {
                bodyData = JSON.parse(bodyData);
            } catch (_) { }
        }

        // Substitua:
        // const record = bodyData?.record;

        // Por:
        const record = bodyData?.record || bodyData;

        if (!record || (!record.conteudo && !record.tipo_destino)) {
            return res.status(400).json({ error: 'Nenhum registro encontrado no payload' });
        }

        // 3. Validação das variáveis de ambiente essenciais
        const {
            VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY,
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY
        } = process.env;

        if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            console.error('Variáveis de ambiente ausentes na Vercel.');
            return res.status(500).json({ error: 'Configurações de servidor incompletas' });
        }

        // 4. Configura VAPID e Supabase
        webpush.setVapidDetails(
            'mailto:suporte@apontamento.com',
            VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY
        );

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 5. Dados da mensagem
        const tipo = String(record.tipo_destino || '').toLowerCase().trim();
        const destino = String(record.destino || '').trim();
        const remetenteMat = String(record.remetente_matricula || '').toLowerCase().trim();
        const remetenteNom = record.remetente_nome || 'Direct';
        const conteudo = record.conteudo || 'Nova mensagem!';

        // 6. Busca os inscritos usando ilike (insensível a maiúsculas/minúsculas)
        let query = supabase.from('pwa_push_subscriptions').select('*');

        if (tipo === 'usuario') {
            query = query.ilike('matricula', destino);
        } else if (tipo === 'grupo') {
            query = query.ilike('grupo', destino);
        }
        // Se tipo === 'todos', a query traz todos os registros

        const { data: subs, error: dbError } = await query;

        if (dbError) {
            console.error('Erro ao consultar inscrições:', dbError);
            return res.status(500).json({ error: dbError.message });
        }

        if (!subs || subs.length === 0) {
            return res.status(200).json({ message: 'Nenhum destinatário inscrito encontrado' });
        }

        // 7. Monta o pacote de Push
        const titulo = (tipo === 'todos' || destino.toLowerCase() === 'todos')
            ? `📢 Aviso Geral (${remetenteNom})`
            : `💬 Direct de ${remetenteNom}`;

        const payload = JSON.stringify({
            title: titulo,
            body: conteudo,
            url: './direct.html'
        });

        // 8. Dispara para os celulares (ignora o próprio remetente)
        const promessas = subs
            .filter(s => String(s.matricula || '').toLowerCase().trim() !== remetenteMat)
            .map(s => {
                const pushConfig = {
                    endpoint: s.endpoint,
                    keys: {
                        p256dh: s.p256dh,
                        auth: s.auth
                    }
                };

                return webpush.sendNotification(pushConfig, payload).catch(err => {
                    // Se o aparelho desinstalou o PWA ou revogou permissão (404/410), remove do banco
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        return supabase
                            .from('pwa_push_subscriptions')
                            .delete()
                            .eq('endpoint', s.endpoint);
                    }
                    console.warn('Falha individual no envio:', err.message);
                });
            });

        await Promise.all(promessas);

        return res.status(200).json({
            sucesso: true,
            total_inscritos: subs.length,
            enviados: promessas.length
        });
    } catch (err) {
        console.error('Erro geral no endpoint:', err);
        return res.status(500).json({ error: err.message || 'Erro interno no servidor' });
    }
};