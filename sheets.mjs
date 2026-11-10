import crypto from 'node:crypto';

/* O ID da planilha vem só das variáveis do Netlify (nada fixo no código). */
const b64 = (x) => Buffer.from(x).toString('base64url');
let cache = { token: null, exp: 0 };

function credenciais() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    const j = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    return { email: j.client_email, key: j.private_key };
  }
  return { email: process.env.GOOGLE_CLIENT_EMAIL, key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n') };
}

async function token() {
  const agora = Math.floor(Date.now() / 1000);
  if (cache.token && cache.exp - 60 > agora) return cache.token;
  const { email, key } = credenciais();
  if (!email || !key || !process.env.SHEET_ID) throw new Error('Faltam as variáveis SHEET_ID e GOOGLE_SERVICE_ACCOUNT no Netlify.');
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64(JSON.stringify({ iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + claims).sign(key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claims + '.' + sig }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('O Google não aceitou a chave da conta de serviço.');
  cache = { token: j.access_token, exp: agora + (j.expires_in || 3600) };
  return cache.token;
}

async function chamar(path, opt = {}) {
  const t = await token();
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${process.env.SHEET_ID}${path}`, {
    ...opt, headers: { authorization: 'Bearer ' + t, 'content-type': 'application/json' },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Planilha: ' + ((j.error && j.error.message) || r.status) + ' (a planilha está compartilhada como EDITOR com a conta de serviço?)');
  return j;
}

/* ---------- planilha de mentira, só pros testes (MOCK_SHEETS=1) ---------- */
const mock = { mem: {} };
export const _mock = mock;
const colN = (s) => s.split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
function parse(r) {
  const m = r.match(/^'?(.+?)'?!([A-Z]+)(\d+)(?::([A-Z]+)(\d*))?$/);
  if (!m) throw new Error('range inválido ' + r);
  return { aba: m[1], c1: colN(m[2]), r1: +m[3] - 1, c2: m[4] ? colN(m[4]) : colN(m[2]), r2: m[4] ? (m[5] ? +m[5] - 1 : Infinity) : +m[3] - 1 };
}

/** Lê vários intervalos. modo 'raw' devolve números como número; 'fmt' devolve como aparece na tela. */
export async function ler(ranges, modo = 'raw') {
  if (process.env.MOCK_SHEETS) {
    return ranges.map((r) => {
      const p = parse(r);
      const rows = (mock.mem[p.aba] || []).slice(p.r1, p.r2 === Infinity ? undefined : p.r2 + 1);
      return rows.map((row) => { const o = []; for (let c = p.c1; c <= p.c2; c++) o.push(row[c] === undefined ? '' : row[c]); while (o.length && o[o.length - 1] === '') o.pop(); return o; });
    });
  }
  const qs = ranges.map((x) => 'ranges=' + encodeURIComponent(x)).join('&');
  const opt = modo === 'fmt' ? 'FORMATTED_VALUE' : 'UNFORMATTED_VALUE';
  const j = await chamar(`/values:batchGet?${qs}&valueRenderOption=${opt}&dateTimeRenderOption=FORMATTED_STRING`);
  return (j.valueRanges || []).map((v) => v.values || []);
}

export async function adicionar(aba, linhas) {
  if (process.env.MOCK_SHEETS) { const m = (mock.mem[aba] = mock.mem[aba] || []); linhas.forEach((l) => m.push([...l])); return; }
  return chamar(`/values/${encodeURIComponent(`'${aba}'!A:A`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: linhas }) });
}

export async function gravar(range, linhas) {
  if (process.env.MOCK_SHEETS) {
    const p = parse(range); const m = (mock.mem[p.aba] = mock.mem[p.aba] || []);
    linhas.forEach((l, i) => { const row = (m[p.r1 + i] = m[p.r1 + i] || []); l.forEach((v, j) => { row[p.c1 + j] = v; }); });
    return;
  }
  return chamar(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: linhas }) });
}
