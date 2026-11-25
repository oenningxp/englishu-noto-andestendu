// Englishu Noto Andestêndu: tela do celular/computador.
import { toKana } from "/kana.js";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TYPES = { grammar: "Gramática", pronunciation: "Pronúncia", vocab: "Vocabulário", register: "Formal × informal" };
const chat = $("#chat"), main = $("#main"), inp = $("#inp"), mic = $("#mic"), statusEl = $("#status");
let me = null, S = null, busy = false, waiting = "", sys = null, handsFree = false, practice = {}, rec = null, target = "chat";
const setStatus = t => { statusEl.textContent = t || ""; };
// idioma: "en" = Sam (inglês americano), "ja" = Nii (japonês)
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const LANGS = ["en", "ja", "es"];
let lang = LANGS.includes(store.get("lang", "en")) ? store.get("lang", "en") : "en";
const P = Object.assign({ furi: true, romaji: true, ptAlways: true, kanaInput: true }, store.get("jaPrefs", {}));
const NAME = () => ({ en: "Sam", ja: "Nii", es: "Juan" })[lang];
// japonês: 私{わたし} vira <ruby>私<rt>わたし</rt></ruby> (furigana); tudo escapado
const KANJI_END = /[\u3400-\u9fff\uf900-\ufaff々〆ヵヶ]+$/;
function ruby(text) {
  const t = String(text ?? ""); let out = "", last = 0; const re = /\{([^{}]*)\}/g; let m;
  while ((m = re.exec(t))) {
    const chunk = t.slice(last, m.index), k = chunk.match(KANJI_END);
    out += k ? esc(chunk.slice(0, k.index)) + `<ruby>${esc(k[0])}<rt>${esc(m[1])}</rt></ruby>` : esc(chunk);
    last = re.lastIndex;
  }
  return out + esc(t.slice(last));
}
const plainJ = t => String(t ?? "").replace(/\{[^{}]*\}/g, "");
const tx = t => lang === "ja" ? ruby(t) : esc(t);
const rom = r => lang === "ja" && r ? `<span class="romaji">${esc(r)}</span>` : "";

async function api(path, body, raw) {
  const opt = { method: body === undefined ? "GET" : "POST", credentials: "same-origin", headers: {} };
  if (raw) { opt.body = body; opt.headers["Content-Type"] = "audio/wav"; }
  else if (body !== undefined) { opt.body = JSON.stringify({ ...body, lang }); opt.headers["Content-Type"] = "application/json"; }
  const r = await fetch("/api/" + path + (body === undefined || raw ? "?lang=" + lang : ""), opt);
  if (path === "tts") { if (!r.ok) throw new Error("voz"); return r.blob(); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401 && path !== "login" && path !== "login/totp") showLogin(); throw new Error(d.error || "Erro de conexão."); }
  return d;
}

// ---------- entrar
function showLogin() { me = null; $("#app").hidden = true; $("#login").hidden = false; $("#fLogin").hidden = false; $("#fTotp").hidden = true; }
function showApp(d) {
  me = d.user; S = d.state; $("#login").hidden = true; $("#app").hidden = false;
  if (lang !== "en" && d.lang !== lang) { api("me").then(x => { if (x.user) { S = x.state; applyLang(); watchPending(); } }).catch(() => {}); }
  $("#av").innerHTML = me.avatar ? `<img alt="" src="/img/${encodeURIComponent(me.avatar)}">` : esc((me.nick || "?").slice(0, 1).toUpperCase());
  $("#who").textContent = `Conectado como ${me.nick} (${me.username})`;
  $("#pwBox").hidden = !me.local;
  $("#exportBtn").hidden = !me.owner; $("#panelBtn").hidden = !me.owner;
  applyLang(); watchPending();
}
// nome do site muda com o professor
function applyTitle() {
  const [a, b] = ({ ja: ["Japanese", "Understand"], es: ["Espanhol", "Compreendo"] })[lang] || ["Englishu", "Andestêndu"];
  document.querySelectorAll(".t1").forEach(e => e.textContent = a);
  document.querySelectorAll(".t2").forEach(e => e.textContent = b);
  document.title = `${a} 👎 ${b}`;
}
applyTitle();
function applyLang() {
  applyTitle();
  document.body.classList.toggle("ja", lang === "ja");
  document.body.classList.toggle("nofuri", lang === "ja" && !P.furi);
  document.body.classList.toggle("noromaji", lang === "ja" && !P.romaji);
  document.querySelectorAll("[data-lang]").forEach(b => b.setAttribute("aria-pressed", b.dataset.lang === lang));
  inp.placeholder = lang === "ja" ? (P.kanaInput ? "Fale, ou digite em romaji…" : "Fale ou digite em japonês…") : lang === "es" ? "Fale ou digite em espanhol…" : "Fale ou digite em inglês…";
  $("#voiceLbl").textContent = "Voz do " + NAME();
  $("#pSug").checked = sugOn(); $("#pSug").closest("label").hidden = lang !== "ja";
  $("#jaPrefs").hidden = lang !== "ja";
  $("#pFuri").checked = P.furi; $("#pRomaji").checked = P.romaji; $("#pPt").checked = P.ptAlways; $("#pKana").checked = P.kanaInput;
  $("#voice").value = S.settings.voice; $("#rate").value = S.settings.rate; $("#rateV").textContent = S.settings.rate + "x"; $("#auto").checked = S.settings.auto;
  render();
}
async function switchLang(l) {
  if (l === lang || busy) return;
  if (rec) await stopRec(); stopSpeak(); handsFree = false; sys = null; practice = {}; setStatus("");
  lang = l; store.set("lang", l); busy = true; applyLang();
  try { const d = await api("me"); busy = false; if (d.user) { S = d.state; applyLang(); watchPending(); } }
  catch (x) { busy = false; render(); setStatus(x.message); }
}
$("#fLogin").addEventListener("submit", async e => {
  e.preventDefault(); $("#lErr").textContent = "";
  try {
    const d = await api("login", { username: $("#lUser").value, password: $("#lPass").value });
    if (d.user) { $("#lPass").value = ""; showApp(d); return; } // conta do Englishu: entra direto
    $("#fLogin").hidden = true; $("#fTotp").hidden = false; $("#lCode").focus();
  }
  catch (x) { $("#lErr").textContent = x.message; }
});
$("#fTotp").addEventListener("submit", async e => {
  e.preventDefault(); $("#lErr").textContent = "";
  try { showApp(await api("login/totp", { code: $("#lCode").value })); $("#lPass").value = ""; $("#lCode").value = ""; }
  catch (x) { $("#lErr").textContent = x.message; }
});
$("#back").addEventListener("click", () => { $("#fLogin").hidden = false; $("#fTotp").hidden = true; $("#lErr").textContent = ""; });

