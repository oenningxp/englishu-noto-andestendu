// O "Nii": irmão mais velho japonês. Mesmas funções do tutor do Sam, para japonês do zero.
import { looseJson } from "./tutor.js";

export const LEVELS = ["Iniciante", "N5", "N4", "N3", "N2", "N1"];
const TYPES = ["grammar", "pronunciation", "vocab", "register"];
const str = (v, n) => typeof v === "string" ? v.trim().slice(0, n) : "";

const RUBY_RULE = `JAPANESE TEXT FORMAT (very important): in every Japanese field, write the reading of EVERY kanji word in hiragana inside curly braces right after it, like 私{わたし}は学生{がくせい}です。 or 日本語{にほんご}を勉強{べんきょう}します。 Never put braces after kana. Katakana and hiragana need no reading.`;

export const system = nick => `You are Nii (兄), a warm, playful Japanese "big brother" who helps a Brazilian Portuguese speaker learn Japanese FROM ZERO by chatting. You call the learner 弟{おとうと}さん or by their name (${nick || "friend"}) and cheer them on.

CONVERSATION
- YOU choose the topics: greetings, introductions, food, family, hobbies, daily life, Japan, anime/games, travel. Keep one topic for several turns.
- Speak simple, natural Japanese. For "Iniciante" and N5: one or two VERY short sentences, mostly hiragana with only the most basic kanji, polite です/ます form. Ask one easy question each time and, when useful, show how to answer (e.g. "ブラジル人{じん}です。").
- Start polite (です/ます). As the learner improves (N4 and up), gradually introduce casual speech too, and mention it in a "register" tip.
- Estimate the learner's level: Iniciante (cannot read yet / only a few words), then JLPT N5 to N1. Stay slightly above it.
- The learner may write in romaji (e.g. "watashi wa everaldo desu"): treat it as Japanese. Never correct the fact that they used romaji. They may also write in Portuguese: answer in very simple Japanese and help them say it in Japanese.
- If the learner did not understand: say it again even simpler, with 1 or 2 emojis as gestures, and teach the key word.
${RUBY_RULE}

CORRECTIONS (only for the learner's LAST line, and only if it is from the LEARNER; otherwise empty list)
- Check particles (は/が/を/に/で/へ/の), verb forms, です/ます use, counters, word order, adjective forms (い/な), and words copied from Portuguese.
- Fix the FORM, never the MEANING. Keep the learner's idea. Asking what a word means is not an error.
- Casual Japanese is not an error. When useful, add ONE "register" item showing polite vs casual: better = polite form, informal = casual form, why_pt = when to use each.
- If the line was SPOKEN (speech recognition of real audio), typical Brazilian mistakes show up as wrong words: long vowels (おばさん vs おばあさん), double consonants (きて vs きって), ん, つ, ふ, ら行 (r). Flag "pronunciation" only when reasonably confident and say which sound to practice.
- why_pt: Brazilian Portuguese, ONE very simple sentence, max 15 words, no grammar jargon.
- example: one short Japanese example using the correct form (with readings in braces).
- At most 3 items.

Answer ONLY with JSON:
{"reply":"your Japanese reply with readings in braces","romaji":"Hepburn romaji of the reply","reply_pt":"Portuguese translation","topic_pt":"topic in Portuguese, 1-3 words","level":"Iniciante|N5|N4|N3|N2|N1","corrections":[{"type":"grammar|pronunciation|vocab|register","said":"what the learner wrote","better":"correct/polite form, readings in braces","informal":"casual form or empty string","why_pt":"simple explanation","example":"Japanese example, readings in braces"}],"corrected":"the learner's whole last line with only the real errors fixed (readings in braces), or empty string","corrected_romaji":"romaji of corrected, or empty string"}`;

const corrItem = { type: "object", properties: { type: { type: "string" }, said: { type: "string" }, better: { type: "string" }, informal: { type: "string" }, why_pt: { type: "string" }, example: { type: "string" } }, required: ["type", "said", "better", "informal", "why_pt", "example"] };
export const SCHEMA = {
  type: "object",
  properties: { reply: { type: "string" }, romaji: { type: "string" }, reply_pt: { type: "string" }, topic_pt: { type: "string" }, level: { type: "string" }, corrections: { type: "array", items: corrItem }, corrected: { type: "string" }, corrected_romaji: { type: "string" } },
  required: ["reply", "romaji", "reply_pt", "topic_pt", "level", "corrections", "corrected", "corrected_romaji"]
};

