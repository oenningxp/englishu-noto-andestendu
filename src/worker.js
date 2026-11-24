// Englishu Noto Andestêndu: site, login com a conta do Gothic e a IA (Workers AI).
import { checkPassword, hashPassword, checkTotp, randomToken, sha256 } from "./auth.js";
import { SYSTEM, SCHEMA, buildPrompt, parseReply, unsureWords } from "./tutor.js";

const SESSION_DAYS = 30, MAX_MSGS = 200, MAX_AUDIO = 3 * 1024 * 1024;
const STT_MODEL = "@cf/openai/whisper-large-v3-turbo", TTS_MODEL = "@cf/myshell-ai/melotts";
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

// ---------- tabelas do Papo (as contas são as do Gothic, tabela users, só leitura)
let ready = false;
async function ensureTables(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS papo_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, stage TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS papo_state (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS papo_usage (user_id TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (user_id, day))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS login_fails (k TEXT PRIMARY KEY, n INTEGER NOT NULL, since INTEGER NOT NULL)")
  ]);
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
  const row = await env.DB.prepare("SELECT s.token_hash,s.stage,s.expires_at,u.* FROM papo_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?").bind(await sha256(t)).first();
  return row && row.expires_at > Date.now() ? row : null;
}
const isOwner = (env, u) => !!u && u.username === String(env.ADMIN_USERNAME || "").toLowerCase();
const meOut = (env, u) => ({ username: u.username, nick: u.nick, avatar: u.avatar || null, color: u.nick_color || null, owner: isOwner(env, u) });

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
async function registerFail(env, id) {
  const r = await env.DB.prepare("UPDATE users SET fail_count=fail_count+1 WHERE id=? RETURNING fail_count").bind(id).first();
  if (r && r.fail_count >= 5) await env.DB.prepare("UPDATE users SET fail_count=0, locked_until=? WHERE id=?").bind(Date.now() + 15 * 60000, id).run();
}

// ---------- estado da conversa (fica no servidor: celular e computador veem a mesma)
const blank = () => ({ msgs: [], topic: "", level: "", n: 0, settings: { voice: "server", rate: 0.95, auto: true } });
async function loadState(env, uid) {
  const r = await env.DB.prepare("SELECT data FROM papo_state WHERE user_id=?").bind(uid).first();
  try { return r ? { ...blank(), ...JSON.parse(r.data) } : blank(); } catch { return blank(); }
}
async function saveState(env, uid, st) {
  st.msgs = st.msgs.slice(-MAX_MSGS);
  await env.DB.prepare("INSERT INTO papo_state (user_id,data,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at").bind(uid, JSON.stringify(st), Date.now()).run();
}
const spDay = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
async function useQuota(env, u) {
  if (isOwner(env, u)) return true;
  const lim = parseInt(env.DAILY_LIMIT || "120", 10) || 120;
  const r = await env.DB.prepare("INSERT INTO papo_usage (user_id,day,n) VALUES (?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET n=n+1 RETURNING n").bind(u.id, spDay()).first();
  return !r || r.n <= lim;
}
const quotaErr = e => /4006|daily free allocation|neurons|quota|rate limit/i.test(String(e && (e.message || e)));

