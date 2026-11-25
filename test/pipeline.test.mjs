import assert from "node:assert/strict";
import { parts, parseCheck, parseReplyOnly, parseSug, checkPrompt } from "../src/pipeline.js";
import { SYSTEM as EN, parseReply } from "../src/tutor.js";
import { system as JA, parseReply as parseJa } from "../src/tutor-ja.js";
import { SYSTEM as ES } from "../src/tutor-es.js";
import { opener } from "../src/openers.js";
for (const [full, lang] of [[EN, "en"], [JA("Ana"), "ja"], [ES, "es"]]) {
  const p = parts(full, lang);
  assert.ok(!p.reply.includes("CORRECTIONS") && !p.reply.includes("SUGGESTIONS"), lang + ": resposta sem correções");
  assert.ok(p.check.includes("CORRECTIONS") && !p.check.includes("SUGGESTIONS"), lang + ": correções separadas");
  assert.ok(p.sug.includes("SUGGESTIONS") && !p.sug.includes("YOUR reply"), lang + ": sugestões separadas");
  if (lang === "ja") assert.ok(p.check.includes("JAPANESE TEXT FORMAT") && p.sug.includes("JAPANESE TEXT FORMAT"), "furigana nas 3 partes");
}
assert.equal(parseReplyOnly(parseReply)({ reply: "Hi!", reply_pt: "Oi!", level: "A2", topic_pt: "x" }).reply, "Hi!");
const c = parseCheck(parseJa)({ corrections: [{ type: "grammar", said: "ga", better: "は", why_pt: "x" }], corrected: "私{わたし}は", corrected_romaji: "watashi wa" });
assert.equal(c.items.length, 1); assert.equal(c.corrected_romaji, "watashi wa");
assert.equal(parseCheck(parseReply)({ reply: "sem correções" }), null);
assert.equal(parseSug({ suggestions: [{ text: "Yes!", pt: "Sim!" }] })[0].text, "Yes!");
assert.match(checkPrompt({ msgs: [{ role: "ai", text: "私{わたし}" }, { role: "me", text: "hai" }] }, "Nii", [], t => t.replace(/\{[^}]*\}/g, "")), /NII: 私\nLEARNER \(typed\): hai/);
for (const l of ["en", "ja", "es"]) { const o = opener(l, "Everaldo"); assert.ok(o.reply && o.reply_pt && o.suggestions.length === (l === "ja" ? 4 : 0), l); if (l === "ja") assert.ok(o.romaji && o.suggestions[0].romaji); }
console.log("pipeline ok");
