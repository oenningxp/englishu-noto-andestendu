// Englishu Noto Andestêndu: site, login com a conta do Gothic e a IA (Workers AI).
import { checkPassword, hashPassword, checkTotp, randomToken, sha256 } from "./auth.js";
import * as EN from "./tutor.js";
import * as JA from "./tutor-ja.js";
import * as ES from "./tutor-es.js";
import { unsureWords, aiText } from "./tutor.js";
import { parts, REPLY_SCHEMA, CHECK_SCHEMA, SUG_SCHEMA, checkPrompt, sugPrompt, parseReplyOnly, parseCheck, parseSug } from "./pipeline.js";
import { opener } from "./openers.js";

// os dois professores: Sam (inglês americano) e Nii (japonês)
const TUTORS = {
  en: { lang: "en", name: "Sam", system: () => EN.SYSTEM, SCHEMA: EN.SCHEMA, buildPrompt: EN.buildPrompt, parseReply: EN.parseReply, EXPLAIN_SYSTEM: EN.EXPLAIN_SYSTEM, EXPLAIN_SCHEMA: EN.EXPLAIN_SCHEMA, explainPrompt: EN.explainPrompt, parseExplain: EN.parseExplain, SIMPLIFY_SYSTEM: EN.SIMPLIFY_SYSTEM, SIMPLIFY_SCHEMA: EN.SIMPLIFY_SCHEMA, simplifyPrompt: EN.simplifyPrompt, parseSimplify: EN.parseSimplify, MORE_SUG_SYSTEM: EN.MORE_SUG_SYSTEM, MORE_SUG_SCHEMA: EN.MORE_SUG_SCHEMA, moreSugPrompt: EN.moreSugPrompt, parseMoreSug: EN.parseMoreSug, stt: "en", tts: "en", plain: t => t },
  es: { lang: "es", name: "Juan", system: ES.system, SCHEMA: ES.SCHEMA, buildPrompt: ES.buildPrompt, parseReply: ES.parseReply, EXPLAIN_SYSTEM: ES.EXPLAIN_SYSTEM, EXPLAIN_SCHEMA: ES.EXPLAIN_SCHEMA, explainPrompt: ES.explainPrompt, parseExplain: ES.parseExplain, SIMPLIFY_SYSTEM: ES.SIMPLIFY_SYSTEM, SIMPLIFY_SCHEMA: ES.SIMPLIFY_SCHEMA, simplifyPrompt: ES.simplifyPrompt, parseSimplify: ES.parseSimplify, MORE_SUG_SYSTEM: ES.MORE_SUG_SYSTEM, MORE_SUG_SCHEMA: ES.MORE_SUG_SCHEMA, moreSugPrompt: ES.moreSugPrompt, parseMoreSug: ES.parseMoreSug, stt: "es", tts: "es", plain: t => t },
  ja: { lang: "ja", name: "Nii", system: JA.system, SCHEMA: JA.SCHEMA, buildPrompt: JA.buildPrompt, parseReply: JA.parseReply, EXPLAIN_SYSTEM: JA.EXPLAIN_SYSTEM, EXPLAIN_SCHEMA: JA.EXPLAIN_SCHEMA, explainPrompt: JA.explainPrompt, parseExplain: JA.parseExplain, SIMPLIFY_SYSTEM: JA.SIMPLIFY_SYSTEM, SIMPLIFY_SCHEMA: JA.SIMPLIFY_SCHEMA, simplifyPrompt: JA.simplifyPrompt, parseSimplify: JA.parseSimplify, MORE_SUG_SYSTEM: JA.MORE_SUG_SYSTEM, MORE_SUG_SCHEMA: JA.MORE_SUG_SCHEMA, moreSugPrompt: JA.moreSugPrompt, parseMoreSug: JA.parseMoreSug, stt: "ja", tts: "jp", plain: JA.plain }
};