// ---------- conversa
function render() {
  const t = $("#topic"), l = $("#level");
  t.hidden = !S.topic; t.textContent = S.topic ? "Assunto: " + S.topic : "";
  l.hidden = !S.level; l.textContent = S.level ? "Nível " + S.level : "";
  if (!S.msgs.length) {
    const intro = lang === "es"
      ? `<h2>¡Hola! Pronto pra conversar com o Juan?</h2><p>O Juan é um amigo latino-americano animado, que adora futebol, comida e música. Ele puxa papo em espanhol e corrige o portunhol no caminho. Responda falando ou digitando.</p>`
      : lang === "ja"
      ? `<h2>Pronto pra conversar com o Nii?</h2><p>O Nii é o seu irmão mais velho japonês e começa do zero com você. Tudo vem com furigana, romaji e tradução. Pode responder falando, em japonês ou digitando em romaji.</p>`
      : `<h2>Pronto pra conversar com o Sam?</h2><p>Ele escolhe o assunto e puxa papo em inglês americano. Responda falando ou digitando; os deslizes aparecem corrigidos logo abaixo da sua fala.</p>`;
    chat.innerHTML = `<div class="start">${intro}<button class="big" id="go" ${busy ? "disabled" : ""}>Começar conversa</button><p class="hint">Quer escolher o assunto? Digite <b>/theme</b>. Todos os comandos: <b>/help</b></p></div>${lang === "ja" && !sys ? `<div class="sys">Dica: o Nii funciona melhor no Google Chrome, por causa do suporte nativo do Google ao japonês (voz e reconhecimento).</div>` : ""}${sysHtml()}`;
    return;
  }
  chat.innerHTML = S.msgs.map(m => m.role === "ai"
    ? aiHtml(m) + (m === S.msgs[S.msgs.length - 1] && !busy ? sugHtml(m) : "")
    : `<div class="msg mine"><div class="bub">${esc(m.text)}</div>${practice[m.id + "#sug"] ? `<div class="note tip score">${practice[m.id + "#sug"]}</div>` : ""}${noteHtml(m)}</div>`).join("")
    + (busy ? `<div class="typing">${NAME()} está digitando <i></i><i></i><i></i></div>` : "") + sysHtml();
  main.scrollTop = main.scrollHeight;
}

const showPtOf = m => m.showPt ?? (lang === "ja" && P.ptAlways);
// sugestões de resposta (só na última fala do professor)
const sugOn = () => lang === "ja" && store.get("sug_" + lang, true); // sugestões só no japonês (Nii)
function sugHtml(m) {
  if (!sugOn()) return "";
  if (!m.sug || !m.sug.length) return `<div class="sugs"><button class="ib sugask" data-sugask="${m.id}">${waiting === "ask" + m.id ? "Criando sugestões…" : "Mostrar sugestões de resposta"}</button></div>`;
  return `<div class="sugs"><span class="lbl">Você pode responder (toque em Falar e repita):</span>${m.sug.map((x, k) => {
    const key = "sug:" + m.id + ":" + k, on = rec && target === key;
    return `<div class="sug"><div class="st">${tx(x.text)}${rom(x.romaji)}${x.pt ? `<span class="why">${esc(x.pt)}</span>` : ""}</div><div class="row"><button class="alt" data-sughear="${key}">Ouvir</button><button class="${on ? "rec" : ""}" data-sugsay="${key}">${on ? "Parar" : "Falar"}</button><button class="alt" data-sugtype="${key}">Escrever</button></div></div>`;
  }).join("")}<button class="more" data-moresug="${m.id}">${waiting === "sug" + m.id ? "Criando novas…" : "Mais sugestões (outras respostas)"}</button></div>`;
}
const sugOf = key => { const [, id, k] = key.split(":"); const m = S.msgs.find(x => x.id === id); return m && m.sug && m.sug[+k]; };
let pendingSug = null;
function aiHtml(m) {
  const sp = showPtOf(m);
  return `<div class="msg ai"><div class="bub">${tx(m.text)}${rom(m.romaji)}</div><div class="tools"><button data-say="${m.id}">Ouvir de novo</button>${m.simple ? "" : `<button data-simple="${m.id}">${waiting === m.id ? "Simplificando…" : "Não entendi"}</button>`}${m.pt ? `<button data-pt="${m.id}">${sp ? "Esconder tradução" : "Tradução"}</button>` : ""}</div>${sp && m.pt ? `<div class="pt">${esc(m.pt)}</div>` : ""}${m.simple ? `<div class="simple"><span class="lbl">Mais simples</span><span class="en">${tx(m.simple.simple_en)}</span>${rom(m.simple.romaji)}${m.simple.hint_pt ? `<span class="why">${esc(m.simple.hint_pt)}</span>` : ""}<div class="tools"><button data-saysimple="${m.id}">Ouvir</button></div></div>` : ""}</div>`;
}

