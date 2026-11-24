// Papo em Inglês: tela do celular/computador.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TYPES = { grammar: "Gramática", pronunciation: "Pronúncia", vocab: "Naturalidade" };
const chat = $("#chat"), main = $("#main"), inp = $("#inp"), mic = $("#mic"), statusEl = $("#status");
let me = null, S = null, busy = false, practice = {}, rec = null, target = "chat";
const setStatus = t => { statusEl.textContent = t || ""; };

async function api(path, body, raw) {
  const opt = { method: body === undefined ? "GET" : "POST", credentials: "same-origin", headers: {} };
  if (raw) { opt.body = body; opt.headers["Content-Type"] = "audio/wav"; }
  else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers["Content-Type"] = "application/json"; }
  const r = await fetch("/api/" + path, opt);
  if (path === "tts") { if (!r.ok) throw new Error("voz"); return r.blob(); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401 && path !== "login" && path !== "login/totp") showLogin(); throw new Error(d.error || "Erro de conexão."); }
  return d;
}

// ---------- entrar
function showLogin() { me = null; $("#app").hidden = true; $("#login").hidden = false; $("#fLogin").hidden = false; $("#fTotp").hidden = true; }
function showApp(d) {
  me = d.user; S = d.state; $("#login").hidden = true; $("#app").hidden = false;
  $("#av").innerHTML = me.avatar ? `<img alt="" src="/img/${encodeURIComponent(me.avatar)}">` : esc((me.nick || "?").slice(0, 1).toUpperCase());
  $("#who").textContent = `Conectado como ${me.nick} (${me.username})`;
  $("#voice").value = S.settings.voice; $("#rate").value = S.settings.rate; $("#rateV").textContent = S.settings.rate + "x"; $("#auto").checked = S.settings.auto;
  render();
}
$("#fLogin").addEventListener("submit", async e => {
  e.preventDefault(); $("#lErr").textContent = "";
  try { await api("login", { username: $("#lUser").value, password: $("#lPass").value }); $("#fLogin").hidden = true; $("#fTotp").hidden = false; $("#lCode").focus(); }
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
    chat.innerHTML = `<div class="start"><h2>Pronto pra conversar com o Sam?</h2><p>Ele escolhe o assunto e puxa papo em inglês americano. Responda falando ou digitando; os deslizes aparecem corrigidos logo abaixo da sua fala.</p><button class="big" id="go" ${busy ? "disabled" : ""}>Começar conversa</button></div>`;
    return;
  }
  chat.innerHTML = S.msgs.map(m => m.role === "ai"
    ? `<div class="msg ai"><div class="bub">${esc(m.text)}</div><div class="tools"><button data-say="${m.id}">Ouvir de novo</button>${m.pt ? `<button data-pt="${m.id}">${m.showPt ? "Esconder tradução" : "Tradução"}</button>` : ""}</div>${m.showPt ? `<div class="pt">${esc(m.pt)}</div>` : ""}</div>`
    : `<div class="msg mine"><div class="bub">${esc(m.text)}</div>${noteHtml(m)}</div>`).join("")
    + (busy ? '<div class="typing">Sam está digitando <i></i><i></i><i></i></div>' : "");
  main.scrollTop = main.scrollHeight;
}
function noteHtml(m) {
  if (!m.fix) return "";
  const it = m.fix.items || [];
  if (!it.length) return '<div class="note clean">Perfeito, nada a corrigir.</div>';
  const p = practice[m.id], recOn = rec && target === m.id;
  return `<div class="note">${it.map(c => `<div class="it"><span class="tag">${esc(TYPES[c.type] || "Dica")}</span><span class="said">${esc(c.said)}</span> → <span class="better">${esc(c.better)}</span><span class="why">${esc(c.why_pt)}</span></div>`).join("")}
  ${m.fix.corrected ? `<div class="fixed">${esc(m.fix.corrected)}</div><div class="row"><button class="alt" data-hear="${m.id}">Ouvir certo</button><button class="${recOn ? "rec" : ""}" data-prac="${m.id}">${recOn ? "Parar e conferir" : "Repetir em voz alta"}</button></div>` : ""}
  ${p ? `<div class="score">${p}</div>` : ""}</div>`;
}
async function talk(path, body) {
  if (busy) return; busy = true; render(); setStatus("");
  try { const d = await api(path, body); S = d.state; busy = false; render(); const last = S.msgs[S.msgs.length - 1]; if (last && last.role === "ai") speak(last.text); }
  catch (x) { busy = false; render(); setStatus(x.message); }
}
function send(text, spoken, unsure) {
  text = String(text || "").trim(); if (!text || busy) return;
  S.msgs.push({ role: "me", id: "tmp", text, spoken }); inp.value = "";
  talk("chat", { text, spoken: !!spoken, unsure: unsure || [] }).then(() => { if (S.msgs.some(m => m.id === "tmp")) { S.msgs = S.msgs.filter(m => m.id !== "tmp"); inp.value = text; render(); } });
}

