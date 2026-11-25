// Primeira fala pronta de cada professor: "Começar conversa" responde na hora, sem esperar a IA.
const pick = a => a[Math.floor(Math.random() * a.length)];
const EN = [
  { reply: "Hey there! I'm Sam. 😊 How's your day going so far?", pt: "Oi! Eu sou o Sam. Como está sendo o seu dia até agora?", topic: "Seu dia",
    sug: [["It's going well, thanks!", "Está indo bem, obrigado!"], ["Pretty good! I'm a little tired today.", "Bem bom! Estou um pouco cansado hoje."], ["It's been busy, because I worked all morning.", "Está corrido, porque trabalhei a manhã toda."], ["It's great! How about yours, Sam?", "Está ótimo! E o seu, Sam?"]] },
  { reply: "Hi! I'm Sam, nice to meet you! What do you like to do on the weekends?", pt: "Oi! Eu sou o Sam, prazer! O que você gosta de fazer nos fins de semana?", topic: "Fim de semana",
    sug: [["I like to rest.", "Eu gosto de descansar."], ["I usually watch movies at home.", "Eu costumo ver filmes em casa."], ["I like to go out with my friends, because I work a lot during the week.", "Gosto de sair com meus amigos, porque trabalho muito durante a semana."], ["I like to play video games. What about you?", "Gosto de jogar videogame. E você?"]] },
  { reply: "Hello! I'm Sam. 🍳 What did you have for breakfast today?", pt: "Olá! Eu sou o Sam. O que você tomou de café da manhã hoje?", topic: "Comida",
    sug: [["Just coffee.", "Só café."], ["I had bread and coffee with milk.", "Comi pão e café com leite."], ["I didn't eat breakfast, because I woke up late.", "Não tomei café, porque acordei tarde."], ["Eggs and toast! What do Americans usually eat?", "Ovos e torrada! O que os americanos costumam comer?"]] }
];
const ES = [
  { reply: "¡Hola! Soy Juan. 😄 ¿Cómo estás hoy?", pt: "Oi! Sou o Juan. Como você está hoje?", topic: "Seu dia",
    sug: [["¡Bien, gracias!", "Bem, obrigado!"], ["Estoy bien, un poco cansado.", "Estou bem, um pouco cansado."], ["Estoy muy bien porque hoy es mi día libre.", "Estou muito bem porque hoje é meu dia de folga."], ["¡Muy bien! ¿Y tú, Juan?", "Muito bem! E você, Juan?"]] },
  { reply: "¡Hola, hola! Soy Juan. ⚽ ¿Te gusta el fútbol?", pt: "Oi, oi! Sou o Juan. Você gosta de futebol?", topic: "Futebol",
    sug: [["¡Sí, me encanta!", "Sim, adoro!"], ["Me gusta un poco, pero no lo veo mucho.", "Gosto um pouco, mas não assisto muito."], ["Sí, me gusta mucho porque juego con mis amigos los domingos.", "Sim, gosto muito porque jogo com meus amigos aos domingos."], ["No mucho. ¿Cuál es tu equipo favorito?", "Não muito. Qual é o seu time favorito?"]] },
  { reply: "¡Hola! Soy Juan. 🌮 ¿Qué te gusta comer?", pt: "Oi! Sou o Juan. O que você gosta de comer?", topic: "Comida",
    sug: [["Me gusta la pizza.", "Gosto de pizza."], ["Me gusta mucho el arroz con frijoles.", "Gosto muito de arroz com feijão."], ["Me encanta el churrasco porque siempre lo como con mi familia.", "Adoro churrasco porque sempre como com a minha família."], ["Me gustan los tacos. ¿Cuál es tu comida favorita?", "Gosto de tacos. Qual é a sua comida favorita?"]] }
];
const JA = nick => [
  { reply: "こんにちは！ぼくはニイです。お名前{なまえ}は？", romaji: "Konnichiwa! Boku wa Nii desu. O-namae wa?", pt: "Oi! Eu sou o Nii. Qual é o seu nome?", topic: "Apresentação",
    sug: [[`${nick}です。`, `${nick} desu.`, `Sou ${nick}.`], [`わたしは${nick}です。よろしくおねがいします。`, `Watashi wa ${nick} desu. Yoroshiku onegaishimasu.`, `Eu sou ${nick}. Muito prazer.`], [`${nick}です。ブラジル人{じん}です。`, `${nick} desu. Burajiru-jin desu.`, `Sou ${nick}. Sou brasileiro.`], [`${nick}です。ニイさんは、どこから？`, `${nick} desu. Nii-san wa, doko kara?`, `Sou ${nick}. E você, Nii, é de onde?`]] },
  { reply: "こんにちは！ニイです。げんきですか？", romaji: "Konnichiwa! Nii desu. Genki desu ka?", pt: "Oi! Sou o Nii. Tudo bem?", topic: "Cumprimentos",
    sug: [["はい、げんきです。", "Hai, genki desu.", "Sim, estou bem."], ["はい、げんきです。ありがとう！", "Hai, genki desu. Arigatou!", "Sim, estou bem. Obrigado!"], ["ちょっとつかれています。しごとがありましたから。", "Chotto tsukarete imasu. Shigoto ga arimashita kara.", "Estou um pouco cansado, porque tive trabalho."], ["げんきです！ニイさんは？", "Genki desu! Nii-san wa?", "Estou bem! E você, Nii?"]] }
];
export function opener(lang, nick = "") {
  const n = String(nick || "").trim().slice(0, 20) || "Ana";
  const o = pick(lang === "ja" ? JA(n) : lang === "es" ? ES : EN);
  return {
    reply: o.reply, reply_pt: o.pt, ...(o.romaji ? { romaji: o.romaji } : {}), topic_pt: o.topic,
    suggestions: o.sug.map(x => x.length === 3 ? { text: x[0], romaji: x[1], pt: x[2] } : { text: x[0], pt: x[1] })
  };
}
