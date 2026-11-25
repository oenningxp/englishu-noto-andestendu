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
  if (model.includes("melotts")) return { audio: btoa("fake-mp3") };
  const sys = input.messages[0].content;
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
assert.equal((await call("chat", { text: "again" })).status, 429, "limite diário do amigo (4)");
const tts = await call("tts", { text: "Hello" }); assert.equal(new TextDecoder().decode(tts.data), "fake-mp3");
assert.equal((await call("settings", { voice: "phone", rate: 5, auto: false })).data.settings.rate, 1.3);
assert.equal((await call("me")).data.state.msgs.length, 3, "a conversa fica salva no servidor");
assert.equal((await call("reset", {})).data.state.msgs.length, 0);
await call("logout", {}); assert.equal((await call("me")).data.user, null);
const evil = await worker.fetch(new Request("https://papo.test/api/reset", { method: "POST", headers: { Origin: "https://mal.test" } }), env);
assert.equal(evil.status, 403);
console.log("worker ok");
