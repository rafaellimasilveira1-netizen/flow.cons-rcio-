import { carregar, acoes } from '../lib/regras.mjs';
import { chaveDe, json } from '../lib/auth.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  try {
    let c;
    try { c = JSON.parse((await req.text()) || '{}'); } catch { return json({ erro: 'Pedido inválido.' }, 400); }
    const fn = acoes[c.acao];
    if (!fn) return json({ erro: 'Ação desconhecida.' }, 400);
    const ctx = await carregar(chaveDe(req));
    const r = await fn(ctx, c);
    return json({ ok: true, ...r });
  } catch (e) {
    return json({ erro: e.message || 'Erro.', ...(e.extra || {}) }, e.status || 502);
  }
};
