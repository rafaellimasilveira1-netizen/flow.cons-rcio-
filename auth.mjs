import crypto from 'node:crypto';
export const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const SIM = ['sim', 's', 'ativo', 'ativa', 'yes', 'true', '1', 'x'];
const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const perfilDe = (p) => { const n = norm(p); if (n.startsWith('gest')) return 'gestor'; if (n.startsWith('sdr')) return 'sdr'; if (n.startsWith('clos')) return 'closer'; return null; };
export const ativo = (v) => SIM.includes(norm(v));

/** Aba Acessos: Nome | Perfil | Chave | Ativo | Link | Link fixo do Meet. Devolve {perfil, nome} ou null. */
export function acharAcesso(v, chave) {
  const k = String(chave || '').trim();
  if (!k || !v || v.length < 2) return null;
  const h = v[0].map(norm);
  const ix = { nome: h.indexOf('nome'), perfil: h.indexOf('perfil'), chave: h.indexOf('chave'), ativo: h.indexOf('ativo') };
  if (ix.chave < 0 || ix.ativo < 0 || ix.perfil < 0 || ix.nome < 0) return null;
  for (let i = 1; i < v.length; i++) {
    const r = v[i] || [];
    const kk = String(r[ix.chave] == null ? '' : r[ix.chave]).trim();
    if (!kk || !igual(kk, k) || !ativo(r[ix.ativo])) continue;
    const perfil = perfilDe(r[ix.perfil]);
    if (!perfil) continue;
    return { perfil, nome: String(r[ix.nome] || '').trim() };
  }
  return null;
}
export const chaveDe = (req) => (req.headers.get('x-acesso') || '').trim();
export const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
