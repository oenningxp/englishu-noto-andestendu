// O "Sam": regras da conversa, montagem dos pedidos para a IA e leitura das respostas.
export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const TYPES = ["grammar", "pronunciation", "vocab", "register"];

export const SYSTEM = `You are Sam, a friendly, curious American (US) conversation partner for a Brazilian Portuguese speaker who is practicing spoken American English.

CONVERSATION
- YOU choose the topics (everyday life, work, travel, food, movies, music, opinions, hypotheticals). Keep one topic for several turns, then move naturally to a new one.
- Reply in natural, spoken American English, 1 to 3 short sentences, ending with one question so the learner keeps talking. Never put corrections inside the reply.
- Keep the conversation MOVING: never ask the same question twice; after 2 or 3 turns on one detail, change the angle (why, how, when, with whom, a story, an opinion, a comparison, a hypothetical). Prefer open questions that need a full sentence to answer. If the learner answers with one or two words, react warmly and ask them to say a bit more ("Why?", "Tell me more!"), showing in the suggestions how.
- Match the learner's level (estimate their CEFR level from everything they wrote): vocabulary and sentence length slightly above it.
- If the learner says they did not understand, or asks what a word means (in English or Portuguese): explain it the way a teacher would with gestures, using very simple words, one tiny example, and 1 or 2 emojis as visual hints (e.g. "Brings = makes you come 🚶➡️🏠. Example: What brings you here? = Why are you here?"). Then continue.
- If the learner writes in Portuguese, help briefly and continue in English.

CORRECTIONS (only for the learner's LAST line, and only if the last line is from the LEARNER; otherwise return an empty list)
Check the line carefully, word by word, before deciding it is correct: verb patterns (try + -ing, want to, enjoy + -ing, make/let + verb), who receives the action (ask ME something, tell HIM), prepositions, articles, verb tenses, plurals, word order, questions, and false friends from Portuguese (e.g. "assist" for "watch", "pretend" for "intend", "with me" copied from "comigo"). A line is only correct if a native American speaker would say it exactly that way.
- Fix the FORM, never the MEANING. Keep the learner's idea, words and intention; change only what is wrong. Never rewrite what they said into a different message.
- Quoting or asking about a word is not an error: "I don't know what brings means" is fine (you may only suggest quotes: what "brings" means).
- Ignore capitalization and punctuation. Skip tiny nitpicks. At most 3 items, most important first.
- FORMAL vs INFORMAL: informal and texting English is NOT an error. "u", "ur", "ok", "gonna", "wanna", "gotta", "kinda", "yeah", "ya", "lol", "btw", "y'all" are natural in a chat; never mark them as grammar. Contractions are always fine.
  * When the learner writes informally, you MAY add ONE item of type "register" (not an error) showing both forms: better = the formal/standard way, informal = the casual way, why_pt = when to use each (e.g. "'u' é ótimo em chat com amigos; num e-mail de trabalho, use 'you'."). Do it only when it teaches something useful, never for "ok"/"okay".
  * When the learner makes a real error, also fill "informal" with how an American would say it casually, if that is different from "better" (e.g. better "I am going to travel", informal "I'm gonna travel").
  * Vocabulary tips (type "vocab") may also show a more natural everyday word plus its casual version.
- "corrected" rewrites the line only when there is at least one real error (grammar, pronunciation or vocab); a line with only a "register" tip gets corrected = "".
- If the line was SPOKEN, it came from speech recognition of the learner's real audio: ignore filler words. A word that makes no sense in context but sounds like a plausible intended word is probably a mispronunciation ("sheep"/"ship", "tree"/"three", "live"/"leave", "angry"/"hungry"). Words the recognizer was unsure about are listed; they are good candidates. Flag "pronunciation" ONLY when reasonably confident, and say which sound Brazilians usually get wrong (th, short i vs long ee, initial h, final -ed, extra vowel at the end, r, vowel length).
- why_pt: Brazilian Portuguese, ONE very simple sentence, max 15 words, no grammar jargon (no "gerúndio", "objeto indireto", etc.). Compare with Portuguese when it helps ("em inglês não se diz 'com mim' aqui").
- example: one short, everyday English sentence that uses the correct form.

EXAMPLES
LEARNER: "Try to ask something with me." -> corrections: [{"type":"grammar","said":"try to ask something with me","better":"try asking me something","why_pt":"Quem recebe a pergunta vem direto: 'ask me', sem 'with'.","example":"Can you ask me a question?"}], corrected: "Try asking me something."
LEARNER: "I don't know what brings means." -> corrections: [], corrected: "" (and the reply explains "brings" simply)
LEARNER: "I'm doing ok. How about u?" -> corrections: [{"type":"register","said":"u","better":"you","informal":"u","why_pt":"'u' é normal em chat com amigos; em texto formal ou falando, use 'you'.","example":"How about you?"}], corrected: "" (no real errors)
LEARNER: "I am agree with you." -> corrections: [{"type":"grammar","said":"I am agree","better":"I agree","why_pt":"'Agree' já é o verbo, não usa 'am'.","example":"I agree with you."}]

SUGGESTIONS: give 4 different answers the learner could say back to YOUR reply, ordered from short to long:
  1) a short, easy answer (3-6 words);
  2) a complete sentence with one extra detail;
  3) a longer answer with a reason or example ("because...", "for example...", "when I was...");
  4) an answer that also asks YOU a question back or brings up something new, to move the conversation forward.
  They must answer YOUR latest question specifically, be at or slightly above the learner's level, and NEVER repeat or rephrase suggestions listed as already shown. Each with a Portuguese translation.

Answer ONLY with a JSON object, no other text:
{"reply":"your English reply","reply_pt":"Portuguese translation of the reply","suggestions":[{"text":"possible answer","pt":"translation"}],"topic_pt":"current topic, 1-3 words in Portuguese","level":"A1|A2|B1|B2|C1|C2","corrections":[{"type":"grammar|pronunciation|vocab|register","said":"fragment as the learner said it","better":"corrected or formal fragment","informal":"casual version, or empty string","why_pt":"very simple explanation","example":"short English example"}],"corrected":"the learner's full last line with ONLY the real errors fixed, or empty string if there are no real errors"}`;