// correções e sugestões chegam alguns segundos depois da resposta: busca de novo até ficarem prontas
let pollT = null;
function watchPending(tries = 0) {
  clearTimeout(pollT);
  if (!S || !S.msgs.some(isPending) || tries > 25) return;
  pollT = setTimeout(async () => {
    if (busy || waiting) return watchPending(tries + 1);
    const l = lang;
    try {
      const d = await api("me"); if (!d.user || l !== lang || busy) return watchPending(tries + 1);
      if (d.state.msgs.length !== S.msgs.length) return watchPending(tries + 1); // algo novo aconteceu no meio: espera
      const view = new Map(S.msgs.map(m => [m.id, m.showPt]));
      const sig = st => JSON.stringify(st.msgs.map(m => [m.id, !!m.fix, !!m.sug, m.pending || 0]));
      const before = sig(S);
      S = d.state; S.msgs.forEach(m => { if (view.get(m.id) !== undefined) m.showPt = view.get(m.id); });
      const keep = main.scrollTop, atEnd = main.scrollHeight - main.scrollTop - main.clientHeight < 80;
      if (sig(S) !== before) { render(); if (!atEnd) main.scrollTop = keep; }
    } catch {}
    watchPending(tries + 1);
  }, tries < 6 ? 1000 : 2000);
}

// ---------- comandos do chat
const THEMES = [["🍔", "Comida", "food and cooking"], ["🎬", "Filmes e séries", "movies and TV shows"], ["✈️", "Viagens", "travel"], ["🎵", "Música", "music"],
  ["💼", "Trabalho", "work and jobs"], ["⚽", "Esportes", "sports"], ["📱", "Tecnologia", "technology"], ["👨‍👩‍👧", "Família e amigos", "family and friends"],
  ["🕗", "Rotina", "daily routine"], ["🛍️", "Compras", "shopping"], ["🐶", "Animais", "pets and animals"], ["🎮", "Games", "video games"],
  ["🧘", "Saúde e bem-estar", "health and wellness"], ["🎉", "Festas e feriados", "parties and holidays"], ["🎲", "Surpresa", ""]];