const SESSION_DAYS = 30, MAX_MSGS = 200, MAX_AUDIO = 3 * 1024 * 1024;
const STT_MODEL = "@cf/openai/whisper-large-v3-turbo", TTS_MODEL = "@cf/deepgram/aura-2-en", TTS_SPEAKER = "arcas";
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers });
const err = (msg, status = 400) => json({ error: msg }, status);
const QUOTA = "A cota grátis de IA de hoje acabou. Ela volta às 21h (horário de Brasília).";

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), p = url.pathname;
    try {
      if (p.startsWith("/img/")) return image(env, p.slice(5));
      if (p.startsWith("/api/")) {
        if (req.method !== "GET" && !sameOrigin(req, url)) return err("origem inválida", 403);
        await ensureTables(env);
        return await api(req, env, p.slice(5), ctx);
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
  ["wictor", "Wictor", "7uJWuM7MQlU2UxdKfFbrbQ", "OsbHBSoXmJZOPYLndgj4TdHuM6U6tI5YEcDL076Kroo"],
  ["rodrigo", "Rodrigo", "Lv7eKAldfKdNeNcQesyOGg", "zTGgxM9QgTNTlClw-dQmzNYkvtO80VbGsNn_THTF9Mg"],
  ["jackson", "Jackson", "6pOgwioFKrSKCGWNEYsH6w", "Gvz70r4biEK0WEoUrMnY7RHW3wCdJyM8GMTD212VmLU"]
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
    env.DB.prepare("CREATE TABLE IF NOT EXISTS papo_groq (user_id TEXT NOT NULL, day TEXT NOT NULL, model TEXT NOT NULL, amount REAL NOT NULL, calls INTEGER NOT NULL, PRIMARY KEY (user_id, day, model))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS papo_neurons (user_id TEXT NOT NULL, day TEXT NOT NULL, task TEXT NOT NULL, neurons REAL NOT NULL, calls INTEGER NOT NULL, PRIMARY KEY (user_id, day, task))"),
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
// só o erro de cota da Cloudflare (4006); outros erros não podem virar "a cota acabou"
const quotaErr = e => /\b4006\b|daily free allocation/i.test(String(e && (e.message || e)));
const errText = e => String(e && (e.message || e) || "").slice(0, 200);

// ---------- IA
// pede JSON à IA. Tenta os modelos em ordem; para cada um, guarda qual jeito de pedir funcionou (evita repetir erros).
// gpt-oss é um modelo que "pensa" antes de responder: pedimos pouco raciocínio onde a pessoa está esperando.
const modeOk = new Map();
// ---------- medidor de cota (estimativa): neurons por milhão de tokens [entrada, saída], tabela de preços da Cloudflare
const RATES = {
  "@cf/openai/gpt-oss-120b": [31818, 68182], "@cf/openai/gpt-oss-20b": [18182, 27273],
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": [26668, 204805], "@cf/meta/llama-4-scout-17b-16e-instruct": [24545, 77273]
};
const STT_PER_MIN = 46.63, TTS_PER_1K_CHARS = 2727.27, FREE_NEURONS = 10000;
const utcDay = () => new Date().toISOString().slice(0, 10); // a cota da Cloudflare vira às 00:00 UTC (21h em Brasília)
function llmNeurons(model, r, inChars, outText) {
  const u = (r && r.usage) || {};
  const tin = u.prompt_tokens ?? u.input_tokens ?? Math.ceil(inChars / 3.5);
  const tout = u.completion_tokens ?? u.output_tokens ?? Math.ceil(String(outText || "").length / 3.5) + (/gpt-oss/.test(model) ? 150 : 0);
  const [a, b] = RATES[model] || [30000, 70000];
  return (tin * a + tout * b) / 1e6;
}
async function meter(env, uid, task, neurons) {
  if (!uid || !(neurons > 0)) return;
  try { await env.DB.prepare("INSERT INTO papo_neurons (user_id,day,task,neurons,calls) VALUES (?,?,?,?,1) ON CONFLICT(user_id,day,task) DO UPDATE SET neurons=neurons+excluded.neurons, calls=calls+1").bind(uid, utcDay(), task, neurons).run(); }
  catch (e) { console.error("meter", e); }
}
const stats = []; // últimos tempos (para /api/admin/speed)
function modesFor(model, effort) {
  const m = [];
  if (/gpt-oss/.test(model)) m.push("responses");
  m.push("schema", "plain");
  const ok = modeOk.get(model + "|" + effort);
  return ok ? [ok, ...m.filter(x => x !== ok)] : m;
}
function inputFor(mode, system, user, schema, maxTokens, effort) {
  if (mode === "responses") return { instructions: system, input: user, reasoning: { effort } };
  const base = { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens, temperature: 0.5 };
  return mode === "schema" ? { ...base, response_format: { type: "json_schema", json_schema: schema } } : base;
}
// ---------- Groq: reserva grátis (mesmo modelo gpt-oss) quando a cota da Cloudflare acaba.
// Só funciona com a chave GROQ_API_KEY cadastrada como segredo do Worker. PREFER_GROQ=1 usa a Groq primeiro.
const GROQ_URL = "https://api.groq.com/openai/v1";
let cfBlockedDay = ""; // dia (UTC) em que a Cloudflare respondeu "cota acabou": pula direto pra Groq até virar o dia
const cfBlocked = () => cfBlockedDay === utcDay();
// ordem dos modelos externos grátis: Groq (cada modelo tem a sua cota diária) e depois Mistral
const groqModels = task => task === "sugestões" ? ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"] : ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"];
const mistralModels = task => task === "sugestões" ? ["mistral-small-latest", "mistral-medium-latest"] : ["mistral-medium-latest", "mistral-small-latest"];
function externalList(env, task) {
  return [...(env.GROQ_API_KEY ? groqModels(task).map(m => ["groq", m]) : []), ...(env.MISTRAL_API_KEY ? mistralModels(task).map(m => ["mistral", m]) : [])];
}
const stripThink = t => String(t || "").replace(/<think>[\s\S]*?<\/think>/g, ""); // modelos que "pensam em voz alta" (Qwen)
async function mistralJson(env, model, system, user, maxTokens, uid) {
  const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST", headers: { Authorization: "Bearer " + env.MISTRAL_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens + 300, temperature: 0.5, response_format: { type: "json_object" } })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`mistral ${r.status}: ${String((d && (d.message || (d.error && d.error.message))) || "").slice(0, 160)}`);
  const content = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
  await meterGroq(env, uid, "mistral:" + model, (d.usage && d.usage.total_tokens) || Math.ceil((system.length + user.length + content.length) / 3.5));
  return typeof content === "string" ? content : JSON.stringify(content);
}
// medidor da Groq: tokens por modelo (texto) e segundos de áudio (Whisper), por pessoa e por dia
async function meterGroq(env, uid, model, amount) {
  if (!uid || !(amount > 0)) return;
  try { await env.DB.prepare("INSERT INTO papo_groq (user_id,day,model,amount,calls) VALUES (?,?,?,?,1) ON CONFLICT(user_id,day,model) DO UPDATE SET amount=amount+excluded.amount, calls=calls+1").bind(uid, utcDay(), model, amount).run(); }
  catch (e) { console.error("meterGroq", e); }
}
async function groqJson(env, model, system, user, maxTokens, effort, uid) {
  const r = await fetch(GROQ_URL + "/chat/completions", {
    method: "POST", headers: { Authorization: "Bearer " + env.GROQ_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_completion_tokens: maxTokens + 1000, temperature: 0.5, response_format: { type: "json_object" }, ...(/gpt-oss/.test(model) ? { reasoning_effort: effort } : {}) })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`groq ${r.status}: ${(d.error && d.error.message || "").slice(0, 160)}`);
  const content = stripThink((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "");
  await meterGroq(env, uid, model, (d.usage && d.usage.total_tokens) || Math.ceil((system.length + user.length + content.length) / 3.5));
  return content;
}
async function groqStt(env, buf, language, uid) {
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "audio/wav" }), "audio.wav");
  fd.append("model", "whisper-large-v3-turbo"); fd.append("language", language); fd.append("response_format", "json");
  const r = await fetch(GROQ_URL + "/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + env.GROQ_API_KEY }, body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`groq ${r.status}: ${(d.error && d.error.message || "").slice(0, 160)}`);
  await meterGroq(env, uid, "whisper-large-v3-turbo", Math.max(10, Math.max(0, buf.byteLength - 44) / 32000)); // a Groq cobra no mínimo 10 s por áudio
  return String(d.text || "");
}
async function aiJson(env, system, user, schema, parse, maxTokens = 1400, opt = {}) {
  const effort = opt.effort || "low", task = opt.task || "?";
  const log = x => { stats.push({ task, effort, ...x }); if (stats.length > 40) stats.shift(); };
  const ext = externalList(env, task), hasGroq = ext.length > 0;
  const tryGroq = async list => {
    for (const [prov, gm] of list) {
      const t0 = Date.now();
      try {
        const txt = prov === "mistral" ? await mistralJson(env, gm, system, user, maxTokens, opt.uid) : await groqJson(env, gm, system, user, maxTokens, effort, opt.uid);
        const out = parse(txt); log({ model: prov + ":" + gm, ms: Date.now() - t0, ok: !!out }); if (out) return out;
      } catch (e) { log({ model: prov + ":" + gm, ms: Date.now() - t0, ok: false, error: String(e && e.message || e).slice(0, 160) }); console.error(prov, gm, e); }
    }
    return null;
  };
  if (opt.only && /^(groq|mistral):/.test(opt.only)) { const i = opt.only.indexOf(":"); return tryGroq([[opt.only.slice(0, i), opt.only.slice(i + 1)]]); }
  const groqFirst = hasGroq && !opt.only && (env.PREFER_GROQ === "1" || cfBlocked());
  if (groqFirst) { const out = await tryGroq(ext); if (out) return out; }
  const models = opt.only ? [opt.only] : [...new Set([...(opt.models || []), env.MODEL, env.FALLBACK_MODEL].filter(Boolean))];
  let lastErr = null;
  cf: for (const model of models) {
    for (const mode of modesFor(model, effort)) {
      const t0 = Date.now();
      try {
        const r = await env.AI.run(model, inputFor(mode, system, user, schema, maxTokens, effort));
        const txt = aiText(r), out = parse(txt);
        await meter(env, opt.uid, task, llmNeurons(model, r, system.length + user.length, typeof txt === "string" ? txt : JSON.stringify(txt)));
        log({ model, mode, ms: Date.now() - t0, ok: !!out });
        if (out) { modeOk.set(model + "|" + effort, mode); return out; }
      } catch (e) {
        log({ model, mode, ms: Date.now() - t0, ok: false, error: String(e && e.message || e).slice(0, 160) });
        lastErr = e; console.error(model, mode, e);
        if (quotaErr(e)) { cfBlockedDay = utcDay(); break cf; } // cota da Cloudflare acabou: não adianta tentar outro modelo dela
      }
    }
  }
  if (lastErr && quotaErr(lastErr) && hasGroq && !groqFirst && !opt.only) { const out = await tryGroq(ext); if (out) return out; }
  if (lastErr) throw lastErr;
  return null;
}
// os 3 pedidos do professor (ver pipeline.js)
const partsCache = new Map();
function tutorParts(T, nick) {
  const full = T.system(nick), key = T.lang + "|" + full.length + "|" + nick;
  if (!partsCache.has(key)) partsCache.set(key, parts(full, T.lang));
  return partsCache.get(key);
}
const replyModels = env => (env.REPLY_MODEL ? [env.REPLY_MODEL] : []);
const askReply = (env, T, nick, st, opts, uid) => aiJson(env, tutorParts(T, nick).reply, T.buildPrompt(st, opts), REPLY_SCHEMA, parseReplyOnly(T.parseReply), 700, { models: replyModels(env), effort: "low", task: "resposta", uid });
const askCheck = (env, T, nick, st, unsure, uid) => aiJson(env, tutorParts(T, nick).check, checkPrompt(st, T.name, unsure, T.plain), CHECK_SCHEMA, parseCheck(T.parseReply), 1200, { effort: env.CHECK_EFFORT || "low", task: "correção", uid });
// sugestões: modelo menor e mais barato (SUG_MODEL), só quando a pessoa pede
const askSug = (env, T, nick, st, aiMsg, uid) => aiJson(env, tutorParts(T, nick).sug, sugPrompt(st, aiMsg, T.plain), SUG_SCHEMA, parseSug, 900, { models: env.SUG_MODEL ? [env.SUG_MODEL] : replyModels(env), effort: "low", task: "sugestões", uid });
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
const VOICES = { en: { model: TTS_MODEL, speaker: TTS_SPEAKER }, es: { model: "@cf/deepgram/aura-2-es" } }; // espanhol: voz padrão da Deepgram
async function serverVoice(env, text, lang) {
  const v = VOICES[lang];
  if (!v) return { bytes: null, tried: [{ model: "nenhum", error: "sem voz do servidor para este idioma" }] };
  try {
    const bytes = await toBytes(await env.AI.run(v.model, { text, ...(v.speaker ? { speaker: v.speaker } : {}), encoding: "mp3" }));
    return { bytes: bytes && bytes.byteLength ? bytes : null, tried: [{ model: v.model, size: bytes ? bytes.byteLength : 0 }] };
  } catch (e) { if (quotaErr(e)) throw e; return { bytes: null, tried: [{ model: v.model, error: String(e && e.message || e).slice(0, 300) }] }; }
}
const b64 = buf => { let s = ""; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };

