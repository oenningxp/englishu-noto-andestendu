// Divide o trabalho da IA em 3 pedidos menores, para a resposta chegar mais rápido:
//   1) "reply": só a fala do professor (é o que a pessoa espera);
//   2) "check": as correções da última fala do aluno (roda em paralelo com o 1);
//   3) "sug": as sugestões de resposta (depois do 1, sem a pessoa esperar).
import { looseJson, parseSuggestions, shownSug, parseReply } from "./tutor.js";

const NAMES = { en: "American English", ja: "Japanese", es: "Latin American Spanish" };

export function parts(full, lang) {
  const iC = full.indexOf("\nCORRECTIONS"), iS = full.indexOf("\nSUGGESTIONS"), iA = full.indexOf("\nAnswer ONLY");
  if (iC < 0 || iS < iC || iA < iS) throw new Error("prompt do professor fora do formato");
  const ja = lang === "ja", L = NAMES[lang] || "the language";
  const ruby = ja ? "\n" + ((full.match(/JAPANESE TEXT FORMAT[^\n]*/) || [""])[0]) : "";
  const reply = full.slice(0, iC) + `\nCorrections and answer suggestions are handled separately: do NOT write them.\n\nAnswer ONLY with JSON: {"reply":"your reply${ja ? " with readings in braces" : ""}",${ja ? '"romaji":"Hepburn romaji of the reply",' : ""}"reply_pt":"Portuguese translation of the reply","topic_pt":"current topic, 1-3 words in Portuguese","level":"${ja ? "Iniciante|N5|N4|N3|N2|N1" : "A1|A2|B1|B2|C1|C2"}"}`;
  const check = `You are a careful ${L} teacher. Check ONLY the last line written by a Brazilian Portuguese speaker in a chat, following these rules.${ruby}\n` + full.slice(iC, iS) +
    `\nAnswer ONLY with JSON: {"corrections":[{"type":"grammar|pronunciation|vocab|register","said":"fragment as the learner said it","better":"corrected or formal fragment","informal":"casual version or empty string","why_pt":"very simple explanation","example":"short example"}],"corrected":"the learner's whole last line with only the real errors fixed, or empty string"${ja ? ',"corrected_romaji":"romaji of corrected, or empty string"' : ""}}`;
  const sug = `You help a Brazilian Portuguese speaker practice speaking ${L}. Write suggested answers to the teacher's last message.${ruby}\n` +
    full.slice(iS, iA).replace(/YOUR reply/g, "the teacher's last message").replace(/YOUR latest question/g, "the teacher's latest question").replace(/asks YOU/g, "asks the teacher") +
    `\nAnswer ONLY with JSON: {"suggestions":[{"text":"possible answer"${ja ? ',"romaji":"..."' : ""},"pt":"Portuguese translation"}]}`;
  return { reply, check, sug };
}

const S = { type: "string" };
export const REPLY_SCHEMA = { type: "object", properties: { reply: S, romaji: S, reply_pt: S, topic_pt: S, level: S }, required: ["reply", "reply_pt", "topic_pt", "level"] };
export const CHECK_SCHEMA = { type: "object", properties: { corrections: { type: "array", items: { type: "object", properties: { type: S, said: S, better: S, informal: S, why_pt: S, example: S }, required: ["type", "said", "better", "informal", "why_pt", "example"] } }, corrected: S, corrected_romaji: S }, required: ["corrections", "corrected"] };
export const SUG_SCHEMA = { type: "object", properties: { suggestions: { type: "array", items: { type: "object", properties: { text: S, romaji: S, pt: S }, required: ["text", "pt"] } } }, required: ["suggestions"] };

const lineOf = (m, name, plainFn) => m.role === "me" ? `LEARNER (${m.spoken ? "spoken" : "typed"}): ${m.text}` : `${name.toUpperCase()}: ${plainFn(m.text)}`;
export function checkPrompt(state, name, unsure = [], plainFn = t => t) {
  const lines = (state.msgs || []).slice(-6).map(m => lineOf(m, name, plainFn)).join("\n");
  const u = unsure.length ? `\nThe speech recognizer was unsure about these words in the learner's last line: ${unsure.slice(0, 8).join(", ")}` : "";
  return `Learner level estimate: ${state.level || "unknown"}\n\nRecent conversation:\n${lines}${u}\n\nCheck ONLY the learner's LAST line. Answer with the JSON object only.`;
}
export function sugPrompt(state, aiMsg, plainFn = t => t) {
  return `Learner level: ${state.level || "unknown"}\nTopic: ${state.topic || "-"}\nTeacher's last message: "${plainFn(aiMsg.text)}"\n\n${shownSug(state, plainFn)}Answer with the JSON object only.`;
}
// leitura das respostas (reaproveita as regras do Sam/Nii)
export const parseReplyOnly = parseFn => raw => { const r = looseJson(raw); return r ? parseFn({ ...r, corrections: [], corrected: "" }) : null; };
export const parseCheck = parseFn => raw => {
  const r = looseJson(raw); if (!r || !Array.isArray(r.corrections)) return null;
  const x = parseFn({ ...r, reply: "-" });
  return x && { items: x.corrections, corrected: x.corrected, ...(x.corrected_romaji ? { corrected_romaji: x.corrected_romaji } : {}) };
};
export const parseSug = raw => { const r = looseJson(raw); const s = r && parseSuggestions(r.suggestions); return s && s.length ? s : null; };
export { parseReply };