const CMDS = [["/new", "Abre um novo chat"], ["/clear", "Limpa o chat atual"], ["/save", "Salva o chat atual"], ["/delete", "Apaga o chat atual"], ["/theme", "Escolher o assunto da conversa"], ["/help", "Lista os comandos"]];
function sysHtml() {
  if (!sys) return "";
  if (sys.kind === "themes") return `<div class="msg ai"><div class="bub">Sobre o que vamos conversar? Toque num tema 👇<br><small>(ou digite /theme e o assunto que quiser, ex.: /theme futebol)</small></div><div class="themes">${THEMES.map(([e, pt], i) => `<button class="theme" data-theme="${i}">${e} ${esc(pt)}</button>`).join("")}</div></div>`;
  if (sys.kind === "help") return `<div class="sys"><b>Comandos</b>${CMDS.map(([c, d]) => `<span><code>${c}</code> ${esc(d)}</span>`).join("")}</div>`;
  const btns = { new: [["save-new", "Salvar e abrir nova"], ["force-new", "Abrir sem salvar"]], delete: [["force-delete", "Apagar"]], open: [["force-open", "Abrir mesmo assim"]] }[sys.confirm] || [];
  return `<div class="sys">${esc(sys.text)}${btns.length ? `<div class="row">${btns.map(([a, t]) => `<button data-act="${a}">${esc(t)}</button>`).join("")}<button class="alt" data-act="cancel">Cancelar</button></div>` : ""}</div>`;
}
async function command(name, body = {}) {
  if (busy) return; busy = true; render();
  try {
    const d = await api("cmd", { cmd: name, ...body });
    S = d.state; practice = {}; busy = false; sys = d.note ? { text: d.note, confirm: d.confirm || "" } : null;
    if (sys && sys.confirm === "new") sys.thenNew = true;
    render();
  } catch (x) { busy = false; render(); setStatus(x.message); }
}
async function openChat(id, force) {
  if (busy) return; busy = true; render();
  try { const d = await api("open", { id, force: !!force }); S = d.state; practice = {}; busy = false; sys = d.note ? { text: d.note, confirm: d.confirm || "", openId: id } : null; render(); $("#set").classList.remove("on"); }
  catch (x) { busy = false; render(); setStatus(x.message); }
}
function runSlash(text) {
  const [c, ...rest] = text.trim().split(/\s+/), arg = rest.join(" "), cmd = c.toLowerCase();
  inp.value = ""; hideMenu(); stopSpeak();
  if (cmd === "/new" || cmd === "/clear" || cmd === "/save" || cmd === "/delete") return command(cmd.slice(1));
  if (cmd === "/theme") { if (arg) { sys = null; return talk("theme", { topic: arg }); } sys = { kind: "themes" }; return render(); }
  if (cmd === "/help") { sys = { kind: "help" }; return render(); }
  sys = { text: `Não conheço o comando ${c}. Digite /help para ver a lista.` }; render();
}
const menu = document.createElement("div"); menu.className = "cmdmenu"; menu.hidden = true; $("#form").before(menu);
function hideMenu() { menu.hidden = true; }
function showMenu() {
  const v = inp.value.trim().toLowerCase();
  if (!v.startsWith("/") || v.includes(" ")) return hideMenu();
  const list = CMDS.filter(([c]) => c.startsWith(v));
  if (!list.length) return hideMenu();
  menu.innerHTML = list.map(([c, d]) => `<button type="button" data-cmd="${c}"><code>${c}</code> ${esc(d)}</button>`).join(""); menu.hidden = false;
}
menu.addEventListener("click", e => { const b = e.target.closest("button"); if (b) runSlash(b.dataset.cmd); });
function moreHtml(x) {
  return `<div class="morebox"><span>${esc(x.explain_pt)}</span>${(x.examples || []).map(e => `<span class="exl"><b>${esc(e.emoji)} ${tx(e.en)}</b>${rom(e.romaji)}<i>${esc(e.pt)}</i></span>`).join("")}</div>`;
}
const isPending = m => m.pending && Date.now() - m.pending < 60000;
function noteHtml(m) {
  if (!m.fix) return isPending(m) ? '<div class="note clean wait">Conferindo a sua frase…</div>' : "";
  const it = m.fix.items || [];
  if (!it.length) return '<div class="note clean">Perfeito, nada a corrigir.</div>';
  const p = practice[m.id], recOn = rec && target === m.id;
  const tipOnly = it.every(c => c.type === "register");
  const [F, I] = lang === "ja" ? ["Educado", "Casual"] : ["Formal", "Informal"];
  return `<div class="note${tipOnly ? " tip" : ""}">${it.map((c, k) => `<div class="it${c.type === "register" ? " reg" : ""}"><span class="tag">${esc(c.type === "register" ? F + " × " + I.toLowerCase() : TYPES[c.type] || "Dica")}</span>${c.type === "register"
    ? `<span class="forms"><span><small>${F}</small> <b>${tx(c.better)}</b></span><span><small>${I}</small> <b>${tx(c.informal || c.said)}</b></span></span>`
    : `<span class="said">${esc(c.said)}</span> → <span class="better">${tx(c.better)}</span>${c.informal ? `<span class="inf"><small>${I}</small> ${tx(c.informal)}</span>` : ""}`}<span class="why">${esc(c.why_pt)}</span>${c.example ? `<span class="ex">Ex.: ${tx(c.example)}</span>` : ""}${c.more ? moreHtml(c.more) : `<button class="more" data-explain="${m.id}" data-idx="${k}">${waiting === m.id + ":" + k ? "Explicando…" : "Explicar de outro jeito"}</button>`}</div>`).join("")}
  ${m.fix.corrected ? `<div class="fixed">${tx(m.fix.corrected)}${rom(m.fix.corrected_romaji)}</div><div class="row"><button class="alt" data-hear="${m.id}">Ouvir certo</button><button class="${recOn ? "rec" : ""}" data-prac="${m.id}">${recOn ? "Parar e conferir" : "Repetir em voz alta"}</button></div>` : ""}
  ${p ? `<div class="score">${p}</div>` : ""}</div>`;
}
async function talk(path, body) {
  if (busy) return; busy = true; render(); setStatus("");
  try {
    const d = await api(path, body); S = d.state; busy = false;
    if (pendingSug) { const mine = [...S.msgs].reverse().find(m => m.role === "me"); if (mine) practice[mine.id + "#sug"] = pendingSug; pendingSug = null; }
    render(); const last = S.msgs[S.msgs.length - 1]; if (last && last.role === "ai") samSays(last.text);
    watchPending();
  }
  catch (x) { busy = false; render(); setStatus(x.message); }
}
async function extraAsk(path, body, key, after) {
  if (waiting || busy) return; waiting = key; render(); setStatus("");
  const keep = main.scrollTop;
  try { const d = await api(path, body); const show = new Set(S.msgs.filter(m => m.showPt).map(m => m.id)); S = d.state; S.msgs.forEach(m => { if (show.has(m.id)) m.showPt = true; }); waiting = ""; render(); main.scrollTop = keep; after && after(); }
  catch (x) { waiting = ""; render(); main.scrollTop = keep; setStatus(x.message); }
}
function send(text, spoken, unsure) {
  text = String(text || "").trim(); if (!text || busy) return;
  if (text.startsWith("/")) { handsFree = false; return runSlash(text); }
  sys = null; handsFree = !!spoken;
  S.msgs.push({ role: "me", id: "tmp", text, spoken }); inp.value = "";
  talk("chat", { text, spoken: !!spoken, unsure: unsure || [] }).then(() => { if (S.msgs.some(m => m.id === "tmp")) { S.msgs = S.msgs.filter(m => m.id !== "tmp"); inp.value = text; render(); } });
}

