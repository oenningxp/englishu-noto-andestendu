// Englishu Noto Andestêndu: site, login com a conta do Gothic e a IA (Workers AI).
import { checkPassword, hashPassword, checkTotp, randomToken, sha256 } from "./auth.js";
import * as EN from "./tutor.js";
import * as JA from "./tutor-ja.js";
import { unsureWords, aiText } from "./tutor.js";

// os dois professores: Sam (inglês americano) e Nii (japonês)
const TUTORS = {
  en: { name: "Sam", system: () => EN.SYSTEM, SCHEMA: EN.SCHEMA, buildPrompt: EN.buildPrompt, parseReply: EN.parseReply, EXPLAIN_SYSTEM: EN.EXPLAIN_SYSTEM, EXPLAIN_SCHEMA: EN.EXPLAIN_SCHEMA, explainPrompt: EN.explainPrompt, parseExplain: EN.parseExplain, SIMPLIFY_SYSTEM: EN.SIMPLIFY_SYSTEM, SIMPLIFY_SCHEMA: EN.SIMPLIFY_SCHEMA, simplifyPrompt: EN.simplifyPrompt, parseSimplify: EN.parseSimplify, MORE_SUG_SYSTEM: EN.MORE_SUG_SYSTEM, MORE_SUG_SCHEMA: EN.MORE_SUG_SCHEMA, moreSugPrompt: EN.moreSugPrompt, parseMoreSug: EN.parseMoreSug, stt: "en", tts: "en", plain: t => t },
  ja: { name: "Nii", system: JA.system, SCHEMA: JA.SCHEMA, buildPrompt: JA.buildPrompt, parseReply: JA.parseReply, EXPLAIN_SYSTEM: JA.EXPLAIN_SYSTEM, EXPLAIN_SCHEMA: JA.EXPLAIN_SCHEMA, explainPrompt: JA.explainPrompt, parseExplain: JA.parseExplain, SIMPLIFY_SYSTEM: JA.SIMPLIFY_SYSTEM, SIMPLIFY_SCHEMA: JA.SIMPLIFY_SCHEMA, simplifyPrompt: JA.simplifyPrompt, parseSimplify: JA.parseSimplify, MORE_SUG_SYSTEM: JA.MORE_SUG_SYSTEM, MORE_SUG_SCHEMA: JA.MORE_SUG_SCHEMA, moreSugPrompt: JA.moreSugPrompt, parseMoreSug: JA.parseMoreSug, stt: "ja", tts: "jp", plain: JA.plain }
};

const SESSION_DAYS = 30, MAX_MSGS = 200, MAX_AUDIO = 3 * 1024 * 1024;
const STT_MODEL = "@cf/openai/whisper-large-v3-turbo", TTS_MODEL = "@cf/deepgram/aura-2-en", TTS_SPEAKER = "arcas";
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers });
const err = (msg, status = 400) => json({ error: msg }, status);
const QUOTA = "A cota grátis de IA de hoje acabou. Ela volta às 21h (horário de Brasília).";

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    try {
      if (p.startsWith("/img/")) return image(env, p.slice(5));
      if (p.startsWith("/api/")) {
        if (req.method !== "GET" && !sameOrigin(req, url)) return err("origem inválida", 403);
        await ensureTables(env);
        return await api(req, env, p.slice(5));
      }
      return env.ASSETS.fetch(req);
    } catch (e) { console.error(e); return err("erro interno", 500); }
  }
};
const sameOrigin = (req, url) => { const o = req.headers.get("Origin"); return !o || o === url.origin; };