// ---------- IA
async function askSam(env, st, opts) {
  const input = { messages: [{ role: "system", content: SYSTEM }, { role: "user", content: buildPrompt(st, opts) }], max_tokens: 700, temperature: 0.6 };
  let r;
  try { r = await env.AI.run(env.MODEL, { ...input, response_format: { type: "json_schema", json_schema: SCHEMA } }); }
  catch (e) { if (quotaErr(e)) throw e; r = await env.AI.run(env.MODEL, input); } // modelo sem modo JSON: pede de novo sem ele
  let out = parseReply(r && (r.response ?? r.result ?? r));
  if (!out) { r = await env.AI.run(env.MODEL, input); out = parseReply(r && (r.response ?? r)); }
  return out;
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
    const u = await env.DB.prepare("SELECT * FROM users WHERE username=?").bind(username).first();
    if (u && u.locked_until > now) return err("Muitas tentativas. Tente de novo em alguns minutos.", 429);
    const pw = String(body.password || "");
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
  if (path === "me") return json({ user: meOut(env, s), state: await loadState(env, s.id) });

  // --- conversa
  if ((path === "chat" || path === "skip") && method === "POST") {
    const st = await loadState(env, s.id); let extra = "", unsure = [];
    if (path === "chat") {
      const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, 600);
      if (text) { st.msgs.push({ role: "me", id: "m" + (++st.n), text, spoken: !!body.spoken }); unsure = Array.isArray(body.unsure) ? body.unsure.map(String).slice(0, 10) : []; }
      else if (st.msgs.length) return err("Mensagem vazia.");
    } else extra = "The learner asked to change the topic. Briefly acknowledge, start a clearly different topic, and return an empty corrections list.";
    if (!(await useQuota(env, s))) return err("Você chegou no limite de falas de hoje. Amanhã tem mais!", 429);
    let r;
    try { r = await askSam(env, st, { extra, unsure }); }
    catch (e) { console.error(e); if (quotaErr(e)) return err(QUOTA, 429); return err("O Sam não respondeu. Tente de novo.", 502); }
    if (!r) return err("O Sam se enrolou na resposta. Tente de novo.", 502);
    const last = st.msgs[st.msgs.length - 1];
    if (last && last.role === "me" && !extra) last.fix = { items: r.corrections, corrected: r.corrected };
    if (r.topic_pt) st.topic = r.topic_pt;
    if (r.level) st.level = r.level;
    st.msgs.push({ role: "ai", id: "m" + (++st.n), text: r.reply, pt: r.reply_pt });
    await saveState(env, s.id, st);
    return json({ state: st });
  }
  if (path === "reset" && method === "POST") { const st = await loadState(env, s.id), nst = blank(); nst.settings = st.settings; nst.level = st.level; await saveState(env, s.id, nst); return json({ state: nst }); }
  if (path === "settings" && method === "POST") {
    const st = await loadState(env, s.id), v = body || {};
    st.settings = { voice: v.voice === "phone" ? "phone" : "server", rate: Math.min(1.3, Math.max(0.7, +v.rate || 0.95)), auto: v.auto !== false };
    await saveState(env, s.id, st); return json({ settings: st.settings });
  }

  // --- voz: ouvir (Whisper) e falar (MeloTTS)
  if (path === "stt" && method === "POST") {
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX_AUDIO) return err("Áudio vazio ou longo demais (máx. 30 s).");
    try {
      const r = await env.AI.run(STT_MODEL, { audio: b64(buf), language: "en" });
      return json({ text: String(r && r.text || "").replace(/\s+/g, " ").trim(), unsure: unsureWords(r) });
    } catch (e) { console.error(e); return err(quotaErr(e) ? QUOTA : "Não consegui entender o áudio. Tente de novo.", quotaErr(e) ? 429 : 502); }
  }
  if (path === "tts" && method === "POST") {
    const text = String(body.text || "").trim().slice(0, 600); if (!text) return err("Sem texto.");
    try {
      const r = await env.AI.run(TTS_MODEL, { prompt: text, lang: "en" });
      const a = r && r.audio;
      const bytes = typeof a === "string" ? Uint8Array.from(atob(a), c => c.charCodeAt(0)) : a instanceof Uint8Array || a instanceof ArrayBuffer ? a : r instanceof ReadableStream ? r : null;
      if (!bytes) return err("Voz indisponível.", 502);
      return new Response(bytes, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" } });
    } catch (e) { console.error(e); return err(quotaErr(e) ? QUOTA : "Voz indisponível.", quotaErr(e) ? 429 : 502); }
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
