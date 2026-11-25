// Digitar em romaji e ver virar hiragana (como um teclado japonês simples).
const T = {};
const add = (keys, kana) => keys.split(" ").forEach(k => { T[k] = kana; });
const rows = { "": "あいうえお", k: "かきくけこ", g: "がぎぐげご", s: "さしすせそ", z: "ざじずぜぞ", t: "たちつてと", d: "だぢづでど", n: "なにぬねの", h: "はひふへほ", b: "ばびぶべぼ", p: "ぱぴぷぺぽ", m: "まみむめも", r: "らりるれろ" };
for (const [c, ks] of Object.entries(rows)) [..."aiueo"].forEach((v, i) => add(c + v, ks[i]));
add("ya", "や"); add("yu", "ゆ"); add("yo", "よ"); add("wa", "わ"); add("wo", "を"); add("we", "うぇ"); add("wi", "うぃ");
add("shi", "し"); add("chi", "ち"); add("tsu", "つ"); add("fu", "ふ"); add("ji", "じ"); add("si", "し"); add("ti", "ち"); add("tu", "つ"); add("hu", "ふ"); add("zi", "じ");
add("la", "ら"); add("li", "り"); add("lu", "る"); add("le", "れ"); add("lo", "ろ");
add("fa", "ふぁ"); add("fi", "ふぃ"); add("fe", "ふぇ"); add("fo", "ふぉ"); add("va", "ゔぁ"); add("vi", "ゔぃ"); add("vu", "ゔ"); add("ve", "ゔぇ"); add("vo", "ゔぉ");
add("je", "じぇ"); add("che", "ちぇ"); add("she", "しぇ"); add("thi", "てぃ"); add("dhi", "でぃ"); add("di", "ぢ"); add("du", "づ");
const yo = { ky: "き", gy: "ぎ", sy: "し", sh: "し", zy: "じ", jy: "じ", ty: "ち", cy: "ち", ch: "ち", dy: "ぢ", ny: "に", hy: "ひ", by: "び", py: "ぴ", my: "み", ry: "り" };
for (const [c, k] of Object.entries(yo)) { add(c + "a", k + "ゃ"); add(c + "u", k + "ゅ"); add(c + "o", k + "ょ"); }
add("ja", "じゃ"); add("ju", "じゅ"); add("jo", "じょ");
add("xa", "ぁ"); add("xi", "ぃ"); add("xu", "ぅ"); add("xe", "ぇ"); add("xo", "ぉ"); add("xtsu", "っ"); add("xtu", "っ"); add("xya", "ゃ"); add("xyu", "ゅ"); add("xyo", "ょ");
const PUNCT = { ".": "。", ",": "、", "?": "？", "!": "！", "-": "ー", "[": "「", "]": "」", "~": "〜" };
const PREFIX = new Set(); for (const k of Object.keys(T)) for (let i = 1; i < k.length; i++) PREFIX.add(k.slice(0, i));
const VOW = /[aiueo]/;

// final = true: a palavra acabou (ex.: "n" no fim vira ん)
export function toKana(input, final = false) {
  const s = String(input); let out = "", i = 0;
  while (i < s.length) {
    const ch = s[i], lo = ch.toLowerCase();
    if (!/[a-z']/.test(lo)) { out += PUNCT[ch] || ch; i++; continue; }
    const nx = (s[i + 1] || "").toLowerCase();
    if (lo === "n") {
      if (nx === "'") { out += "ん"; i += 2; continue; }
      if (!nx) { if (final) { out += "ん"; i++; continue; } return out + s.slice(i); }
      if (!VOW.test(nx) && nx !== "y" && /[a-z]/.test(nx)) { out += "ん"; i++; continue; }
    }
    if (lo === nx && /[bcdfghjklmpqrstvwxz]/.test(lo)) { out += "っ"; i++; continue; }
    if (lo === "t" && nx === "c") { out += "っ"; i++; continue; }
    let hit = null;
    for (const len of [4, 3, 2, 1]) { const k = s.slice(i, i + len).toLowerCase(); if (T[k]) { hit = [k, T[k]]; break; } }
    if (hit) { out += hit[1]; i += hit[0].length; continue; }
    const rest = s.slice(i).toLowerCase();
    if (!final && PREFIX.has(rest)) return out + s.slice(i); // ainda digitando a sílaba
    out += ch; i++;
  }
  return out;
}