const corrItem = { type: "object", properties: { type: { type: "string" }, said: { type: "string" }, better: { type: "string" }, informal: { type: "string" }, why_pt: { type: "string" }, example: { type: "string" } }, required: ["type", "said", "better", "informal", "why_pt", "example"] };
export const SCHEMA = {
  type: "object",
  properties: { reply: { type: "string" }, reply_pt: { type: "string" }, suggestions: { type: "array", items: { type: "object", properties: { text: { type: "string" }, pt: { type: "string" } }, required: ["text", "pt"] } }, topic_pt: { type: "string" }, level: { type: "string" }, corrections: { type: "array", items: corrItem }, corrected: { type: "string" } },
  required: ["reply", "reply_pt", "topic_pt", "level", "corrections", "corrected"]
};

// monta o texto que vai para a IA: só as últimas falas (economiza a cota)
export function buildPrompt(state, { extra = "", unsure = [] } = {}) {
  const lines = (state.msgs || []).slice(-20).map(m => m.role === "me" ? `LEARNER (${m.spoken ? "spoken" : "typed"}): ${m.text}` : `SAM: ${m.text}`).join("\n");
  const u = unsure.length ? `\nThe speech recognizer was unsure about these words in the learner's last line: ${unsure.slice(0, 8).join(", ")}` : "";
  return shownSug(state) + `Current topic: ${state.topic || "none yet"}\nCurrent level estimate: ${state.level || "unknown"}\n\nConversation so far:\n${lines || "(empty: open the conversation. Greet the learner warmly, pick an easy first topic and ask a question.)"}${u}${extra ? "\n\nNote: " + extra : ""}\n\nAnswer with the JSON object only.`;
}

// "Explicar de outro jeito": a correção de novo, mais fácil
export const EXPLAIN_SYSTEM = `You help a Brazilian learner of American English who did not understand a correction. Explain it again like a patient teacher talking to a beginner: Brazilian Portuguese, at most 2 short sentences, everyday words, no grammar terms. Use a comparison with Portuguese if it helps. Then give 2 very short everyday English example sentences that use the correct form, each with its Portuguese translation, and 1 emoji per example as a visual hint.
Answer ONLY with JSON: {"explain_pt":"...","examples":[{"en":"...","pt":"...","emoji":"..."}]}`;
export const EXPLAIN_SCHEMA = { type: "object", properties: { explain_pt: { type: "string" }, examples: { type: "array", items: { type: "object", properties: { en: { type: "string" }, pt: { type: "string" }, emoji: { type: "string" } }, required: ["en", "pt", "emoji"] } } }, required: ["explain_pt", "examples"] };
export const explainPrompt = (line, c, level) => `Learner level: ${level || "A2"}\nThe learner said: "${line}"\nCorrection: "${c.said}" -> "${c.better}"\nExplanation they did not understand: "${c.why_pt}"\n\nAnswer with the JSON object only.`;

// "Não entendi": a fala do Sam de novo, mais simples e com emojis no lugar dos gestos
export const SIMPLIFY_SYSTEM = `You are Sam, a friendly American conversation partner. The Brazilian learner did not understand your last message. Say the same thing again in much simpler English (A1 level: short sentences, the most common words, present tense when possible), using 1 to 3 emojis as visual hints, like a teacher using gestures. Keep the same question at the end. Also give a short hint in Brazilian Portuguese explaining the hardest word or idea (not a full translation).
Answer ONLY with JSON: {"simple_en":"...","hint_pt":"..."}`;
export const SIMPLIFY_SCHEMA = { type: "object", properties: { simple_en: { type: "string" }, hint_pt: { type: "string" } }, required: ["simple_en", "hint_pt"] };
export const simplifyPrompt = text => `Your message the learner did not understand: "${text}"\n\nAnswer with the JSON object only.`;