// ---------- voz do Sam
const audioCache = new Map(); let player = null;
function stopSpeak() { try { player && player.pause(); } catch {} try { speechSynthesis.cancel(); } catch {} }
// fala o texto; a promessa termina quando a fala acaba (ou é interrompida)
async function speak(text) {
  if (!text) return; stopSpeak();
  if (lang === "ja") text = plainJ(text);
  const key = lang + "|" + text;
  if (S.settings.voice === "server" && (lang === "en" || lang === "es")) {
    try {
      let url = audioCache.get(key);
      if (!url) { url = URL.createObjectURL(await api("tts", { text })); audioCache.set(key, url); }
      const a = player = new Audio(url); a.playbackRate = S.settings.rate;
      const done = new Promise(res => { a.onended = res; a.onpause = res; a.onerror = res; });
      await a.play(); await done; return;
    } catch { /* cai para a voz do aparelho */ }
  }
  try {
    const L = ({ ja: "ja-JP", es: "es-MX" })[lang] || "en-US";
    const u = new SpeechSynthesisUtterance(text); u.lang = L; u.rate = S.settings.rate;
    const voices = speechSynthesis.getVoices(), same = v => v.lang === L || v.lang === L.replace("-", "_");
    // prefere as vozes mais naturais (Google / "Natural" / "Online") do idioma
    const good = v => /google|natural|online|premium|enhanced/i.test(v.name);
    const v = voices.find(v => same(v) && good(v)) || voices.find(same) || voices.find(v => v.lang.toLowerCase().startsWith(L.slice(0, 2))); if (v) u.voice = v;
    if (lang === "ja" && voices.length && !v) setStatus("Sem voz japonesa no aparelho. No Android: Configurações → Idioma → Saída de texto para fala → Google → instalar Japonês.");
    const done = new Promise(res => { u.onend = res; u.onerror = res; setTimeout(res, 2000 + text.length * 120); });
    speechSynthesis.speak(u); await done;
  } catch {}
}
// modo mãos livres: se a pessoa falou pelo microfone, ele abre sozinho depois que o Sam termina de falar
async function samSays(text) {
  await speak(text);
  if (handsFree && !rec && !busy && !waiting && document.visibilityState === "visible" && !$("#app").hidden) startRec("chat", true);
}

// ---------- microfone: grava, vira WAV 16 kHz e manda para o Whisper
async function startRec(t, auto = false) {
  if (rec) return stopRec();
  stopSpeak(); target = t;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { setStatus("Microfone bloqueado. Libere o microfone para este site nas permissões do navegador."); return; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)(); await ctx.resume();
  const src = ctx.createMediaStreamSource(stream), node = ctx.createScriptProcessor(4096, 1, 1), chunks = [];
  const r = { stream, ctx, src, node, chunks, rate: ctx.sampleRate, t0: Date.now(), heard: false, quietSince: 0, auto };
  node.onaudioprocess = e => {
    const d = e.inputBuffer.getChannelData(0); chunks.push(new Float32Array(d));
    let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] * d[i];
    const rms = Math.sqrt(sum / (d.length / 4)); mic.style.setProperty("--lvl", Math.min(1, rms * 8).toFixed(2));
    const now = Date.now();
    if (rms > 0.025) { r.heard = true; r.quietSince = 0; } else if (r.heard && !r.quietSince) r.quietSince = now;
    if (now - r.t0 > 30000 || (S.settings.auto && r.heard && r.quietSince && now - r.quietSince > 1800) || (r.auto && !r.heard && now - r.t0 > 10000)) stopRec();
  };
  src.connect(node); node.connect(ctx.destination);
  rec = r; mic.classList.add("on");
  setStatus(t.startsWith("sug:") ? "Fale a resposta… toque em Parar ao terminar." : t !== "chat" ? "Repita a frase… toque em Parar ao terminar." : auto ? "Sua vez! Ouvindo… (toque no microfone para parar o modo voz)" : "Ouvindo… toque no microfone para parar.");
  render();
}
async function stopRec() {
  const r = rec; if (!r) return; rec = null; mic.classList.remove("on"); mic.style.removeProperty("--lvl");
  try { r.node.disconnect(); r.src.disconnect(); r.stream.getTracks().forEach(x => x.stop()); await r.ctx.close(); } catch {}
  render();
  if (!r.heard) {
    if (r.auto) { handsFree = false; setStatus("Fechei o microfone porque ninguém falou. Toque nele para continuar."); }
    else setStatus("Não ouvi nada. Tente de novo, mais perto do microfone.");
    return;
  }
  setStatus("Entendendo o que você disse…");
  try {
    const d = await api("stt", toWav(r.chunks, r.rate), true); setStatus("");
    if (target === "chat") { if (!d.text) return setStatus("Não entendi. Tente de novo."); if (S.settings.auto) send(d.text, true, d.unsure); else { inp.value = d.text; inp.dataset.spoken = "1"; inp.dataset.unsure = JSON.stringify(d.unsure || []); } }
    else if (target.startsWith("sug:")) {
      const x = sugOf(target); if (!d.text) return setStatus("Não entendi. Tente de novo.");
      pendingSug = x ? gradeText(x.text, d.text) : null; send(d.text, true, d.unsure);
    }
    else grade(target, d.text);
  } catch (x) { setStatus(x.message); }
}
function toWav(chunks, rate) {
  const len = chunks.reduce((a, c) => a + c.length, 0), all = new Float32Array(len); let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  const ratio = rate / 16000, n = Math.floor(len / ratio), pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) { const a = Math.floor(i * ratio), b = Math.min(len, Math.floor((i + 1) * ratio)); let s = 0; for (let j = a; j < b; j++) s += all[j]; const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a))); pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
  const buf = new ArrayBuffer(44 + pcm.byteLength), dv = new DataView(buf), w = (p, s) => [...s].forEach((c, i) => dv.setUint8(p + i, c.charCodeAt(0)));
  w(0, "RIFF"); dv.setUint32(4, 36 + pcm.byteLength, true); w(8, "WAVE"); w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 16000, true); dv.setUint32(28, 32000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, pcm.byteLength, true);
  new Int16Array(buf, 44).set(pcm); return new Blob([buf], { type: "audio/wav" });
}

