// Teste do servidor com banco SQLite de mentira (no lugar do D1) e IA de mentira.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import worker from "../src/worker.js";
import { hashPassword, newTotpSecret, totpAt } from "../src/auth.js";

const db = new DatabaseSync(":memory:");
const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  first: async () => db.prepare(sql).get(...args) ?? null,
  run: async () => { db.prepare(sql).run(...args); return { success: true }; },
  all: async () => ({ results: db.prepare(sql).all(...args) })
});
const DB = { prepare: sql => stmt(sql), batch: async list => { for (const s of list) await s.run(); return []; } };
db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE, nick TEXT, pass_hash TEXT, pass_salt TEXT, totp_secret TEXT, totp_on INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending', fail_count INTEGER DEFAULT 0, locked_until INTEGER DEFAULT 0, avatar TEXT, nick_color TEXT)`);
const secret = newTotpSecret(), { hash, salt } = await hashPassword("senha1234");
db.prepare("INSERT INTO users (id,username,nick,pass_hash,pass_salt,totp_secret,totp_on,status) VALUES ('u1','amigo','Amigo',?,?,?,1,'active')").run(hash, salt, secret);

const calls = [];
const AI = { run: async (model, input) => {
  calls.push(model);
  if (model.includes("whisper")) return { text: " I live in a big sheep ", segments: [{ words: [{ word: "sheep", probability: 0.4 }] }] };
  if (model.includes("aura")) return new Response("fake-mp3").body;
  const sys = input.messages[0].content;
  if (sys.startsWith("You help a Brazilian beginner practice speaking Japanese")) return { response: { suggestions: [{ text: "アメリカが好{す}きです。", romaji: "Amerika ga suki desu.", pt: "Gosto da América." }] } };
  if (sys.startsWith("You are Juan") || sys.includes("Latin American Spanish")) return { response: { reply: "¡Hola! Soy Juan. ¿Te gusta el fútbol?", reply_pt: "Oi! Sou o Juan. Você gosta de futebol?", topic_pt: "Futebol", level: "A2", corrections: [{ type: "grammar", said: "yo gusto de fútbol", better: "me gusta el fútbol", informal: "", why_pt: "x", example: "Me gusta." }], corrected: "Me gusta el fútbol.", suggestions: [{ text: "¡Sí, me encanta!", pt: "Sim, adoro!" }] } };
  if (sys.startsWith("You are Nii") || sys.includes("careful Japanese teacher")) return { response: { reply: "こんにちは！ブラジル人{じん}ですか？", romaji: "Konnichiwa! Burajirujin desu ka?", reply_pt: "Oi! Você é brasileiro?", topic_pt: "Apresentação", level: "Iniciante", corrections: [], corrected: "", corrected_romaji: "" } };
  if (sys.startsWith("You help a Brazilian")) return { output: [{ type: "message", content: [{ type: "output_text", text: '{"explain_pt":"Mais fácil.","examples":[{"en":"I live on a ship.","pt":"Moro num navio.","emoji":"🚢"}]}' }] }] };
  if (sys.includes("did not understand your last message")) return { choices: [{ message: { content: '{"simple_en":"What is your job? 💼","hint_pt":"job = trabalho"}' } }] };
  if (model === "@cf/test/llm" && input.response_format) throw new Error("schema não suportado");
  return { response: { reply: "Cool! What do you do?", reply_pt: "Legal! O que você faz?", topic_pt: "Trabalho", level: "A2",
    corrections: [{ type: "pronunciation", said: "sheep", better: "ship", why_pt: "i curto." }], corrected: "I live on a big ship." } };
} };
const env = { DB, AI, IMAGES: {}, ASSETS: {}, MODEL: "@cf/test/llm", ADMIN_USERNAME: "oenningxp", DAILY_LIMIT: "4", FALLBACK_MODEL: "@cf/test/reserva" };

let cookie = "";
async function call(path, body, raw) {
  const init = { method: body === undefined ? "GET" : "POST", headers: { Origin: "https://papo.test", Cookie: cookie } };
  if (body !== undefined) init.body = raw ? body : JSON.stringify(body);
  const r = await worker.fetch(new Request("https://papo.test/api/" + path, init), env);
  const sc = r.headers.get("Set-Cookie"); if (sc) cookie = sc.split(";")[0];
  const ct = r.headers.get("Content-Type") || "";
  return { status: r.status, data: ct.includes("json") ? await r.json() : await r.arrayBuffer() };
}