// ---------- API
async function api(req, env, path, ctx) {
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
  const askedLang = body.lang || new URL(req.url).searchParams.get("lang");
  const lang = TUTORS[askedLang] ? askedLang : "en", T = TUTORS[lang];
  const sk = lang === "en" ? s.id : lang + ":" + s.id; // cada idioma tem a sua conversa
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
    // "Começar conversa": primeira fala pronta, sem esperar a IA (nem gastar cota)
    if (path === "chat" && !st.msgs.length) {
      const o = opener(lang, s.nick);
      st.topic = o.topic_pt;
      st.msgs.push({ role: "ai", id: "m" + (++st.n), text: o.reply, pt: o.reply_pt, ...(o.romaji ? { romaji: o.romaji } : {}), ...(o.suggestions.length ? { sug: o.suggestions } : {}) });
      st.dirty = true; await saveState(env, sk, st);
      return json({ state: st });
    }
    if (!(await useQuota(env, s))) return err("Você chegou no limite de falas de hoje. Amanhã tem mais!", 429);
    const last = st.msgs[st.msgs.length - 1];
    const learner = last && last.role === "me" && !extra ? last : null;
    // correções começam junto com a resposta (em paralelo); a pessoa só espera a resposta
    const checkP = learner ? askCheck(env, T, s.nick, st, unsure, s.id).catch(e => { console.error(e); return null; }) : null;
    let r;
    try { r = await askReply(env, T, s.nick, st, { extra, unsure }, s.id); }
    catch (e) { console.error(e); if (quotaErr(e)) return err(QUOTA + (isOwner(env, s) ? " [" + errText(e) + "]" : ""), 429); return err(`O ${T.name} não respondeu. Tente de novo.` + (isOwner(env, s) ? " [" + errText(e) + "]" : ""), 502); }
    if (!r) return err(`O ${T.name} se enrolou na resposta. Tente de novo.`, 502);
    if (r.topic_pt) st.topic = r.topic_pt;
    if (r.level) st.level = r.level;
    const now = Date.now();
    const ai = { role: "ai", id: "m" + (++st.n), text: r.reply, pt: r.reply_pt, ...(r.romaji ? { romaji: r.romaji } : {}) };
    st.msgs.push(ai);
    if (learner) learner.pending = now;
    st.dirty = true;
    await saveState(env, sk, st);
    // depois de responder: termina as correções e grava quando ficarem prontas
    const followUp = (async () => {
      if (!checkP) return;
      const fix = await checkP;
      const cur = await loadState(env, sk), L = cur.msgs.find(m => m.id === learner.id);
      if (L) { L.fix = fix || { items: [], corrected: "", failed: !fix }; delete L.pending; await saveState(env, sk, cur); }
    })();
    if (ctx && ctx.waitUntil) { ctx.waitUntil(followUp); return json({ state: st }); }
    await followUp; return json({ state: await loadState(env, sk) });
  }
  // --- "explicar de outro jeito" (uma correção) e "não entendi" (uma fala do Sam)
  // --- sugestões de resposta (só quando a pessoa toca no botão, para economizar a cota)
  if ((path === "sug" || path === "moresug") && lang !== "ja") return err("Sugestões de resposta só no japonês.");
  if (path === "sug" && method === "POST") {
    const st = await loadState(env, sk), m = st.msgs.find(x => x.id === body.id);
    if (!m || m.role !== "ai") return err("Mensagem não encontrada.", 404);
    if (m.sug && m.sug.length) return json({ state: st });
    if (!(await useQuota(env, s))) return err("Você chegou no limite de falas de hoje. Amanhã tem mais!", 429);
    let sug;
    try { sug = await askSug(env, T, s.nick, st, m, s.id); }
    catch (e) { console.error(e); return err(quotaErr(e) ? QUOTA : "Não consegui criar sugestões agora. Tente de novo.", quotaErr(e) ? 429 : 502); }
    if (!sug) return err("Não consegui criar sugestões agora. Tente de novo.", 502);
    m.sug = sug; st.dirty = true; await saveState(env, sk, st);
    return json({ state: st });
  }
  // --- "Mais sugestões": troca as sugestões da última fala por outras novas
  if (path === "moresug" && method === "POST") {
    const st = await loadState(env, sk), m = st.msgs.find(x => x.id === body.id);
    if (!m || m.role !== "ai") return err("Mensagem não encontrada.", 404);
    if (!(await useQuota(env, s))) return err("Você chegou no limite de falas de hoje. Amanhã tem mais!", 429);
    let more;
    try { more = await aiJson(env, T.MORE_SUG_SYSTEM, T.moreSugPrompt(st, m), T.MORE_SUG_SCHEMA, T.parseMoreSug, 1200, { models: env.SUG_MODEL ? [env.SUG_MODEL] : [], task: "sugestões", uid: s.id }); }
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
      task = async () => { c.more = await aiJson(env, T.EXPLAIN_SYSTEM, T.explainPrompt(m.text, c, st.level), T.EXPLAIN_SCHEMA, T.parseExplain, 900, { task: "explicações", uid: s.id }); return c.more; };
    } else {
      if (m.role !== "ai") return err(`Só dá para simplificar falas do ${T.name}.`);
      if (m.simple) return json({ state: st });
      task = async () => { m.simple = await aiJson(env, T.SIMPLIFY_SYSTEM, T.simplifyPrompt(m.text), T.SIMPLIFY_SCHEMA, T.parseSimplify, 700, { task: "explicações", uid: s.id }); return m.simple; };
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
    const viaGroq = async () => json({ text: (await groqStt(env, buf, T.stt, s.id)).replace(/\s+/g, " ").trim(), unsure: [] });
    if (env.GROQ_API_KEY && (env.PREFER_GROQ === "1" || cfBlocked())) { try { return await viaGroq(); } catch (e) { console.error(e); } }
    try {
      const r = await env.AI.run(STT_MODEL, { audio: b64(buf), language: T.stt });
      await meter(env, s.id, "microfone", Math.max(0, buf.byteLength - 44) / 32000 / 60 * STT_PER_MIN);
      return json({ text: String(r && r.text || "").replace(/\s+/g, " ").trim(), unsure: unsureWords(r) });
    } catch (e) {
      console.error(e);
      if (quotaErr(e)) { cfBlockedDay = utcDay(); if (env.GROQ_API_KEY) { try { return await viaGroq(); } catch (e2) { console.error(e2); } } }
      return err(quotaErr(e) ? QUOTA : "Não consegui entender o áudio. Tente de novo.", quotaErr(e) ? 429 : 502);
    }
  }
  if (path === "tts" && method === "POST") {
    const text = T.plain(String(body.text || "")).trim().slice(0, 600); if (!text) return err("Sem texto.");
    try {
      if (!VOICES[lang]) return err("Sem voz do servidor para este idioma.", 501);
      if (!(await useQuota(env, s))) return err("Você chegou no limite de hoje. Use a voz do aparelho (Ajustes).", 429);
      const { bytes } = await serverVoice(env, text, lang);
      if (bytes) await meter(env, s.id, "voz do servidor", text.length / 1000 * TTS_PER_1K_CHARS);
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
  // painel de uso da cota (só o dono): /painel.html lê isto
  if (path === "admin/usage" && method === "GET") {
    if (!isOwner(env, s)) return err("Só o dono.", 403);
    const days = Math.min(14, Math.max(1, parseInt(new URL(req.url).searchParams.get("days") || "7", 10) || 7));
    const since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
    const rows = (await env.DB.prepare("SELECT user_id, day, task, neurons, calls FROM papo_neurons WHERE day>=? ORDER BY day").bind(since).all()).results || [];
    const ids = [...new Set(rows.map(r => r.user_id))], names = {};
    for (const id of ids) {
      const u = await env.DB.prepare(`SELECT username, nick FROM ${id.startsWith("p_") ? "papo_users" : "users"} WHERE id=?`).bind(id).first();
      names[id] = u ? { username: u.username, nick: u.nick, owner: id === s.id } : { username: "?", nick: "(conta removida)" };
    }
    const groq = (await env.DB.prepare("SELECT user_id, day, model, amount, calls FROM papo_groq WHERE day>=? ORDER BY day").bind(since).all()).results || [];
    for (const id of new Set(groq.map(r => r.user_id))) if (!names[id]) {
      const u = await env.DB.prepare(`SELECT username, nick FROM ${id.startsWith("p_") ? "papo_users" : "users"} WHERE id=?`).bind(id).first();
      names[id] = u ? { username: u.username, nick: u.nick, owner: id === s.id } : { username: "?", nick: "(conta removida)" };
    }
    // limites do plano grátis da Groq (por modelo, por dia); os números exatos da sua conta ficam no console da Groq
    const groqLimits = { "openai/gpt-oss-120b": { amount: 200000, calls: 1000, unit: "tokens" }, "qwen/qwen3.8-27b": { amount: 200000, calls: 1000, unit: "tokens" }, "openai/gpt-oss-20b": { amount: 200000, calls: 1000, unit: "tokens" }, "whisper-large-v3-turbo": { amount: 28800, calls: 2000, unit: "segundos de áudio" } };
    // Mistral: limite por mês (1 bilhão de tokens no plano grátis)
    const month = utcDay().slice(0, 7);
    const mistralMonth = (await env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS t, COALESCE(SUM(calls),0) AS c FROM papo_groq WHERE model LIKE 'mistral:%' AND day LIKE ?").bind(month + "%").first()) || { t: 0, c: 0 };
    return json({ today: utcDay(), free: FREE_NEURONS, since, rows, groq, groqLimits, mistral: { on: !!env.MISTRAL_API_KEY, month, tokens: mistralMonth.t, calls: mistralMonth.c, limit: 1e9 }, groqMode: env.GROQ_API_KEY ? (env.PREFER_GROQ === "1" ? "principal" : "reserva") : "sem chave", names, limit: parseInt(env.DAILY_LIMIT || "40", 10) || 40 });
  }
  // velocidade dos modelos (só o dono): /api/admin/speed?lang=en mede cada candidato com a mesma conversa de teste
  if (path === "admin/speed" && method === "GET") {
    if (!isOwner(env, s)) return err("Só o dono.", 403);
    const test = { msgs: [{ role: "ai", text: lang === "ja" ? "こんにちは！ニイです。げんきですか？" : lang === "es" ? "¡Hola! Soy Juan. ¿Cómo estás hoy?" : "Hi! I'm Sam. How's your day going?" }, { role: "me", text: lang === "ja" ? "genki desu, arigatou" : lang === "es" ? "Yo estoy bien, obrigado" : "Its going good, i working a lot today", spoken: false }], topic: "", level: "" };
    const cand = [...new Set([env.REPLY_MODEL, env.MODEL, "@cf/openai/gpt-oss-20b", "@cf/meta/llama-4-scout-17b-16e-instruct"].filter(Boolean)), ...(env.GROQ_API_KEY ? ["groq:openai/gpt-oss-120b", "groq:qwen/qwen3.8-27b", "groq:openai/gpt-oss-20b"] : []), ...(env.MISTRAL_API_KEY ? ["mistral:mistral-medium-latest", "mistral:mistral-small-latest"] : [])];
    const out = [];
    for (const model of cand) {
      const t0 = Date.now(); let ok = false, sample = "", error = "";
      try { const r = await aiJson(env, tutorParts(T, s.nick).reply, T.buildPrompt(test, {}), REPLY_SCHEMA, parseReplyOnly(T.parseReply), 700, { only: model, effort: "low", task: "teste de velocidade", uid: s.id }); ok = !!r; sample = r ? r.reply : ""; }
      catch (e) { error = String(e && e.message || e).slice(0, 160); }
      out.push({ model, ms: Date.now() - t0, ok, sample, error });
    }
    return json({ lang, reply_model: env.REPLY_MODEL || env.MODEL, check_model: env.MODEL, groq: env.GROQ_API_KEY ? (env.PREFER_GROQ === "1" ? "principal" : "reserva") : "sem chave", mistral: env.MISTRAL_API_KEY ? "ligada (depois da Groq)" : "sem chave", cloudflare_bloqueada_hoje: cfBlocked(), results: out, recent: stats.slice(-20) });
  }
  // diagnóstico da voz (só o dono): /api/tts-check?lang=ja mostra o que o servidor conseguiu gerar
  if (path === "tts-check" && method === "GET") {
    if (!isOwner(env, s)) return err("Só o dono.", 403);
    try { const { bytes, tried } = await serverVoice(env, lang === "es" ? "¡Hola! Soy Juan." : "Hello! This is Sam.", lang); return json({ ok: !!bytes, tried }); }
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
