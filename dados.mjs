import { carregar, paraFront } from '../lib/regras.mjs';
import { chaveDe, json } from '../lib/auth.mjs';

export default async (req) => {
  try {
    const ctx = await carregar(chaveDe(req));
    return json(paraFront(ctx));
  } catch (e) {
    return json({ erro: e.message || 'Erro ao ler a planilha.' }, e.status || 502);
  }
};
