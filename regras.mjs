import { ler, adicionar, gravar } from './sheets.mjs';
import { acharAcesso, norm, ativo } from './auth.mjs';

export const ETAPAS = ['Fechado', 'Aguardando documentação', 'Aguardando pagamento', 'Pago'];
export const FIN = ['Imóvel', 'Automóveis', 'Agro', 'Capital de giro', 'Construção', 'Quitar financiamento'];
export const FONTE = ['Tráfego', 'Repescagem', 'Discador', 'Indicação', 'Instagram', 'Cliente carteira', 'Orgânico'];
export const CLI = ['ID', 'Telefone', 'Nome', 'Sexo', 'Tel', 'Finalidade', 'Fonte', 'Crédito', 'Entrada', 'Parcela', 'Observações', 'Nº de cadastros', 'Status', 'SDR', 'Closer', 'Cadastrado em', 'Atualizado em', 'Pago em'];
export const AG = ['ID', 'Telefone', 'Closer', 'SDR (quem agendou)', 'Início', 'Fim', 'Status', 'Resultado', 'Parecer da closer', 'Confirmação da manhã', 'Confirmação de 20 min', 'Criado em', 'Atualizado em'];
const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

export class Erro extends Error { constructor(msg, status = 400, extra = {}) { super(msg); this.status = status; this.extra = extra; } }