// ---------- voz do Sam
const audioCache = new Map(); let player = null;
function stopSpeak() { try { player && player.pause(); } catch {} try { speechSynthesis.cancel(); } catch {} }
async function speak(text) {
  if (!text) return; stopSpeak();
  if (S.settings.voice === "server") {
    try {
      let url = audioCache.get(text);
      if (!url) { url = URL.createObjectURL(await api("tts", { text })); audioCache.set(text, url); }
      player = new Audio(url); player.playbackRate = S.settings.rate; await player.play(); return;
    } catch { /* cai para a voz do aparelho */ }
  }
  try {
    const u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; u.rate = S.settings.rate;
    const v = speechSynthesis.getVoices().find(v => v.lang === "en-US" || v.lang === "en_US"); if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch {}
}

// ---------- microfone: grava, vira WAV 16 kHz e manda para o Whisper
async function startRec(t) {
  if (rec) return stopRec();
  stopSpeak(); target = t;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { setStatus("Microfone bloqueado. Libere o microfone para este site nas permissões do navegador."); return; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)(); await ctx.resume();
  const src = ctx.createMediaStreamSource(stream), node = ctx.createScriptProcessor(4096, 1, 1), chunks = [];
  const r = { stream, ctx, src, node, chunks, rate: ctx.sampleRate, t0: Date.now(), heard: false, quietSince: 0 };
  node.onaudioprocess = e => {
    const d = e.inputBuffer.getChannelData(0); chunks.push(new Float32Array(d));
    let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] * d[i];
    const rms = Math.sqrt(sum / (d.length / 4)); mic.style.setProperty("--lvl", Math.min(1, rms * 8).toFixed(2));
    const now = Date.now();
    if (rms > 0.025) { r.heard = true; r.quietSince = 0; } else if (r.heard && !r.quietSince) r.quietSince = now;
    if (now - r.t0 > 30000 || (S.settings.auto && r.heard && r.quietSince && now - r.quietSince > 1800)) stopRec();
  };
  src.connect(node); node.connect(ctx.destination);
  rec = r; mic.classList.add("on");
  setStatus(t === "chat" ? "Ouvindo… toque no microfone para parar." : "Repita a frase… toque em Parar ao terminar.");
  render();
}
async function stopRec() {
  const r = rec; if (!r) return; rec = null; mic.classList.remove("on"); mic.style.removeProperty("--lvl");
  try { r.node.disconnect(); r.src.disconnect(); r.stream.getTracks().forEach(x => x.stop()); await r.ctx.close(); } catch {}
  render();
  if (!r.heard) { setStatus("Não ouvi nada. Tente de novo, mais perto do microfone."); return; }
  setStatus("Entendendo o que você disse…");
  try {
    const d = await api("stt", toWav(r.chunks, r.rate), true); setStatus("");
    if (target === "chat") { if (!d.text) return setStatus("Não entendi. Tente de novo."); if (S.settings.auto) send(d.text, true, d.unsure); else { inp.value = d.text; inp.dataset.spoken = "1"; inp.dataset.unsure = JSON.stringify(d.unsure || []); } }
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
const words = s => String(s).toLowerCase().replace(/[^a-z0-9'\s-]/g, " ").split(/\s+/).filter(Boolean);
function grade(id, said) {
  const m = S.msgs.find(x => x.id === id); if (!m || !m.fix) return;
  const orig = m.fix.corrected.split(/\s+/).filter(Boolean), a = orig.map(w => words(w).join("")), b = words(said);
  const L = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const hit = new Set(); let i = 0, j = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { hit.add(i); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  const pct = a.length ? Math.round(hit.size / a.length * 100) : 0;
  practice[id] = `<b>${pct}% das palavras entendidas.</b> ${pct === 100 ? "Mandou bem!" : "As sublinhadas não saíram claras, tente de novo."}<br>${orig.map((w, k) => `<span class="${hit.has(k) ? "ok" : "miss"}">${esc(w)}</span>`).join(" ")}<br><span class="why">Entendi: “${esc(said || "nada")}”</span>`;
  render();
}

// ---------- eventos
$("#form").addEventListener("submit", e => { e.preventDefault(); const sp = inp.dataset.spoken === "1"; let un = []; try { un = JSON.parse(inp.dataset.unsure || "[]"); } catch {} delete inp.dataset.spoken; delete inp.dataset.unsure; send(inp.value, sp, un); });
inp.addEventListener("input", () => { delete inp.dataset.spoken; });
mic.addEventListener("click", () => startRec("chat"));
chat.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const find = id => S.msgs.find(m => m.id === id);
  if (b.id === "go") talk("chat", {});
  else if (b.dataset.say) speak(find(b.dataset.say)?.text);
  else if (b.dataset.pt) { const m = find(b.dataset.pt); if (m) { m.showPt = !m.showPt; render(); } }
  else if (b.dataset.hear) speak(find(b.dataset.hear)?.fix?.corrected);
  else if (b.dataset.prac) { if (rec && target === b.dataset.prac) stopRec(); else startRec(b.dataset.prac); }
});
$("#meBtn").addEventListener("click", () => { const on = $("#set").classList.toggle("on"); $("#meBtn").setAttribute("aria-expanded", on); });
const saveSettings = () => api("settings", S.settings).catch(x => setStatus(x.message));
$("#voice").addEventListener("change", e => { S.settings.voice = e.target.value; saveSettings(); speak("Hi! This is how I sound."); });
$("#rate").addEventListener("input", e => { S.settings.rate = +e.target.value; $("#rateV").textContent = S.settings.rate + "x"; });
$("#rate").addEventListener("change", saveSettings);
$("#auto").addEventListener("change", e => { S.settings.auto = e.target.checked; saveSettings(); });
$("#skip").addEventListener("click", () => { if (S.msgs.length) talk("skip", {}); });
let armed = 0;
$("#reset").addEventListener("click", async e => {
  if (Date.now() - armed > 3000) { armed = Date.now(); e.target.textContent = "Toque de novo para apagar"; setTimeout(() => e.target.textContent = "Nova conversa", 3000); return; }
  armed = 0; e.target.textContent = "Nova conversa"; stopSpeak(); practice = {};
  try { S = (await api("reset", {})).state; render(); } catch (x) { setStatus(x.message); }
});
$("#logout").addEventListener("click", async () => { stopSpeak(); await api("logout", {}).catch(() => {}); showLogin(); });

api("me").then(d => d.user ? showApp(d) : showLogin()).catch(() => showLogin());