assert.equal((await call("me")).data.user, null);
assert.equal((await call("login", { username: "amigo", password: "errada" })).status, 401);
assert.equal((await call("login", { username: "Amigo", password: "senha1234" })).data.stage, "totp");
assert.equal((await call("chat", { text: "hi" })).status, 401, "sem o código ainda não entra");
assert.equal((await call("login/totp", { code: "000000" })).status, 401);
const code = await totpAt(secret, Math.floor(Date.now() / 30000));
const t = await call("login/totp", { code });
assert.equal(t.status, 200); assert.equal(t.data.user.nick, "Amigo");

let r = await call("chat", {}); // abertura
assert.equal(r.status, 200); assert.equal(r.data.state.msgs.length, 1);
const stt = await call("stt", new Uint8Array([1, 2, 3]), true);
assert.equal(stt.data.text, "I live in a big sheep"); assert.deepEqual(stt.data.unsure, ["sheep"]);
r = await call("chat", { text: stt.data.text, spoken: true, unsure: stt.data.unsure });
const mine = r.data.state.msgs[1];
assert.equal(mine.role, "me"); assert.equal(mine.fix.items[0].better, "ship"); assert.equal(r.data.state.level, "A2");
const ex = await call("explain", { id: mine.id, idx: 0 });
assert.equal(ex.data.state.msgs[1].fix.items[0].more.examples[0].emoji, "🚢");
const sm = await call("simplify", { id: ex.data.state.msgs[2].id });
assert.equal(sm.data.state.msgs[2].simple.hint_pt, "job = trabalho");
assert.equal((await call("simplify", { id: mine.id })).status, 400, "só falas do Sam");
assert.equal((await call("chat", { text: "again" })).status, 200, "a primeira fala pronta não gasta cota");
assert.equal((await call("chat", { text: "again" })).status, 429, "limite diário do amigo (4)");
assert.equal((await call("tts", { text: "Hello" })).status, 429, "voz do servidor conta no limite do dia");
assert.equal((await call("settings", { voice: "phone", rate: 5, auto: false })).data.settings.rate, 1.3);
assert.equal((await call("me")).data.state.msgs.length, 5, "a conversa fica salva no servidor");
assert.equal((await call("reset", {})).data.state.msgs.length, 0);
await call("logout", {}); assert.equal((await call("me")).data.user, null);
const evil = await worker.fetch(new Request("https://papo.test/api/reset", { method: "POST", headers: { Origin: "https://mal.test" } }), env);
assert.equal(evil.status, 403);
// comandos do chat (usa a conta da Letícia, que ainda tem cota)
cookie = ""; await call("login", { username: "leticia", password: "123456" });
assert.equal((await call("cmd", { cmd: "save" })).data.note, "Não tem nada pra salvar ainda.");
let th = await call("theme", { topic: "food and cooking" });
assert.equal(th.status, 200); assert.equal(th.data.state.msgs.length, 1); assert.equal(th.data.state.dirty, true);
assert.equal((await call("cmd", { cmd: "new" })).data.confirm, "new", "pede confirmação se não salvou");
const sv = await call("cmd", { cmd: "save" }); assert.ok(sv.data.state.chatId); assert.equal(sv.data.state.dirty, false);
const chatId = sv.data.state.chatId;
assert.equal((await call("chats")).data.chats.length, 1);
const nw = await call("cmd", { cmd: "new" }); assert.equal(nw.data.state.msgs.length, 0, "salva: abre nova direto"); assert.equal(nw.data.state.chatId, null);
const op = await call("open", { id: chatId }); assert.equal(op.data.state.msgs.length, 1); assert.equal(op.data.state.chatId, chatId);
const cl = await call("cmd", { cmd: "clear" }); assert.equal(cl.data.state.msgs.length, 0); assert.equal(cl.data.state.chatId, chatId);
assert.equal((await call("open", { id: chatId })).data.state.msgs.length, 1, "/clear não mexe na cópia salva");
assert.equal((await call("cmd", { cmd: "delete" })).data.confirm, "delete");
const dl = await call("cmd", { cmd: "delete", force: true }); assert.equal(dl.data.state.msgs.length, 0);
assert.equal((await call("chats")).data.chats.length, 0, "/delete apaga a salva");
assert.equal((await call("open", { id: chatId })).status, 404);
assert.equal((await call("cmd", { cmd: "xyz" })).status, 400);