// contas só do Englishu (sem Gothic e sem 2FA): criadas uma vez; trocar a senha não é desfeito
const LOCAL_SEED = [
  ["amanda", "Amanda", "IVtA-yVTw6GDiqV5ntMtqg", "Xz49UbEDmMj2O1SCvdaKYigKNR4C__Pe1nAxeF3q7WU"],
  ["leticia", "Letícia", "U_pce0s5mmcfC5-6-23DVw", "313RERWVfy-aai1Tmhjrpm98N-svj8oKjjGvt_tJXSU"],
  ["isabella", "Isabella", "UbVGzzpJnILi0ORYdE6V6Q", "uDaGIZdCNY6Oq2wbS9JepDvGSOkf3AQQDBCOeLo4cBs"],
  ["liane", "Liane", "FKc_Po98-5bXdLDs-T8Liw", "Vm2NvHzDnJucmkp0_ivY1nATASwy0QK9ggqnp2dkcHg"],
  ["manoel", "Manoel", "z2kK5JIM__qcpEhJiHd0RA", "MhLM84SWtlxXd2r32t9xtknCbQwzgMcBA2FrucacWbU"],
  ["vitoria", "Vitória", "ffh1RfARQQxEo7J1dNOnig", "1svgiDcsbht7nzTtRG7Heuwjd7XOIj6X7zn98MQ2GUw"],
  ["maria", "Maria", "5NOlWu5TItRRth4LBv3jmA", "cVTUBTeKJ61DvZ3Jdxv46B9UEP2yucv3QuhWiY5AIH0"],
  ["wictor", "Wictor", "7uJWuM7MQlU2UxdKfFbrbQ", "OsbHBSoXmJZOPYLndgj4TdHuM6U6tI5YEcDL076Kroo"]
]; // [usuário, nome, sal, hash] — senha inicial 123456

// ---------- tabelas do Papo (as contas são as do Gothic, tabela users, só leitura)
let ready = false;
async function ensureTables(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS papo_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, stage TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS papo_state (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS papo_chats (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS papo_usage (user_id TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (user_id, day))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS login_fails (k TEXT PRIMARY KEY, n INTEGER NOT NULL, since INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS papo_users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, nick TEXT NOT NULL, pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL, fail_count INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)")
  ]);
  try { await env.DB.prepare("ALTER TABLE papo_chats ADD COLUMN lang TEXT NOT NULL DEFAULT 'en'").run(); } catch { /* já existe */ }
  await env.DB.batch(LOCAL_SEED.map(([u, n, salt, hash]) => env.DB.prepare("INSERT OR IGNORE INTO papo_users (id,username,nick,pass_hash,pass_salt,created_at) VALUES (?,?,?,?,?,?)").bind("p_" + u, u, n, hash, salt, Date.now())));
  ready = true;
}

