// api/enviar-push.js
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails(
    'mailto:suporte@apontamento.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Método não permitido');

    const { record } = req.body;
    if (!record) return res.status(400).send('Sem dados');

    const tipo = (record.tipo_destino || '').toLowerCase().trim();
    const destino = (record.destino || '').toLowerCase().trim();
    const remetenteMat = (record.remetente_matricula || '').toLowerCase().trim();
    const remetenteNom = record.remetente_nome || 'Direct';
    const conteudo = record.conteudo || 'Nova mensagem!';

    // Busca inscrições no banco
    let query = supabase.from('pwa_push_subscriptions').select('*');
    if (tipo === 'usuario') {
        query = query.eq('matricula', destino);
    } else if (tipo === 'grupo') {
        query = query.eq('grupo', destino);
    }

    const { data: subs } = await query;

    if (!subs || subs.length === 0) {
        return res.status(200).json({ message: 'Nenhum inscrito' });
    }

    const payload = JSON.stringify({
        title: tipo === 'todos' ? `📢 Aviso Geral (${remetenteNom})` : `💬 Direct de ${remetenteNom}`,
        body: conteudo,
        url: './direct.html'
    });

    const envios = subs
        .filter(s => s.matricula !== remetenteMat)
        .map(s => {
            const pushConfig = {
                endpoint: s.endpoint,
                keys: { p256dh: s.p256dh, auth: s.auth }
            };
            return webpush.sendNotification(pushConfig, payload).catch(err => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    supabase.from('pwa_push_subscriptions').delete().eq('endpoint', s.endpoint);
                }
            });
        });

    await Promise.all(envios);
    return res.status(200).json({ sucesso: true, enviados: envios.length });
};