/* ---------- utilidades ---------- */
export const agora = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 16);
export const hojeStr = () => agora().slice(0, 10);
export const fone = (s) => String(s == null ? '' : s).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
export const num = (v) => { if (typeof v === 'number') return v; const t = String(v || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''); return t ? parseFloat(t) : 0; };
export const hm = (v) => { if (typeof v === 'number' && v < 1) { const t = Math.round(v * 1440); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); } const m = String(v || '').match(/(\d{1,2}):(\d{2})/); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; };
export const minutos = (s) => { const [h, m] = hm(s).split(':').map(Number); return h * 60 + m; };
export const dataIso = (s) => { s = String(s || '').trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
export const somaMin = (dt, n) => { const t = minutos(dt.slice(11)) + n; return dt.slice(0, 11) + String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
export const diaSemana = (d) => DIAS[new Date(d + 'T12:00:00Z').getUTCDay()];
export const trava = (status) => ETAPAS.includes(status);
const id = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const letra = (n) => { let s = ''; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

function objs(v) {
  if (!v || !v.length) return [];
  const h = v[0].map((x) => String(x == null ? '' : x).trim());
  return v.slice(1).map((r, i) => { const o = { _linha: i + 2 }; h.forEach((c, j) => { if (c) o[c] = r[j] == null ? '' : r[j]; }); return o; })
    .filter((o) => Object.keys(o).some((k) => k !== '_linha' && o[k] !== ''));
}
const linhaDe = (cols, o) => cols.map((c) => (o[c] == null ? '' : o[c]));

/* ---------- horários livres do closer num dia ---------- */
export function slotsDoDia(disp, closer, data) {
  const meus = disp.filter((d) => norm(d.Closer) === norm(closer) && norm(d.Ativo) !== 'nao' && norm(d.Ativo) !== 'n');
  const dow = diaSemana(data);
  let jan = meus.filter((d) => norm(d.Tipo) === 'semanal' && norm(d['Dia da semana']).startsWith(dow.slice(0, 3))).map((d) => [minutos(d['Início']), minutos(d.Fim)]);
  jan = jan.concat(meus.filter((d) => norm(d.Tipo) === 'extra' && dataIso(d.Data) === data).map((d) => [minutos(d['Início']), minutos(d.Fim)]));
  const blq = meus.filter((d) => norm(d.Tipo) === 'bloqueio' && dataIso(d.Data) === data).map((d) => [minutos(d['Início']), minutos(d.Fim)]);
  const out = new Set();
  for (const [a, b] of jan) for (let t = a; t + 30 <= b; t += 30) if (!blq.some(([x, y]) => t < y && t + 30 > x)) out.add(t);
  return [...out].sort((x, y) => x - y).map((t) => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
}

/* ---------- carrega tudo e identifica quem está chamando ---------- */
export async function carregar(chave) {
  const [[acessos, clientes, agenda, log, config], [disp]] = await Promise.all([
    ler(["'Acessos'!A1:H100", "'Clientes'!A1:R", "'Agenda'!A1:M", "'Log'!A1:E", "'Config'!A1:C100"], 'raw'),
    ler(["'Disponibilidade'!A1:G"], 'fmt'),
  ]);
  const eu = acharAcesso(acessos, chave);
  if (!eu) throw new Erro('Link inválido ou desativado. Fale com o gestor.', 401);
  const ah = (acessos[0] || []).map(norm);
  const ix = { nome: ah.indexOf('nome'), perfil: ah.indexOf('perfil'), ativo: ah.indexOf('ativo'), meet: ah.findIndex((x) => x.includes('meet')) };
  const pessoas = acessos.slice(1).filter((r) => r[ix.nome] && ativo(r[ix.ativo])).map((r, i) => ({ nome: String(r[ix.nome]).trim(), perfil: norm(r[ix.perfil]).startsWith('gest') ? 'gestor' : norm(r[ix.perfil]).startsWith('sdr') ? 'sdr' : 'closer', meet: ix.meet >= 0 ? String(r[ix.meet] || '').trim() : '', _linha: acessos.indexOf(r) + 1 }));
  const closers = pessoas.filter((p) => p.perfil !== 'sdr');
  const cfg = {}; objs(config).forEach((r) => { cfg[String(r.Item).trim()] = r.Valor; });
  const meta = {}; pessoas.forEach((p) => { meta[p.nome] = num(cfg['meta_reunioes_' + p.nome]); });
  const metaProsp = {}; pessoas.forEach((p) => { metaProsp[p.nome] = num(cfg['meta_prospeccao_' + p.nome]); });
  const config_ = { meta, metaProsp, metaCred: num(cfg.meta_credito), superCred: num(cfg.super_meta_credito), folgas: String(cfg.folgas || '').split(/[\s,;]+/).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) };
  return { eu, pessoas, closers, cfg, config: config_, clientes: objs(clientes), agenda: objs(agenda), disp: objs(disp), log: objs(log), acessosRaw: acessos };
}

/* ---------- formato que o painel recebe ---------- */
export function paraFront(ctx) {
  const logs = {};
  ctx.log.forEach((r) => { const t = fone(r.Telefone); if (!t) return; (logs[t] = logs[t] || []).unshift({ em: String(r['Data e hora']), por: r.Quem, o: r['Ação'] }); });
  const clientes = ctx.clientes.map((r) => ({
    Telefone: fone(r.Telefone), Nome: String(r.Nome || ''), Sexo: r.Sexo || '', Tel: String(r.Tel || '').padStart(4, '0').slice(-4), Finalidade: r.Finalidade || '', Fonte: r.Fonte || '',
    Credito: num(r['Crédito']), Entrada: num(r.Entrada), Parcela: num(r.Parcela), Obs: String(r['Observações'] || ''), cad: num(r['Nº de cadastros']) || 1,
    Status: r.Status || 'Novo', SDR: r.SDR || '', Closer: r.Closer || '', PagoEm: dataIso(r['Pago em']), Log: (logs[fone(r.Telefone)] || []).slice(0, 60),
  }));
  const agenda = ctx.agenda.map((r) => ({
    ID: r.ID, Telefone: fone(r.Telefone), Closer: r.Closer || '', SDR: r['SDR (quem agendou)'] || '', ini: String(r['Início'] || '').slice(0, 16), Status: r.Status || '',
    Resultado: r.Resultado || '', Parecer: r['Parecer da closer'] || '', manha: String(r['Confirmação da manhã'] || ''), min20: String(r['Confirmação de 20 min'] || ''),
  }));
  const disp = ctx.disp.map((d) => ({ Closer: d.Closer, Tipo: d.Tipo, Dia: d['Dia da semana'], Data: dataIso(d.Data), Ini: hm(d['Início']), Fim: hm(d.Fim), Ativo: d.Ativo }));
  return { eu: ctx.eu, pessoas: ctx.pessoas.map((p) => ({ nome: p.nome, perfil: p.perfil })), closers: ctx.closers.map((p) => ({ nome: p.nome, meet: p.meet })), config: ctx.config, clientes, agenda, disp, agora: agora(), listas: { FIN, FONTE } };
}

/* ---------- validações ---------- */
function validarCampos(c) {
  const t = (x) => String(x == null ? '' : x).trim();
  if (!t(c.nome)) throw new Erro('Preencha o nome completo.');
  if (!['F', 'M'].includes(c.sexo)) throw new Erro('Escolha o sexo.');
  if (!/^\d{4}$/.test(t(c.tf))) throw new Erro('Preencha o Tel: os 4 últimos dígitos do nosso número que está falando com o cliente.');
  if (!FIN.includes(c.fin)) throw new Erro('Escolha a finalidade.');
  if (!FONTE.includes(c.fonte)) throw new Erro('Escolha a fonte de prospecção.');
  if (!(num(c.cred) > 0)) throw new Erro('Preencha o crédito desejado.');
  if (t(c.obs).length < 3) throw new Erro('Preencha as observações adicionais.');
}

async function logar(ctx, tel, texto) { await adicionar('Log', [[agora(), ctx.eu.nome, texto, tel, '']]).catch(() => {}); }
const achaCli = (ctx, tel) => ctx.clientes.find((r) => fone(r.Telefone) === tel);
const ativa = (a) => norm(a.Status) === 'agendada';
const cliGravar = (r) => gravar(`'Clientes'!A${r._linha}:${letra(CLI.length - 1)}${r._linha}`, [linhaDe(CLI, r)]);
const agGravar = (r) => gravar(`'Agenda'!A${r._linha}:${letra(AG.length - 1)}${r._linha}`, [linhaDe(AG, r)]);

function conferirHorario(ctx, closer, inicio, ignorarId) {
  const cl = ctx.closers.find((x) => norm(x.nome) === norm(closer));
  if (!cl) throw new Erro('Closer inválido.');
  const d = dataIso(String(inicio).slice(0, 10)), h = hm(String(inicio).slice(11));
  const ini = d + ' ' + h;
  if (!d || !h || ini <= agora()) throw new Erro('Horário inválido ou já passou.');
  if (!slotsDoDia(ctx.disp, cl.nome, d).includes(h)) throw new Erro('Fora da agenda do closer.', 409);
  if (ctx.agenda.some((a) => ativa(a) && a.ID !== ignorarId && norm(a.Closer) === norm(cl.nome) && String(a['Início']).slice(0, 16) === ini)) throw new Erro('Esse horário acabou de ser ocupado.', 409);
  return { cl, ini };
}
const podeMexer = (ctx, a) => ctx.eu.perfil === 'gestor' || (ctx.eu.perfil === 'closer' && norm(a.Closer) === norm(ctx.eu.nome)) || (ctx.eu.perfil === 'sdr' && norm(a['SDR (quem agendou)']) === norm(ctx.eu.nome));
const ehCloserDe = (ctx, a) => ctx.eu.perfil === 'gestor' || (ctx.eu.perfil === 'closer' && norm(a.Closer) === norm(ctx.eu.nome));

/* ---------- ações ---------- */
export const acoes = {
  async salvarCliente(ctx, c) {
    const tel = fone(c.telefone);
    if (tel.length < 10 || tel.length > 11) throw new Erro('Telefone inválido. Use DDD + número.');
    validarCampos(c);
    const ex = achaCli(ctx, tel), t = agora(), agendar = !!c.inicio;
    if (ex && trava(ex.Status)) throw new Erro(`Esse cliente já está como ${ex.Status}. Não dá pra agendar de novo.`, 409);
    let h = null;
    if (agendar) {
      h = conferirHorario(ctx, c.closer, c.inicio);
      const jaTem = ctx.agenda.find((a) => ativa(a) && fone(a.Telefone) === tel && String(a['Início']) > t);
      if (jaTem && !c.forcar) throw new Erro(`Esse cliente já tem reunião em ${jaTem['Início'].slice(8, 10)}/${jaTem['Início'].slice(5, 7)} às ${jaTem['Início'].slice(11, 16)}. Marcar outra mesmo assim?`, 409, { aviso: true });
    }
    const dados = { Telefone: tel, Nome: String(c.nome).trim(), Sexo: c.sexo, Tel: String(c.tf).trim(), Finalidade: c.fin, Fonte: c.fonte, 'Crédito': num(c.cred), Entrada: num(c.ent), Parcela: num(c.par), 'Observações': String(c.obs).trim(), 'Atualizado em': t };
    let cadN = 1;
    if (ex) { cadN = (num(ex['Nº de cadastros']) || 1) + 1; await cliGravar({ ...ex, ...dados, 'Nº de cadastros': cadN, ...(agendar ? { Status: 'Reunião agendada', Closer: h.cl.nome } : {}) }); }
    else await adicionar('Clientes', [linhaDe(CLI, { ID: id('C'), ...dados, 'Nº de cadastros': 1, Status: agendar ? 'Reunião agendada' : 'Novo', SDR: ctx.eu.nome, Closer: agendar ? h.cl.nome : '', 'Cadastrado em': t, 'Pago em': '' })]);
    await logar(ctx, tel, ex ? `Novo cadastro do mesmo telefone (${cadN}x), dados atualizados` : 'Cadastro do cliente');
    if (agendar) {
      await adicionar('Agenda', [linhaDe(AG, { ID: id('A'), Telefone: tel, Closer: h.cl.nome, 'SDR (quem agendou)': ctx.eu.nome, 'Início': h.ini, Fim: somaMin(h.ini, 30), Status: 'Agendada', 'Criado em': t, 'Atualizado em': t })]);
      await logar(ctx, tel, `Agendou reunião com ${h.cl.nome} em ${h.ini.slice(8, 10)}/${h.ini.slice(5, 7)} às ${h.ini.slice(11)}`);
    }
    return { msg: (ex ? `Cliente já existia (cadastro nº ${cadN}), dados atualizados. ` : 'Cliente cadastrado. ') + (agendar ? `Reunião marcada com ${h.cl.nome} em ${h.ini.slice(8, 10)}/${h.ini.slice(5, 7)} às ${h.ini.slice(11)}.` : 'Sem reunião marcada ainda.'), agendou: agendar };
  },

  async editarCliente(ctx, c) {
    const tel = fone(c.telefone), ex = achaCli(ctx, tel);
    if (!ex) throw new Erro('Cliente não encontrado.', 404);
    validarCampos(c);
    await cliGravar({ ...ex, Nome: String(c.nome).trim(), Sexo: c.sexo, Tel: String(c.tf).trim(), Finalidade: c.fin, Fonte: c.fonte, 'Crédito': num(c.cred), Entrada: num(c.ent), Parcela: num(c.par), 'Observações': String(c.obs).trim(), 'Atualizado em': agora() });
    await logar(ctx, tel, 'Editou os dados do cliente');
    return { msg: 'Cliente atualizado.' };
  },

  async cancelar(ctx, c) {
    const a = ctx.agenda.find((x) => x.ID === c.id);
    if (!a) throw new Erro('Reunião não encontrada.', 404);
    if (!podeMexer(ctx, a)) throw new Erro('Você não pode mexer nessa reunião.', 403);
    if (!ativa(a)) throw new Erro('Só dá pra cancelar reunião agendada.', 409);
    const t = agora(), tel = fone(a.Telefone);
    await agGravar({ ...a, Status: 'Cancelada', 'Atualizado em': t });
    const cli = achaCli(ctx, tel);
    if (cli && norm(cli.Status) === norm('Reunião agendada') && !ctx.agenda.some((x) => x.ID !== a.ID && ativa(x) && fone(x.Telefone) === tel)) await cliGravar({ ...cli, Status: 'Novo', 'Atualizado em': t });
    await logar(ctx, tel, `Cancelou a reunião de ${String(a['Início']).slice(8, 10)}/${String(a['Início']).slice(5, 7)} às ${String(a['Início']).slice(11, 16)}`);
    return { msg: 'Reunião cancelada.' };
  },

  async reagendar(ctx, c) {
    const a = ctx.agenda.find((x) => x.ID === c.id);
    if (!a) throw new Erro('Reunião não encontrada.', 404);
    if (!podeMexer(ctx, a)) throw new Erro('Você não pode mexer nessa reunião.', 403);
    const tel = fone(a.Telefone), t = agora();
    const ok = ativa(a) || (norm(a.Status) === 'faltou' && !ctx.agenda.some((x) => ativa(x) && fone(x.Telefone) === tel));
    if (!ok) throw new Erro('Essa reunião não pode ser reagendada.', 409);
    const cli = achaCli(ctx, tel);
    if (cli && trava(cli.Status)) throw new Erro(`Esse cliente já está como ${cli.Status}.`, 409);
    const h = conferirHorario(ctx, a.Closer, c.inicio, a.ID);
    if (ativa(a)) await agGravar({ ...a, Status: 'Reagendada', 'Atualizado em': t });
    await adicionar('Agenda', [linhaDe(AG, { ID: id('A'), Telefone: tel, Closer: a.Closer, 'SDR (quem agendou)': a['SDR (quem agendou)'], 'Início': h.ini, Fim: somaMin(h.ini, 30), Status: 'Agendada', 'Criado em': t, 'Atualizado em': t })]);
    if (cli) await cliGravar({ ...cli, Status: 'Reunião agendada', 'Atualizado em': t });
    await logar(ctx, tel, `Reagendou para ${h.ini.slice(8, 10)}/${h.ini.slice(5, 7)} às ${h.ini.slice(11)}`);
    return { msg: `Reagendado para ${h.ini.slice(8, 10)}/${h.ini.slice(5, 7)} às ${h.ini.slice(11)}. A reunião antiga fica no histórico.` };
  },

  async resultado(ctx, c) {
    const a = ctx.agenda.find((x) => x.ID === c.id);
    if (!a) throw new Erro('Reunião não encontrada.', 404);
    if (!ehCloserDe(ctx, a)) throw new Erro('Só a closer da reunião (ou o gestor) registra o resultado.', 403);
    if (!ativa(a)) throw new Erro('Essa reunião já tem resultado ou foi cancelada.', 409);
    const mapa = { compareceu: ['Realizada', 'Negociação'], fechado: ['Realizada', 'Fechado'], perdido: ['Realizada', 'Perdido'], faltou: ['Faltou', 'No-show'] }[c.resultado];
    if (!mapa) throw new Erro('Escolha o resultado da reunião.');
    const parecer = String(c.parecer || '').trim();
    if (parecer.length < 5) throw new Erro('O parecer da closer é obrigatório. Escreva o que aconteceu na reunião.');
    const t = agora(), tel = fone(a.Telefone);
    await agGravar({ ...a, Status: mapa[0], Resultado: c.resultado, 'Parecer da closer': parecer, 'Atualizado em': t });
    const cli = achaCli(ctx, tel);
    if (cli && norm(cli.Status) !== 'pago') await cliGravar({ ...cli, Status: mapa[1], 'Atualizado em': t });
    await logar(ctx, tel, `Resultado da reunião: ${c.resultado}. Parecer: ${parecer}`);
    return { msg: 'Resultado e parecer salvos.' };
  },

  async etapa(ctx, c) {
    const tel = fone(c.telefone), cli = achaCli(ctx, tel);
    if (!cli) throw new Erro('Cliente não encontrado.', 404);
    if (!['Negociação', ...ETAPAS, 'Perdido'].includes(c.etapa)) throw new Erro('Etapa inválida.');
    await cliGravar({ ...cli, Status: c.etapa, 'Atualizado em': agora(), 'Pago em': c.etapa === 'Pago' ? hojeStr() : '' });
    await logar(ctx, tel, `Mudou a etapa da venda para ${c.etapa}`);
    return { msg: `Etapa atualizada: ${c.etapa}.` };
  },

  async confirmar(ctx, c) {
    const a = ctx.agenda.find((x) => x.ID === c.id);
    if (!a) throw new Erro('Reunião não encontrada.', 404);
    if (!ehCloserDe(ctx, a)) throw new Erro('Só a closer da reunião (ou o gestor) confirma com o cliente.', 403);
    const col = c.tipo === 'manha' ? 'Confirmação da manhã' : 'Confirmação de 20 min';
    await agGravar({ ...a, [col]: agora(), 'Atualizado em': agora() });
    return { msg: 'Marcado como enviado.' };
  },

  async salvarConfig(ctx, c) {
    if (ctx.eu.perfil !== 'gestor') throw new Erro('Só o gestor muda as configurações.', 403);
    const lin = {}; objs(await ler(["'Config'!A1:C100"]).then((x) => x[0])).forEach((r) => { lin[String(r.Item).trim()] = r._linha; });
    const set = async (k, v, expl) => { if (lin[k]) await gravar(`'Config'!B${lin[k]}`, [[v]]); else { await adicionar('Config', [[k, v, expl || '']]); } };
    if (c.meta) for (const [nome, n] of Object.entries(c.meta)) { if (ctx.pessoas.some((p) => p.nome === nome)) await set('meta_reunioes_' + nome, Math.max(0, parseInt(n, 10) || 0), 'Reuniões realizadas por dia útil'); }
    if (c.metaProsp) for (const [nome, n] of Object.entries(c.metaProsp)) { if (ctx.pessoas.some((p) => p.nome === nome)) await set('meta_prospeccao_' + nome, Math.max(0, parseInt(n, 10) || 0), 'Prospecção própria: reuniões realizadas por dia útil'); }
    if (c.metaCred != null) await set('meta_credito', num(c.metaCred), 'Meta de crédito pago no mês (por pessoa)');
    if (c.superCred != null) await set('super_meta_credito', num(c.superCred), 'Super meta de crédito pago no mês');
    if (c.folgas != null) await set('folgas', (c.folgas || []).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).join(', '), 'Dias sem expediente');
    if (c.meets) {
      const ah = ctx.acessosRaw[0].map(norm), col = ah.findIndex((x) => x.includes('meet'));
      if (col >= 0) for (const [nome, link] of Object.entries(c.meets)) { const p = ctx.pessoas.find((x) => x.nome === nome); if (p) await gravar(`'Acessos'!${letra(col)}${p._linha}`, [[String(link || '').trim()]]); }
    }
    await logar(ctx, '', 'Mudou as configurações');
    return { msg: 'Configurações salvas.' };
  },
};