// ---------- sessão (cookie próprio "ps": entrar no Papo não mexe no login do Gothic)
const cookieOf = req => { const m = (req.headers.get("Cookie") || "").match(/(?:^|;\s*)ps=([^;]+)/); return m ? m[1] : null; };
const setCookie = (t, age) => `ps=${t}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
async function newSession(env, userId, stage) {
  const t = randomToken(), now = Date.now();
  await env.DB.prepare("INSERT INTO papo_sessions (token_hash,user_id,stage,created_at,expires_at) VALUES (?,?,?,?,?)").bind(await sha256(t), userId, stage, now, now + SESSION_DAYS * 864e5).run();
  await env.DB.prepare("DELETE FROM papo_sessions WHERE user_id=? AND expires_at<?").bind(userId, now).run();
  return { "Set-Cookie": setCookie(t, SESSION_DAYS * 86400) };
}
async function session(req, env) {
  const t = cookieOf(req); if (!t) return null;
  const ses = await env.DB.prepare("SELECT token_hash,user_id,stage,expires_at FROM papo_sessions WHERE token_hash=?").bind(await sha256(t)).first();
  if (!ses || ses.expires_at <= Date.now()) return null;
  const local = ses.user_id.startsWith("p_");
  const u = await env.DB.prepare(`SELECT * FROM ${local ? "papo_users" : "users"} WHERE id=?`).bind(ses.user_id).first();
  return u ? { ...u, token_hash: ses.token_hash, stage: ses.stage, expires_at: ses.expires_at, local } : null;
}
const isOwner = (env, u) => !!u && u.username === String(env.ADMIN_USERNAME || "").toLowerCase();
const meOut = (env, u) => ({ username: u.username, nick: u.nick, avatar: u.avatar || null, color: u.nick_color || null, owner: !u.local && isOwner(env, u), local: !!u.local });

// mesmas regras de tentativas do Gothic (as chaves são as mesmas: errar aqui ou lá conta junto)
const LF_WIN = 15 * 60000, LF_USER = 5, LF_NET = 20;
function netOf(req) {
  const ip = req.headers.get("CF-Connecting-IP") || "local"; if (!ip.includes(":")) return ip;
  const [h, tl = ""] = ip.split("::"), a = h ? h.split(":") : [], b = tl ? tl.split(":") : [];
  const full = [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b];
  return full.slice(0, 4).map(x => parseInt(x || "0", 16).toString(16)).join(":") + "::/64";
}
async function countAttempt(env, k, now) {
  const r = await env.DB.prepare("INSERT INTO login_fails (k, n, since) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN since < ? THEN 1 ELSE n + 1 END, since = CASE WHEN since < ? THEN excluded.since ELSE since END RETURNING n").bind(k, now, now - LF_WIN, now - LF_WIN).first();
  return r ? r.n : 1;
}
async function registerFail(env, id, table = "users") {
  const r = await env.DB.prepare(`UPDATE ${table} SET fail_count=fail_count+1 WHERE id=? RETURNING fail_count`).bind(id).first();
  if (r && r.fail_count >= 5) await env.DB.prepare(`UPDATE ${table} SET fail_count=0, locked_until=? WHERE id=?`).bind(Date.now() + 15 * 60000, id).run();
}

// ---------- estado da conversa (fica no servidor: celular e computador veem a mesma)
const blank = () => ({ msgs: [], topic: "", level: "", n: 0, chatId: null, dirty: false, settings: { voice: "phone", rate: 0.95, auto: true, v: 2 } });
// conversa nova mantendo o que é da pessoa (nível e ajustes)
const fresh = st => ({ ...blank(), level: st.level, settings: st.settings });
const MAX_SAVED = 30;
const chatTitle = st => (st.topic || "Conversa") + " · " + new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10).split("-").reverse().join("/");
async function loadState(env, uid) {
  const r = await env.DB.prepare("SELECT data FROM papo_state WHERE user_id=?").bind(uid).first();
  let st; try { st = r ? { ...blank(), ...JSON.parse(r.data) } : blank(); } catch { st = blank(); }
  if (!st.settings.v) st.settings = { ...st.settings, voice: "phone", v: 2 }; // a voz antiga do servidor saiu do ar: volta pra do aparelho
  return st;
}
async function saveState(env, uid, st) {
  st.msgs = st.msgs.slice(-MAX_MSGS);
  await env.DB.prepare("INSERT INTO papo_state (user_id,data,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at").bind(uid, JSON.stringify(st), Date.now()).run();
}
const spDay = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
async function useQuota(env, u) {
  if (isOwner(env, u)) return true;
  const lim = parseInt(env.DAILY_LIMIT || "40", 10) || 40;
  const r = await env.DB.prepare("INSERT INTO papo_usage (user_id,day,n) VALUES (?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET n=n+1 RETURNING n").bind(u.id, spDay()).first();
  return !r || r.n <= lim;
}
const quotaErr = e => /4006|daily free allocation|neurons|quota|rate limit/i.test(String(e && (e.message || e)));

// ---------- IA
// pede JSON à IA: tenta o modelo principal e, se falhar ou vier bagunçado, o reserva
async function aiJson(env, system, user, schema, parse, maxTokens = 1400) {
  const models = [...new Set([env.MODEL, env.FALLBACK_MODEL].filter(Boolean))];
  let lastErr = null;
  for (const model of models) {
    const input = { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens, temperature: 0.5 };
    for (const withSchema of [true, false]) {
      try {
        const r = await env.AI.run(model, withSchema ? { ...input, response_format: { type: "json_schema", json_schema: schema } } : input);
        const out = parse(aiText(r));
        if (out) return out;
      } catch (e) { lastErr = e; if (quotaErr(e)) throw e; console.error(model, e); }
    }
  }
  if (lastErr) throw lastErr;
  return null;
}
const askTutor = (env, T, nick, st, opts) => aiJson(env, T.system(nick), T.buildPrompt(st, opts), T.SCHEMA, T.parseReply);
// voz do servidor: Deepgram Aura-2 (só inglês; o MeloTTS foi desativado pela Cloudflare em 20/11/2026).
// Japonês não tem voz no servidor: o app usa a voz japonesa do aparelho.
async function toBytes(r) {
  const a = r && r.audio !== undefined ? r.audio : r;
  if (typeof a === "string") return Uint8Array.from(atob(a), c => c.charCodeAt(0));
  if (a instanceof Uint8Array) return a;
  if (a instanceof ArrayBuffer) return new Uint8Array(a);
  if (a instanceof ReadableStream) return new Uint8Array(await new Response(a).arrayBuffer());
  return null;
}
async function serverVoice(env, text, lang) {
  if (lang !== "en") return { bytes: null, tried: [{ model: "nenhum", error: "sem voz japonesa no servidor" }] };
  try {
    const bytes = await toBytes(await env.AI.run(TTS_MODEL, { text, speaker: TTS_SPEAKER, encoding: "mp3" }));
    return { bytes: bytes && bytes.byteLength ? bytes : null, tried: [{ model: TTS_MODEL, size: bytes ? bytes.byteLength : 0 }] };
  } catch (e) { if (quotaErr(e)) throw e; return { bytes: null, tried: [{ model: TTS_MODEL, error: String(e && e.message || e).slice(0, 300) }] }; }
}
const b64 = buf => { let s = ""; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };

// ---------- API
async function api(req, env, path) {
  const method = req.method;
  const body = method === "POST" && path !== "stt" ? await req.json().catch(() => ({})) : {};

  if (path === "login" && method === "POST") {
    const username = String(body.username || "").trim().toLowerCase(), now = Date.now(), net = netOf(req);
    const kUser = "u|" + net + "|" + username, kNet = "n|" + net;
    const cUser = await countAttempt(env, kUser, now), cNet = await countAttempt(env, kNet, now);
    if (cUser > LF_USER || cNet > LF_NET) return err("Muitas tentativas. Tente de novo em alguns minutos.", 429);
    const pw = String(body.password || "");
    // conta só do Englishu: usuário e senha, sem 2FA
    const lu = await env.DB.prepare("SELECT * FROM papo_users WHERE username=?").bind(username).first();
    if (lu) {
      if (lu.locked_until > now) return err("Muitas tentativas. Tente de novo em alguns minutos.", 429);
      if (!(await checkPassword(pw, lu.pass_salt, lu.pass_hash))) { await registerFail(env, lu.id, "papo_users"); return err("Usuário ou senha incorretos.", 401); }
      await env.DB.prepare("UPDATE papo_users SET fail_count=0 WHERE id=?").bind(lu.id).run();
      await env.DB.prepare("DELETE FROM login_fails WHERE k=? OR since<?").bind(kUser, now - LF_WIN).run();
      return json({ user: meOut(env, { ...lu, local: true }), state: await loadState(env, lu.id) }, 200, await newSession(env, lu.id, "full"));
    }
    const u = await env.DB.prepare("SELECT * FROM users WHERE username=?").bind(username).first();
    if (u && u.locked_until > now) return err("Muitas tentativas. Tente de novo em alguns minutos.", 429);
    if (!u) { await hashPassword(pw, "gothic-sem-conta-000000"); return err("Usuário ou senha incorretos.", 401); }
    if (!(await checkPassword(pw, u.pass_salt, u.pass_hash))) return err("Usuário ou senha incorretos.", 401);
    await env.DB.prepare("DELETE FROM login_fails WHERE k=? OR since<?").bind(kUser, now - LF_WIN).run();
    if (u.status !== "active" || !u.totp_on) return err("Termine o cadastro da sua conta no Gothic primeiro (app autenticador).", 403);
    return json({ stage: "totp" }, 200, await newSession(env, u.id, "totp"));
  }
  const s = await session(req, env);
  if (path === "login/totp" && method === "POST") {
    if (!s || s.stage !== "totp") return err("Sessão expirada. Entre de novo.", 401);
    if (s.locked_until > Date.now()) return err("Muitas tentativas. Tente de novo em alguns minutos.", 429);
    if (!(await checkTotp(s.totp_secret, body.code))) { await registerFail(env, s.id); return err("Código incorreto. Confira o app autenticador e tente de novo.", 401); }
    await env.DB.prepare("UPDATE users SET fail_count=0 WHERE id=?").bind(s.id).run();
    await env.DB.prepare("UPDATE papo_sessions SET stage='full' WHERE token_hash=?").bind(s.token_hash).run();
    return json({ user: meOut(env, s), state: await loadState(env, s.id) });
  }
  if (path === "logout" && method === "POST") {
    if (s) await env.DB.prepare("DELETE FROM papo_sessions WHERE token_hash=?").bind(s.token_hash).run();
    return json({ ok: true }, 200, { "Set-Cookie": setCookie("", 0) });
  }
  if (!s || s.stage !== "full") return path === "me" ? json({ user: null }) : err("Entre na sua conta.", 401);
  const lang = (body.lang || new URL(req.url).searchParams.get("lang")) === "ja" ? "ja" : "en", T = TUTORS[lang];
  const sk = lang === "ja" ? "ja:" + s.id : s.id; // cada idioma tem a sua conversa
  if (path === "password" && method === "POST") {
    if (!s.local) return err("A senha da conta Gothic se troca no Gothic.");
    const nw = String(body.new || "");
    if (nw.length < 6 || nw.length > 128) return err("A senha nova precisa ter pelo menos 6 caracteres.");
    if (!(await checkPassword(String(body.old || ""), s.pass_salt, s.pass_hash))) return err("Senha atual incorreta.", 401);
    const { hash, salt } = await hashPassword(nw);
    await env.DB.prepare("UPDATE papo_users SET pass_hash=?, pass_salt=? WHERE id=?").bind(hash, salt, s.id).run();
    await env.DB.prepare("DELETE FROM papo_sessions WHERE user_id=? AND token_hash<>?").bind(s.id, s.token_hash).run();
    return json({ ok: true });
  }
  if (path === "me") return json({ user: meOut(env, s), state: await loadState(env, sk), lang });

  // --- conversa
  if ((path === "chat" || path === "skip" || path === "theme") && method === "POST") {
    const st = await loadState(env, sk); let extra = "", unsure = [];
    if (path === "theme") {
      const topic = String(body.topic || "").replace(/[\r\n"]+/g, " ").trim().slice(0, 60);
      if (!topic) return err("Escolha um tema.");
      extra = `The learner chose the topic "${topic}". ${st.msgs.length ? "Switch to it now with a short, natural transition" : "Greet the learner briefly and start"} talking about it with one easy, open question about it. Set topic_pt to this topic in Portuguese. Return an empty corrections list.`;
    } else if (path === "chat") {
      const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, 600);
      if (text) { st.msgs.push({ role: "me", id: "m" + (++st.n), text, spoken: !!body.spoken }); unsure = Array.isArray(body.unsure) ? body.unsure.map(String).slice(0, 10) : []; }
      else if (st.msgs.length) return err("Mensagem vazia.");
    } else extra = "The learner asked to change the topic. Briefly acknowledge, start a clearly different topic, and return an empty corrections list.";
    if (!(await useQuota(env, s))) return err("Você chegou no limite de falas de hoje. Amanhã tem mais!", 429);
    let r;
    try { r = await askTutor(env, T, s.nick, st, { extra, unsure }); }
    catch (e) { console.error(e); if (quotaErr(e)) return err(QUOTA, 429); return err(`O ${T.name} não respondeu. Tente de novo.`, 502); }
    if (!r) return err(`O ${T.name} se enrolou na resposta. Tente de novo.`, 502);
    const last = st.msgs[st.msgs.length - 1];
    if (last && last.role === "me" && !extra) last.fix = { items: r.corrections, corrected: r.corrected, ...(r.corrected_romaji ? { corrected_romaji: r.corrected_romaji } : {}) };
    if (r.topic_pt) st.topic = r.topic_pt;
    if (r.level) st.level = r.level;
    st.msgs.push({ role: "ai", id: "m" + (++st.n), text: r.reply, pt: r.reply_pt, ...(r.romaji ? { romaji: r.romaji } : {}), ...(r.suggestions && r.suggestions.length ? { sug: r.suggestions } : {}) });
    st.dirty = true;
    await saveState(env, sk, st);
    return json({ state: st });
  }
  // --- "explicar de outro jeito" (uma correção) e "não entendi" (uma fala do Sam)
  // --- "Mais sugestões": troca as sugestões da última fala por outras novas
  if (path === "moresug" && method === "POST") {
    const st = await loadState(env, sk), m = st.msgs.find(x => x.id === body.id);
    if (!m || m.role !== "ai") return err("Mensagem não encontrada.", 404);
    if (!(await useQuota(env, s))) return err("Você chegou no limite de falas de hoje. Amanhã tem mais!", 429);
    let more;
    try { more = await aiJson(env, T.MORE_SUG_SYSTEM, T.moreSugPrompt(st, m), T.MORE_SUG_SCHEMA, T.parseMoreSug, 1200); }
    catch (e) { console.error(e); return err(quotaErr(e) ? QUOTA : "Não consegui criar sugestões agora. Tente de novo.", quotaErr(e) ? 429 : 502); }
    if (!more) return err("Não consegui criar sugestões agora. Tente de novo.", 502);
    m.sugOld = [...(m.sugOld || []), ...(m.sug || [])].slice(-15); m.sug = more; st.dirty = true;
    await saveState(env, sk, st);
    return json({ state: st });
  }
  if ((path === "explain" || path === "simplify") && method === "POST") {
    const st = await loadState(env, sk), m = st.msgs.find(x => x.id === body.id);
    if (!m) return err("Mensagem não encontrada.", 404);
    let task;
    if (path === "explain") {
      const c = m.role === "me" && m.fix && m.fix.items[+body.idx];
      if (!c) return err("Correção não encontrada.", 404);
      if (c.more) return json({ state: st });
      task = async () => { c.more = await aiJson(env, T.EXPLAIN_SYSTEM, T.explainPrompt(m.text, c, st.level), T.EXPLAIN_SCHEMA, T.parseExplain, 900); return c.more; };
    } else {
      if (m.role !== "ai") return err(`Só dá para simplificar falas do ${T.name}.`);
      if (m.simple) return json({ state: st });
      task = async () => { m.simple = await aiJson(env, T.SIMPLIFY_SYSTEM, T.simplifyPrompt(m.text), T.SIMPLIFY_SCHEMA, T.parseSimplify, 700); return m.simple; };
    }
    if (!(await useQuota(env, s))) return err("Você chegou no limite de falas de hoje. Amanhã tem mais!", 429);
    try { if (!(await task())) return err("Não consegui explicar agora. Tente de novo.", 502); }
    catch (e) { console.error(e); return err(quotaErr(e) ? QUOTA : "Não consegui explicar agora. Tente de novo.", quotaErr(e) ? 429 : 502); }
    st.dirty = true;
    await saveState(env, sk, st);
    return json({ state: st });
  }
  // --- comandos do chat (/new /clear /save /delete) e conversas salvas
  if (path === "cmd" && method === "POST") {
    const st = await loadState(env, sk), cmd = String(body.cmd || "");
    const unsaved = st.msgs.length > 0 && (st.dirty || !st.chatId);
    if (cmd === "save") {
      if (!st.msgs.length) return json({ state: st, note: "Não tem nada pra salvar ainda." });
      const now = Date.now(), title = chatTitle(st);
      if (st.chatId && await env.DB.prepare("SELECT 1 FROM papo_chats WHERE id=? AND user_id=?").bind(st.chatId, s.id).first()) {
        st.dirty = false;
        await env.DB.prepare("UPDATE papo_chats SET title=?, data=?, updated_at=? WHERE id=? AND user_id=?").bind(title, JSON.stringify({ msgs: st.msgs, topic: st.topic, n: st.n }), now, st.chatId, s.id).run();
      } else {
        const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM papo_chats WHERE user_id=?").bind(s.id).first();
        if (c && c.n >= MAX_SAVED) return json({ state: st, note: `Você já tem ${MAX_SAVED} conversas salvas. Apague alguma (abra e use /delete) antes de salvar outra.` });
        st.chatId = "c" + randomToken(9); st.dirty = false;
        await env.DB.prepare("INSERT INTO papo_chats (id,user_id,title,data,created_at,updated_at,lang) VALUES (?,?,?,?,?,?,?)").bind(st.chatId, s.id, title, JSON.stringify({ msgs: st.msgs, topic: st.topic, n: st.n }), now, now, lang).run();
      }
      await saveState(env, sk, st);
      return json({ state: st, note: `Conversa salva como "${title}". Ela fica em Ajustes → Conversas salvas. Conversas salvas também ajudam a melhorar o app (são revisadas sem o seu nome).` });
    }
    if (cmd === "new" || cmd === "clear" || cmd === "delete") {
      if (cmd === "new" && unsaved && !body.force) return json({ state: st, confirm: "new", note: "Esta conversa não foi salva. Quer salvar antes de abrir uma nova?" });
      if (cmd === "delete" && st.msgs.length && !body.force) return json({ state: st, confirm: "delete", note: st.chatId ? "Apagar esta conversa, inclusive a cópia salva? Não dá pra desfazer." : "Apagar esta conversa? Não dá pra desfazer." });
      if (cmd === "delete" && st.chatId) await env.DB.prepare("DELETE FROM papo_chats WHERE id=? AND user_id=?").bind(st.chatId, s.id).run();
      let nst;
      if (cmd === "clear") { nst = { ...st, msgs: [], topic: "", n: st.n, dirty: !!st.chatId }; } // a cópia salva só muda se você usar /save de novo
      else nst = fresh(st);
      await saveState(env, sk, nst);
      return json({ state: nst, note: cmd === "new" ? "Conversa nova aberta." : cmd === "clear" ? "Conversa limpa." : "Conversa apagada." });
    }
    return err("Comando desconhecido.");
  }
  if (path === "chats" && method === "GET") {
    const r = await env.DB.prepare("SELECT id,title,updated_at FROM papo_chats WHERE user_id=? AND lang=? ORDER BY updated_at DESC LIMIT ?").bind(s.id, lang, MAX_SAVED).all();
    return json({ chats: r.results || [] });
  }
  if (path === "open" && method === "POST") {
    const st = await loadState(env, sk);
    const c = await env.DB.prepare("SELECT * FROM papo_chats WHERE id=? AND user_id=? AND lang=?").bind(String(body.id || ""), s.id, lang).first();
    if (!c) return err("Conversa não encontrada.", 404);
    if (st.msgs.length && (st.dirty || !st.chatId) && st.chatId !== c.id && !body.force) return json({ state: st, confirm: "open", note: "A conversa atual não foi salva. Abrir mesmo assim?" });
    let d = {}; try { d = JSON.parse(c.data); } catch {}
    const nst = { ...fresh(st), msgs: d.msgs || [], topic: d.topic || "", n: d.n || 0, chatId: c.id, dirty: false };
    await saveState(env, sk, nst);
    return json({ state: nst, note: `Conversa "${c.title}" aberta.` });
  }
  if (path === "reset" && method === "POST") { const st = await loadState(env, sk), nst = blank(); nst.settings = st.settings; nst.level = st.level; await saveState(env, sk, nst); return json({ state: nst }); }
  if (path === "settings" && method === "POST") {
    const st = await loadState(env, sk), v = body || {};
    st.settings = { voice: v.voice === "server" ? "server" : "phone", rate: Math.min(1.3, Math.max(0.7, +v.rate || 0.95)), auto: v.auto !== false, v: 2 };
    await saveState(env, sk, st); return json({ settings: st.settings });
  }

  // --- voz: ouvir (Whisper) e falar (MeloTTS)
  if (path === "stt" && method === "POST") {
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX_AUDIO) return err("Áudio vazio ou longo demais (máx. 30 s).");
    try {
      const r = await env.AI.run(STT_MODEL, { audio: b64(buf), language: T.stt });
      return json({ text: String(r && r.text || "").replace(/\s+/g, " ").trim(), unsure: unsureWords(r) });
    } catch (e) { console.error(e); return err(quotaErr(e) ? QUOTA : "Não consegui entender o áudio. Tente de novo.", quotaErr(e) ? 429 : 502); }
  }
  if (path === "tts" && method === "POST") {
    const text = T.plain(String(body.text || "")).trim().slice(0, 600); if (!text) return err("Sem texto.");
    try {
      if (lang !== "en") return err("Sem voz japonesa no servidor.", 501);
      if (!(await useQuota(env, s))) return err("Você chegou no limite de hoje. Use a voz do aparelho (Ajustes).", 429);
      const { bytes } = await serverVoice(env, text, lang);
      if (!bytes) return err("Voz indisponível.", 502);
      return new Response(bytes, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" } });
    } catch (e) { console.error(e); return err(quotaErr(e) ? QUOTA : "Voz indisponível.", quotaErr(e) ? 429 : 502); }
  }
  // exportação das conversas salvas (só o dono): base para as melhorias contínuas. Sem nomes: cada pessoa vira "aluno-N".
  if (path === "admin/export" && method === "GET") {
    if (!isOwner(env, s)) return err("Só o dono.", 403);
    const r = await env.DB.prepare("SELECT user_id,title,data,lang,created_at,updated_at FROM papo_chats ORDER BY user_id, updated_at").all();
    const rows = r.results || [], alias = new Map(); let n = 0;
    const who = id => id === s.id ? "dono" : (alias.has(id) ? alias.get(id) : (alias.set(id, "aluno-" + (++n)), alias.get(id)));
    const keep = m => { const { showPt, ...rest } = m; return rest; };
    const chats = rows.map(c => { let d = {}; try { d = JSON.parse(c.data); } catch {} return { pessoa: who(c.user_id), idioma: c.lang || "en", titulo: c.title, criada: new Date(c.created_at).toISOString(), atualizada: new Date(c.updated_at).toISOString(), assunto: d.topic || "", mensagens: (d.msgs || []).map(keep) }; });
    const day = spDay();
    return new Response(JSON.stringify({ gerado_em: new Date().toISOString(), modelo: env.MODEL, total_conversas: chats.length, pessoas: n + (rows.some(c => c.user_id === s.id) ? 1 : 0), conversas: chats }, null, 1), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="englishu-conversas-${day}.json"`, "Cache-Control": "no-store" }
    });
  }
  // diagnóstico da voz (só o dono): /api/tts-check?lang=ja mostra o que o servidor conseguiu gerar
  if (path === "tts-check" && method === "GET") {
    if (!isOwner(env, s)) return err("Só o dono.", 403);
    try { const { bytes, tried } = await serverVoice(env, "Hello! This is Sam.", lang); return json({ ok: !!bytes, tried }); }
    catch (e) { return json({ ok: false, error: String(e && e.message || e) }); }
  }
  return err("não encontrado", 404);
}

// foto de perfil do Gothic (mesmo espaço de imagens)
async function image(env, key) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(key)) return new Response("not found", { status: 404 });
  const { value, metadata } = await env.IMAGES.getWithMetadata("img/" + key, { type: "arrayBuffer" });
  if (!value) return new Response("not found", { status: 404 });
  return new Response(value, { headers: { "Content-Type": metadata?.type || "image/png", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