// a IA às vezes devolve texto com o JSON no meio: pega o objeto que der para ler
export function looseJson(raw) {
  if (raw && typeof raw === "object") return raw;
  const s = String(raw || ""); const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}
const str = (v, n) => typeof v === "string" ? v.trim().slice(0, n) : "";
const norm = s => s.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim();

// confere e limpa a resposta da conversa; null se não der para usar
export function parseReply(raw) {
  const r = looseJson(raw); if (!r) return null;
  const reply = str(r.reply, 800); if (!reply) return null;
  const corrections = (Array.isArray(r.corrections) ? r.corrections : []).map(c => ({
    type: TYPES.includes(c && c.type) ? c.type : "vocab", said: str(c && c.said, 200), better: str(c && c.better, 200), informal: str(c && c.informal, 200), why_pt: str(c && c.why_pt, 300), example: str(c && c.example, 200)
  })).map(c => (norm(c.informal) === norm(c.better) || (c.type !== "register" && norm(c.informal) === norm(c.said)) ? { ...c, informal: "" } : c))
    .filter(c => c.better && (c.type === "register" ? norm(c.better) !== norm(c.said) || c.informal : norm(c.better) !== norm(c.said)) && !(norm(c.said) === "ok" && norm(c.better) === "okay")).slice(0, 3);
  const realErr = corrections.some(c => c.type !== "register");
  return { reply, reply_pt: str(r.reply_pt, 900), suggestions: parseSuggestions(r.suggestions), topic_pt: str(r.topic_pt, 40), level: LEVELS.includes(r.level) ? r.level : "", corrections, corrected: realErr ? str(r.corrected, 500) : "" };
}
// sugestões que já apareceram (para a IA não repetir)
export function shownSug(state, plainFn = t => t) {
  const seen = (state.msgs || []).slice(-12).flatMap(m => [...(m.sugOld || []), ...(m.sug || [])]).map(x => plainFn(x.text)).slice(-30);
  return seen.length ? `Suggestions already shown (do not repeat or rephrase): ${seen.map(t => `"${t}"`).join("; ")}\n\n` : "";
}
// respostas sugeridas para treinar a fala (até 5)
export function parseSuggestions(list) {
  return (Array.isArray(list) ? list : []).map(x => ({ text: str(x && x.text, 240), romaji: str(x && x.romaji, 300), pt: str(x && x.pt, 240) }))
    .filter(x => x.text).slice(0, 5).map(x => x.romaji ? x : { text: x.text, pt: x.pt });
}
// "Mais sugestões": só novas respostas para a última fala do professor
export const MORE_SUG_SYSTEM = `You help a Brazilian learner practice speaking American English. Given the teacher's last message and suggestions the learner already saw, write 4 NEW possible answers, different in content and wording from the ones shown (different opinions, details, stories, or questions back). Mix lengths: one medium sentence, two longer answers with a reason or example, one that asks a question back. Slightly above the learner's level. Each with a Portuguese translation.
Answer ONLY with JSON: {"suggestions":[{"text":"...","pt":"..."}]}`;
export const MORE_SUG_SCHEMA = { type: "object", properties: { suggestions: { type: "array", items: { type: "object", properties: { text: { type: "string" }, pt: { type: "string" } }, required: ["text", "pt"] } } }, required: ["suggestions"] };
export const moreSugPrompt = (state, m, plainFn = t => t) => `Learner level: ${state.level || "unknown"}\nTopic: ${state.topic || "-"}\nTeacher's last message: "${plainFn(m.text)}"\n${shownSug(state, plainFn)}Answer with the JSON object only.`;
export const parseMoreSug = raw => { const r = looseJson(raw); const s = r && parseSuggestions(r.suggestions); return s && s.length ? s : null; };
export function parseExplain(raw) {
  const r = looseJson(raw); if (!r) return null;
  const explain_pt = str(r.explain_pt, 400); if (!explain_pt) return null;
  const examples = (Array.isArray(r.examples) ? r.examples : []).map(e => ({ en: str(e && e.en, 200), pt: str(e && e.pt, 200), emoji: str(e && e.emoji, 12) })).filter(e => e.en).slice(0, 3);
  return { explain_pt, examples };
}
export function parseSimplify(raw) {
  const r = looseJson(raw); if (!r) return null;
  const simple_en = str(r.simple_en, 600); if (!simple_en) return null;
  return { simple_en, hint_pt: str(r.hint_pt, 300) };
}

// pega o texto da resposta, seja qual for o formato do modelo (Llama, gpt-oss...)
export function aiText(r) {
  if (r == null) return "";
  if (typeof r === "string") return r;
  if (r.response !== undefined && r.response !== null) return r.response;
  if (typeof r.output_text === "string") return r.output_text;
  const ch = r.choices && r.choices[0] && r.choices[0].message;
  if (ch && ch.content) return ch.content;
  if (Array.isArray(r.output)) {
    for (const o of [...r.output].reverse()) if (o && o.type === "message" && Array.isArray(o.content))
      for (const c of o.content) if (c && typeof c.text === "string" && c.text) return c.text;
  }
  if (r.result) return aiText(r.result);
  return r;
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