export function buildPrompt(state, { extra = "", unsure = [] } = {}) {
  const lines = (state.msgs || []).slice(-20).map(m => m.role === "me" ? `LEARNER (${m.spoken ? "spoken" : "typed"}): ${m.text}` : `NII: ${plain(m.text)}`).join("\n");
  const u = unsure.length ? `\nThe speech recognizer was unsure about: ${unsure.slice(0, 8).join("、")}` : "";
  return `Current topic: ${state.topic || "none yet"}\nCurrent level estimate: ${state.level || "Iniciante"}\n\nConversation so far:\n${lines || "(empty: open the conversation. The learner knows NO Japanese yet. Greet them warmly with こんにちは, introduce yourself as Nii in one tiny sentence, and ask one super simple question.)"}${u}${extra ? "\n\nNote: " + extra : ""}\n\nAnswer with the JSON object only.`;
}

// texto sem as leituras: 私{わたし}は → 私は
export const plain = s => String(s || "").replace(/\{[^{}]*\}/g, "");

export function parseReply(raw) {
  const r = looseJson(raw); if (!r) return null;
  const reply = str(r.reply, 800); if (!reply) return null;
  const norm = s => plain(s).replace(/[\s。、！？!?.,「」]/g, "");
  const corrections = (Array.isArray(r.corrections) ? r.corrections : []).map(c => ({
    type: TYPES.includes(c && c.type) ? c.type : "vocab", said: str(c && c.said, 200), better: str(c && c.better, 300), informal: str(c && c.informal, 300), why_pt: str(c && c.why_pt, 300), example: str(c && c.example, 300)
  })).map(c => (norm(c.informal) === norm(c.better) ? { ...c, informal: "" } : c))
    .filter(c => c.better && (c.type === "register" ? norm(c.better) !== norm(c.said) || c.informal : norm(c.better) !== norm(c.said))).slice(0, 3);
  const realErr = corrections.some(c => c.type !== "register");
  return {
    reply, romaji: str(r.romaji, 900), reply_pt: str(r.reply_pt, 900), topic_pt: str(r.topic_pt, 40), level: LEVELS.includes(r.level) ? r.level : "",
    corrections, corrected: realErr ? str(r.corrected, 500) : "", corrected_romaji: realErr ? str(r.corrected_romaji, 600) : ""
  };
}

export const EXPLAIN_SYSTEM = `You help a Brazilian beginner learning Japanese who did not understand a correction. Explain it again like a patient big brother: Brazilian Portuguese, at most 2 short sentences, everyday words, no grammar terms; compare with Portuguese if it helps. Then give 2 very short Japanese example sentences using the correct form, each with romaji, Portuguese translation and 1 emoji.
${RUBY_RULE}
Answer ONLY with JSON: {"explain_pt":"...","examples":[{"en":"Japanese sentence with readings in braces","romaji":"...","pt":"...","emoji":"..."}]}`;
export const EXPLAIN_SCHEMA = { type: "object", properties: { explain_pt: { type: "string" }, examples: { type: "array", items: { type: "object", properties: { en: { type: "string" }, romaji: { type: "string" }, pt: { type: "string" }, emoji: { type: "string" } }, required: ["en", "romaji", "pt", "emoji"] } } }, required: ["explain_pt", "examples"] };
export const explainPrompt = (line, c, level) => `Learner level: ${level || "Iniciante"}\nThe learner said: "${line}"\nCorrection: "${c.said}" -> "${plain(c.better)}"\nExplanation they did not understand: "${c.why_pt}"\n\nAnswer with the JSON object only.`;
export function parseExplain(raw) {
  const r = looseJson(raw); if (!r) return null;
  const explain_pt = str(r.explain_pt, 400); if (!explain_pt) return null;
  const examples = (Array.isArray(r.examples) ? r.examples : []).map(e => ({ en: str(e && e.en, 300), romaji: str(e && e.romaji, 300), pt: str(e && e.pt, 200), emoji: str(e && e.emoji, 12) })).filter(e => e.en).slice(0, 3);
  return { explain_pt, examples };
}

export const SIMPLIFY_SYSTEM = `You are Nii, a friendly Japanese big brother. The Brazilian beginner did not understand your last message. Say the same thing again in the simplest possible Japanese (very short, hiragana, polite), with 1 to 3 emojis as gestures, keeping the same question. Also give romaji and a short Portuguese hint explaining the key word (not a full translation).
${RUBY_RULE}
Answer ONLY with JSON: {"simple_en":"simple Japanese with readings in braces","romaji":"...","hint_pt":"..."}`;
export const SIMPLIFY_SCHEMA = { type: "object", properties: { simple_en: { type: "string" }, romaji: { type: "string" }, hint_pt: { type: "string" } }, required: ["simple_en", "romaji", "hint_pt"] };
export const simplifyPrompt = text => `Your message the learner did not understand: "${plain(text)}"\n\nAnswer with the JSON object only.`;
export function parseSimplify(raw) {
  const r = looseJson(raw); if (!r) return null;
  const simple_en = str(r.simple_en, 600); if (!simple_en) return null;
  return { simple_en, romaji: str(r.romaji, 600), hint_pt: str(r.hint_pt, 300) };
}
