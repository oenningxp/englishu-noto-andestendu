// O "Sam": regras da conversa, montagem do pedido para a IA e leitura da resposta.
export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const TYPES = ["grammar", "pronunciation", "vocab"];

export const SYSTEM = `You are Sam, a friendly, curious American (US) conversation partner for a Brazilian Portuguese speaker who is practicing spoken American English.
Conversation:
- YOU choose the topics (everyday life, work, travel, food, movies, music, opinions, hypotheticals). Keep one topic going for several turns, then move naturally to a new one.
- Reply in natural, spoken American English, 1 to 3 short sentences, and end with one question so the learner keeps talking. Never put corrections inside the reply.
- Adapt to the learner: estimate their CEFR level from everything they wrote and match vocabulary, idioms and sentence length to it, slightly above their level.
- If the learner writes in Portuguese or asks how to say something, help briefly in the reply and continue in English.
Corrections (only for the learner's LAST line, and only if the last line is from the LEARNER; otherwise return an empty list):
- Flag grammar errors, wrong word choice and phrasing an American would find unnatural. Skip tiny nitpicks. At most 3 items.
- If the line was SPOKEN, it came from speech recognition of the learner's real audio: ignore punctuation, capitalization and filler words. A word that makes no sense in context but sounds like a plausible intended word is probably a mispronunciation (e.g. "sheep" for "ship", "tree" for "three", "live" for "leave", "angry" for "hungry"). Words the recognizer was unsure about are listed; they are good candidates. Flag "pronunciation" ONLY when reasonably confident, give the intended word, and in why_pt explain the sound Brazilians usually get wrong (th, short i vs long ee, initial h, final -ed, extra vowel at the end of words, r sounds, vowel length).
- why_pt is in Brazilian Portuguese: one short, friendly sentence.
Answer ONLY with a JSON object, no other text:
{"reply":"your English reply","reply_pt":"Portuguese translation of the reply","topic_pt":"current topic, 1-3 words in Portuguese","level":"A1|A2|B1|B2|C1|C2","corrections":[{"type":"grammar|pronunciation|vocab","said":"fragment as the learner said it","better":"corrected fragment","why_pt":"short explanation"}],"corrected":"the learner's full last line rewritten correctly, or empty string if there are no corrections"}`;

export const SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" }, reply_pt: { type: "string" }, topic_pt: { type: "string" }, level: { type: "string" },
    corrections: { type: "array", items: { type: "object", properties: { type: { type: "string" }, said: { type: "string" }, better: { type: "string" }, why_pt: { type: "string" } }, required: ["type", "said", "better", "why_pt"] } },
    corrected: { type: "string" }
  },
  required: ["reply", "reply_pt", "topic_pt", "level", "corrections", "corrected"]
};

// monta o texto que vai para a IA: só as últimas falas (economiza a cota)
export function buildPrompt(state, { extra = "", unsure = [] } = {}) {
  const lines = (state.msgs || []).slice(-24).map(m => m.role === "me" ? `LEARNER (${m.spoken ? "spoken" : "typed"}): ${m.text}` : `SAM: ${m.text}`).join("\n");
  const u = unsure.length ? `\nThe speech recognizer was unsure about these words in the learner's last line: ${unsure.slice(0, 8).join(", ")}` : "";
  return `Current topic: ${state.topic || "none yet"}\nCurrent level estimate: ${state.level || "unknown"}\n\nConversation so far:\n${lines || "(empty: open the conversation. Greet the learner warmly, pick an easy first topic and ask a question.)"}${u}${extra ? "\n\nNote: " + extra : ""}\n\nAnswer with the JSON object only.`;
}

// a IA às vezes devolve texto com o JSON no meio: pega o primeiro objeto que der para ler
export function looseJson(raw) {
  if (raw && typeof raw === "object") return raw;
  const s = String(raw || ""); const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}
const str = (v, n) => typeof v === "string" ? v.trim().slice(0, n) : "";

// confere e limpa a resposta; null se não der para usar
export function parseReply(raw) {
  const r = looseJson(raw); if (!r) return null;
  const reply = str(r.reply, 800); if (!reply) return null;
  const corrections = (Array.isArray(r.corrections) ? r.corrections : []).map(c => ({
    type: TYPES.includes(c && c.type) ? c.type : "vocab", said: str(c && c.said, 200), better: str(c && c.better, 200), why_pt: str(c && c.why_pt, 300)
  })).filter(c => c.better && c.better.toLowerCase() !== c.said.toLowerCase()).slice(0, 3);
  return { reply, reply_pt: str(r.reply_pt, 900), topic_pt: str(r.topic_pt, 40), level: LEVELS.includes(r.level) ? r.level : "", corrections, corrected: corrections.length ? str(r.corrected, 500) : "" };
}

// palavras de que o Whisper não teve certeza (quando ele manda a probabilidade de cada palavra)
export function unsureWords(stt) {
  const out = [];
  for (const seg of (stt && Array.isArray(stt.segments) ? stt.segments : []))
    for (const w of (Array.isArray(seg.words) ? seg.words : [])) {
      const p = typeof w.probability === "number" ? w.probability : typeof w.score === "number" ? w.score : null;
      const word = String(w.word || "").trim();
      if (word && p !== null && p < 0.55) out.push(word);
    }
  return [...new Set(out)].slice(0, 10);
}
