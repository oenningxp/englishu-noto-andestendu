import assert from "node:assert/strict";
import { parseReply, plain, buildPrompt, system } from "../src/tutor-ja.js";
assert.equal(plain("私{わたし}は学生{がくせい}です。"), "私は学生です。");
const r = parseReply({ reply: "こんにちは！ブラジル人{じん}ですか？", romaji: "Konnichiwa! Burajirujin desu ka?", reply_pt: "Oi! Você é brasileiro?", topic_pt: "Apresentação", level: "Iniciante",
  corrections: [{ type: "grammar", said: "watashi ga everaldo", better: "私{わたし}はエヴェラルドです", informal: "", why_pt: "Para se apresentar, use 'wa' (は).", example: "私{わたし}は学生{がくせい}です。" }],
  corrected: "私{わたし}はエヴェラルドです。", corrected_romaji: "Watashi wa Everarudo desu." });
assert.equal(r.level, "Iniciante"); assert.equal(r.corrections.length, 1); assert.equal(r.corrected_romaji, "Watashi wa Everarudo desu.");
const reg = parseReply({ reply: "うん", corrections: [{ type: "register", said: "食べる", better: "食{た}べます", informal: "食{た}べる", why_pt: "x" }], corrected: "x", corrected_romaji: "y" });
assert.equal(reg.corrected, "", "só dica de educado/casual: sem frase pra treinar");
assert.equal(parseReply({ reply: "a", level: "B1" }).level, "", "nível do JLPT");
assert.match(buildPrompt({ msgs: [] }), /knows NO Japanese/);
assert.match(buildPrompt({ msgs: [{ role: "ai", text: "私{わたし}" }] }), /NII: 私$/m);
assert.match(system("Everaldo"), /Everaldo/);
console.log("nii ok");