// Nii (japonês): conversa separada da do Sam
cookie = ""; await call("login", { username: "isabella", password: "123456" });
const enMe = await call("chat", {}); const enFirst = enMe.data.state.msgs[0].text;
assert.equal(enMe.data.state.msgs[0].sug.length, 4, "primeira fala pronta já vem com 4 sugestões");
const ja = await call("chat", { lang: "ja" });
assert.equal(ja.data.state.msgs.length, 1); assert.match(ja.data.state.msgs[0].romaji, /Konnichiwa/); assert.match(ja.data.state.msgs[0].text, /ニイ/);
const r1 = await worker.fetch(new Request("https://papo.test/api/me?lang=ja", { headers: { Cookie: cookie } }), env);
assert.match((await r1.json()).state.msgs[0].text, /ニイ/);
assert.equal((await call("me")).data.state.msgs[0].text, enFirst, "o Sam continua com a conversa dele");
const ms = await call("moresug", { id: ja.data.state.msgs[0].id, lang: "ja" });
assert.equal((await call("sug", { id: ja.data.state.msgs[0].id, lang: "ja" })).status, 200, "já tem sugestões: não pede de novo");
assert.equal(ms.data.state.msgs[0].sug[0].romaji, "Amerika ga suki desu.");
assert.ok((await call("cmd", { cmd: "save", lang: "ja" })).data.state.chatId);
assert.equal((await call("chats")).data.chats.length, 0, "conversas salvas do Sam não mostram as do Nii");
const r2 = await worker.fetch(new Request("https://papo.test/api/chats?lang=ja", { headers: { Cookie: cookie } }), env);
assert.equal((await r2.json()).chats.length, 1);
assert.equal((await call("tts", { text: "私{わたし}です", lang: "ja" })).status, 501, "japonês: voz do aparelho");
const tts = await call("tts", { text: "Hello" }); assert.equal(new TextDecoder().decode(tts.data), "fake-mp3", "inglês: Aura");
assert.equal((await call("tts-check")).status, 403, "diagnóstico só pro dono");

// Juan (espanhol): terceira conversa separada (conta nova, com cota)
cookie = ""; await call("login", { username: "liane", password: "123456" }); const lianeFirst = (await call("chat", {})).data.state.msgs[0].text;
const es1 = await call("chat", { text: "yo gusto de fútbol", lang: "es" });
assert.equal(es1.status, 200); assert.equal(es1.data.state.msgs[0].fix.items[0].better, "me gusta el fútbol"); assert.equal(es1.data.state.msgs[1].sug, undefined, "sugestões só quando pedir");
assert.equal((await call("me")).data.state.msgs[0].text, lianeFirst, "Sam continua igual");
const esTts = await call("tts", { text: "Hola", lang: "es" }); assert.equal(new TextDecoder().decode(esTts.data), "fake-mp3", "espanhol: voz Aura-2-es");

// exportação: só o dono, sem nomes
assert.equal((await call("admin/export")).status, 403);
db.prepare("INSERT INTO users (id,username,nick,pass_hash,pass_salt,totp_secret,totp_on,status) VALUES ('u9','oenningxp','Dono',?,?,?,1,'active')").run(hash, salt, secret);
cookie = ""; await call("login", { username: "oenningxp", password: "senha1234" });
await call("login/totp", { code: await totpAt(secret, Math.floor(Date.now() / 30000)) });
const ex2 = await call("admin/export"); const exp = ex2.data;
assert.equal(ex2.status, 200); assert.equal(exp.total_conversas, 1); assert.equal(exp.conversas[0].pessoa, "aluno-1"); assert.equal(exp.conversas[0].idioma, "ja");
assert.ok(!JSON.stringify(exp).includes("isabella"), "sem nomes de usuário");

// contas só do Englishu (sem 2FA)
cookie = "";
assert.equal((await call("login", { username: "Amanda", password: "errada" })).status, 401);
const la = await call("login", { username: "amanda", password: "123456" });
assert.equal(la.status, 200); assert.equal(la.data.user.nick, "Amanda"); assert.equal(la.data.user.local, true); assert.equal(la.data.user.owner, false);
assert.equal((await call("me")).data.user.username, "amanda");
assert.equal((await call("chat", {})).status, 200, "conversa normal");
assert.equal((await call("password", { old: "x", new: "nova1234" })).status, 401);
assert.equal((await call("password", { old: "123456", new: "nova1234" })).status, 200);
await call("logout", {});
assert.equal((await call("login", { username: "amanda", password: "123456" })).status, 401, "senha antiga não vale mais");
assert.equal((await call("login", { username: "amanda", password: "nova1234" })).status, 200);
for (const u of ["leticia", "isabella", "liane", "manoel", "vitoria", "maria", "wictor", "rodrigo", "jackson"]) { cookie = ""; assert.equal((await call("login", { username: u, password: "123456" })).status, 200, u); }
console.log("worker ok");