// ---------- treino da frase corrigida
// palavras que soam igual valem como acerto: o reconhecimento de voz não tem como saber qual delas você quis dizer
const SAME_SOUND = [["its", "it's"], ["your", "you're"], ["their", "there", "they're"], ["to", "too", "two", "2"], ["for", "four", "4"], ["one", "won", "1"],
  ["know", "no"], ["knew", "new"], ["right", "write"], ["hear", "here"], ["by", "buy", "bye"], ["whether", "weather"], ["whose", "who's"], ["were", "we're"],
  ["ok", "okay"], ["see", "sea"], ["son", "sun"], ["eight", "ate", "8"], ["hour", "our"], ["wait", "weight"], ["week", "weak"], ["meet", "meat"], ["piece", "peace"], ["knight", "night"], ["flour", "flower"], ["mail", "male"], ["sale", "sail"], ["tail", "tale"], ["way", "weigh"],
  ["three", "3"], ["five", "5"], ["six", "6"], ["seven", "7"], ["nine", "9"], ["ten", "10"], ["wanna", "want to"], ["gonna", "going to"]];
const SOUND = new Map(); for (const g of SAME_SOUND) for (const w of g) if (!w.includes(" ")) SOUND.set(w.replace(/'/g, ""), g[0].replace(/'/g, ""));
const sameSound = w => { const k = w.replace(/'/g, ""); return SOUND.get(k) || k; };
// espanhol: sem acentos e com palavras que soam igual (h é mudo, b = v, s = z = c na América Latina)
const SAME_ES = [["hola", "ola"], ["hay", "ay", "ahi"], ["a", "ha"], ["e", "he"], ["echo", "hecho"], ["haber", "a ver"], ["tuvo", "tubo"], ["vello", "bello"], ["vaca", "baca"],
  ["casa", "caza"], ["coser", "cocer"], ["ves", "vez"], ["as", "has", "haz"], ["hasta", "asta"], ["hierba", "hierva"], ["valla", "vaya", "baya"], ["halla", "haya"]];
const SOUND_ES = new Map(); for (const g of SAME_ES) for (const w of g) if (!w.includes(" ")) SOUND_ES.set(w, g[0]);
const unaccent = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const words = s => lang === "es"
  ? unaccent(String(s).toLowerCase()).replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter(Boolean).map(w => SOUND_ES.get(w) || w)
  : String(s).toLowerCase().replace(/[’‘]/g, "'").replace(/\b(wanna)\b/g, "want to").replace(/\b(gonna)\b/g, "going to").replace(/[^a-z0-9'\s-]/g, " ").split(/[\s-]+/).filter(Boolean).map(sameSound);
// japonês: compara pela leitura; cada kanji vale se você disse o kanji ou a leitura dele
const toHira = t => String(t).replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
// partículas は/へ/を soam "wa/e/o": o reconhecimento escreve わ/え/お, então os dois lados são comparados pelo som
const jnorm = t => toHira(String(t).normalize("NFKC")).toLowerCase().replace(/[\s。、．，！？!?.,「」『』（）()・〜~…:：;；"'＂]/g, "").replace(/は/g, "わ").replace(/へ/g, "え").replace(/を/g, "お");
function gradeJa(t, said) {
  const segs = []; let last = 0; const re = /\{([^{}]*)\}/g; let x;
  const pushPlain = str => [...str].forEach(ch => segs.push({ show: esc(ch), base: jnorm(ch), read: jnorm(ch) }));
  while ((x = re.exec(t))) {
    const chunk = t.slice(last, x.index), k = chunk.match(KANJI_END);
    if (k) { pushPlain(chunk.slice(0, k.index)); segs.push({ show: `<ruby>${esc(k[0])}<rt>${esc(x[1])}</rt></ruby>`, base: jnorm(k[0]), read: jnorm(x[1]) }); }
    else pushPlain(chunk);
    last = re.lastIndex;
  }
  pushPlain(t.slice(last));
  const h = jnorm(said), n = segs.length, L = h.length;
  const f = Array.from({ length: n + 1 }, () => new Array(L + 1).fill(0)), how = Array.from({ length: n + 1 }, () => new Array(L + 1).fill(null));
  for (let i = n - 1; i >= 0; i--) for (let j = L; j >= 0; j--) {
    const sg = segs[i]; let best = f[i + 1][j], mv = ["skip"];
    if (!sg.base) { f[i][j] = f[i + 1][j]; how[i][j] = ["free"]; continue; }
    if (j < L && f[i][j + 1] > best) { best = f[i][j + 1]; mv = ["extra"]; }
    for (const w of new Set([sg.base, sg.read])) if (w && h.startsWith(w, j) && 1 + f[i + 1][j + w.length] > best) { best = 1 + f[i + 1][j + w.length]; mv = ["hit", w.length]; }
    f[i][j] = best; how[i][j] = mv;
  }
  const hit = new Set(); let i = 0, j = 0;
  while (i < n) { const mv = how[i][j]; if (!mv || mv[0] === "skip" || mv[0] === "free") i++; else if (mv[0] === "extra") j++; else { hit.add(i); j += mv[1]; i++; } }
  const counted = segs.map((s, k) => k).filter(k => segs[k].base);
  const pct = counted.length ? Math.round(counted.filter(k => hit.has(k)).length / counted.length * 100) : 0;
  return `<b>${pct}% entendido.</b> ${pct === 100 ? "すごい！ Mandou bem!" : "O que está sublinhado não saiu claro, tente de novo."}<br><span class="jline">${segs.map((s, k) => `<span class="${hit.has(k) || !s.base ? "ok" : "miss"}">${s.show}</span>`).join("")}</span><br><span class="why">Entendi: “${esc(said || "nada")}”</span>`;
}
// compara o que você falou com a frase esperada; devolve o resultado pronto para mostrar
function gradeText(expected, said) {
  if (lang === "ja") return gradeJa(expected, said);
  // cada palavra da frase vira 1 ou mais pedaços (ex.: "wanna" = want + to); a palavra conta se todos os pedaços foram ouvidos
  const orig = String(expected).split(/\s+/).filter(Boolean), a = [], owner = [];
  orig.forEach((w, k) => words(w).forEach(t => { a.push(t); owner.push(k); }));
  const b = words(said);
  const L = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const got = new Set(); let i = 0, j = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { got.add(i); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  const hit = new Set(orig.map((_, k) => k).filter(k => owner.some((o, t) => o === k) && owner.every((o, t) => o !== k || got.has(t))));
  const counted = orig.map((_, k) => k).filter(k => owner.includes(k));
  const pct = counted.length ? Math.round(counted.filter(k => hit.has(k)).length / counted.length * 100) : 0;
  return `<b>${pct}% das palavras entendidas.</b> ${pct === 100 ? "Mandou bem!" : "As sublinhadas não saíram claras, tente de novo."}<br>${orig.map((w, k) => `<span class="${hit.has(k) || !owner.includes(k) ? "ok" : "miss"}">${esc(w)}</span>`).join(" ")}<br><span class="why">Entendi: “${esc(said || "nada")}”</span>`;
}
function grade(id, said) {
  const m = S.msgs.find(x => x.id === id); if (!m || !m.fix) return;
  practice[id] = gradeText(m.fix.corrected, said); render();
}

// ---------- eventos
const kanaOn = () => lang === "ja" && P.kanaInput && !inp.value.trimStart().startsWith("/");
$("#form").addEventListener("submit", e => { e.preventDefault(); if (kanaOn()) inp.value = toKana(inp.value, true); const sp = inp.dataset.spoken === "1"; let un = []; try { un = JSON.parse(inp.dataset.unsure || "[]"); } catch {} delete inp.dataset.spoken; delete inp.dataset.unsure; send(inp.value, sp, un); });
inp.addEventListener("input", e => {
  delete inp.dataset.spoken; showMenu();
  if (e.isComposing || !kanaOn()) return;
  const v = inp.value, k = toKana(v);
  if (k !== v && inp.selectionEnd === v.length) inp.value = k; // só converte digitando no fim do texto
});
// trocar de professor e preferências do japonês
document.querySelectorAll("[data-lang]").forEach(b => b.addEventListener("click", () => switchLang(b.dataset.lang)));
$("#pSug").addEventListener("change", e => { store.set("sug_" + lang, e.target.checked); render(); });
const prefs = [["#pFuri", "furi"], ["#pRomaji", "romaji"], ["#pPt", "ptAlways"], ["#pKana", "kanaInput"]];
for (const [sel, key] of prefs) $(sel).addEventListener("change", e => { P[key] = e.target.checked; store.set("jaPrefs", P); applyLang(); });
inp.addEventListener("blur", () => setTimeout(hideMenu, 200));
mic.addEventListener("click", () => startRec("chat"));
chat.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const find = id => S.msgs.find(m => m.id === id);
  if (b.id === "go") { sys = null; talk("chat", {}); }
  else if (b.dataset.theme !== undefined) {
    const [, pt, en] = THEMES[+b.dataset.theme]; sys = null;
    talk("theme", { topic: en || pick(THEMES.filter(t => t[2]))[2] + " (surprise topic)" || pt });
  }
  else if (b.dataset.act) {
    const a = b.dataset.act, openId = sys && sys.openId; sys = null;
    if (a === "save-new") command("save").then(() => command("new", { force: true }));
    else if (a === "force-new") command("new", { force: true });
    else if (a === "force-delete") command("delete", { force: true });
    else if (a === "force-open") openChat(openId, true);
    else render();
  }
  else if (b.dataset.sugask) extraAsk("sug", { id: b.dataset.sugask }, "ask" + b.dataset.sugask);
  else if (b.dataset.moresug) extraAsk("moresug", { id: b.dataset.moresug }, "sug" + b.dataset.moresug);
  else if (b.dataset.sughear) speak(sugOf(b.dataset.sughear)?.text);
  else if (b.dataset.sugsay) { if (rec && target === b.dataset.sugsay) stopRec(); else startRec(b.dataset.sugsay); }
  else if (b.dataset.sugtype) { const x = sugOf(b.dataset.sugtype); if (x) { inp.value = lang === "ja" ? plainJ(x.text) : x.text; inp.focus(); } }
  else if (b.dataset.say) speak(find(b.dataset.say)?.text);
  else if (b.dataset.saysimple) speak(find(b.dataset.saysimple)?.simple?.simple_en);
  else if (b.dataset.simple) extraAsk("simplify", { id: b.dataset.simple }, b.dataset.simple, () => { const m = find(b.dataset.simple); if (m && m.simple) speak(m.simple.simple_en); });
  else if (b.dataset.explain) extraAsk("explain", { id: b.dataset.explain, idx: +b.dataset.idx }, b.dataset.explain + ":" + b.dataset.idx);
  else if (b.dataset.pt) { const m = find(b.dataset.pt); if (m) { m.showPt = !showPtOf(m); render(); } }
  else if (b.dataset.hear) speak(find(b.dataset.hear)?.fix?.corrected);
  else if (b.dataset.prac) { if (rec && target === b.dataset.prac) stopRec(); else startRec(b.dataset.prac); }
});
$("#meBtn").addEventListener("click", () => { const on = $("#set").classList.toggle("on"); $("#meBtn").setAttribute("aria-expanded", on); });
const saveSettings = () => api("settings", S.settings).catch(x => setStatus(x.message));
$("#voice").addEventListener("change", e => { S.settings.voice = e.target.value; saveSettings(); speak(({ ja: "こんにちは！ニイです。", es: "¡Hola! Así suena mi voz." })[lang] || "Hi! This is how I sound."); });
$("#rate").addEventListener("input", e => { S.settings.rate = +e.target.value; $("#rateV").textContent = S.settings.rate + "x"; });
$("#rate").addEventListener("change", saveSettings);
$("#auto").addEventListener("change", e => { S.settings.auto = e.target.checked; saveSettings(); });
$("#skip").addEventListener("click", () => { if (S.msgs.length) talk("skip", {}); });
const pick = a => a[Math.floor(Math.random() * a.length)];
$("#reset").addEventListener("click", () => { $("#set").classList.remove("on"); stopSpeak(); command("new"); });
// conversas salvas (Ajustes)
$("#savedBox").addEventListener("toggle", async e => {
  if (!e.target.open) return; const ul = $("#savedList"); ul.innerHTML = "<li>Carregando…</li>";
  try {
    const { chats } = await api("chats");
    ul.innerHTML = chats.length ? chats.map(c => `<li><button type="button" data-open="${esc(c.id)}">${esc(c.title)}${c.id === S.chatId ? " (aberta)" : ""}</button></li>`).join("") : "<li>Nenhuma conversa salva. Use /save no chat.</li>";
  } catch (x) { ul.innerHTML = `<li>${esc(x.message)}</li>`; }
});
$("#savedList").addEventListener("click", e => { const b = e.target.closest("button[data-open]"); if (b) openChat(b.dataset.open); });
$("#fPw").addEventListener("submit", async e => {
  e.preventDefault(); const msg = $("#pwMsg");
  if ($("#pwNew").value !== $("#pwNew2").value) { msg.textContent = "As duas senhas novas não são iguais."; return; }
  try { await api("password", { old: $("#pwOld").value, new: $("#pwNew").value }); msg.textContent = "Senha trocada!"; e.target.reset(); }
  catch (x) { msg.textContent = x.message; }
});
$("#logout").addEventListener("click", async () => { stopSpeak(); await api("logout", {}).catch(() => {}); showLogin(); });

api("me").then(d => d.user ? showApp(d) : showLogin()).catch(() => showLogin());
