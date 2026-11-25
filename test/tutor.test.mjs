import assert from "node:assert/strict";
import { buildPrompt, parseReply, looseJson, unsureWords } from "../src/tutor.js";

// resposta boa, vinda como objeto
const ok = parseReply({ reply: "Nice! Where did you go?", reply_pt: "Legal! Onde você foi?", topic_pt: "Viagens", level: "B1",
  corrections: [{ type: "grammar", said: "I go yesterday", better: "I went yesterday", why_pt: "Passado." }, { type: "x", said: "same", better: "same", why_pt: "" }], corrected: "I went to the beach yesterday." });
assert.equal(ok.reply, "Nice! Where did you go?");
assert.equal(ok.corrections.length, 1, "correção igual ao original é descartada");
assert.equal(ok.level, "B1");
assert.equal(ok.corrected, "I went to the beach yesterday.");

// JSON no meio de texto
const loose = parseReply('Sure! {"reply":"Hi there!","reply_pt":"Oi!","topic_pt":"Oi","level":"Z9","corrections":[],"corrected":"x"} thanks');
assert.equal(loose.reply, "Hi there!");
assert.equal(loose.level, "", "nível inválido vira vazio");
assert.equal(loose.corrected, "", "sem correções, sem frase corrigida");
assert.equal(parseReply("nada aqui"), null);
assert.equal(parseReply({ reply: "" }), null);
assert.equal(looseJson("{quebrado"), null);

// prompt
const p = buildPrompt({ msgs: [{ role: "ai", text: "Hi!" }, { role: "me", text: "I am fine", spoken: true }], topic: "Oi", level: "A2" }, { unsure: ["fine"] });
assert.match(p, /LEARNER \(spoken\): I am fine/);
assert.match(p, /unsure about these words.*fine/);
assert.match(buildPrompt({ msgs: [] }), /open the conversation/);

// palavras incertas do Whisper
assert.deepEqual(unsureWords({ segments: [{ words: [{ word: " ship", probability: 0.3 }, { word: "the", probability: 0.99 }] }] }), ["ship"]);
assert.deepEqual(unsureWords({ text: "x" }), []);
console.log("tutor ok");

// formatos de resposta dos modelos
import { aiText, parseExplain, parseSimplify } from "../src/tutor.js";
assert.equal(aiText({ response: "x" }), "x");
assert.equal(aiText({ choices: [{ message: { content: '{"a":1}' } }] }), '{"a":1}');
assert.equal(aiText({ output: [{ type: "reasoning", content: [{ text: "pensando" }] }, { type: "message", content: [{ type: "output_text", text: "final" }] }] }), "final");
assert.equal(parseReply({ reply: "ok", corrections: [{ type: "grammar", said: "Try to ask", better: "try to ask!", why_pt: "" }] }).corrections.length, 0, "só pontuação/maiúscula não conta");
assert.equal(parseReply({ reply: "ok", corrections: [{ type: "grammar", said: "a", better: "b", why_pt: "c", example: "d" }] }).corrections[0].example, "d");
assert.equal(parseExplain({ explain_pt: "Fácil.", examples: [{ en: "Ask me.", pt: "Me pergunte.", emoji: "🙋" }] }).examples[0].emoji, "🙋");
assert.equal(parseSimplify({ simple_en: "" }), null);
console.log("formatos ok");
