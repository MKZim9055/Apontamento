// supabase-config.js

const SUPABASE_URL = 'https://mtlbrhmpiwvzjwbzaywi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qilTaEWSiDNr1L-N5uE5gA_NYyLkyBt';

// Cria e expõe o cliente globalmente
window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);