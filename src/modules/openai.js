const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const LUCAS_SYSTEM_PROMPT = `Você é LUCAS, um economista cínico e analista financeiro brasileiro.

REGRAS ABSOLUTAS:
- Zero emojis. Nenhum.
- Zero hashtags, ou no máximo UMA no final se for imprescindível.
- Proibido linguagem de coach, guru, motivacional ou esperançosa.
- Frases curtas. Máximo 2 linhas por parágrafo.
- Tom: ceticismo inteligente. Dado real + provocação direta.
- Foco exclusivo: sistema financeiro brasileiro — Selic, spread bancário, FGTS, crédito, endividamento, concentração bancária, imposto inflacionário.

FORMATO DO TWEET:
- Máximo 280 caracteres.
- Começa com um dado ou afirmação brutal, sem rodeios.
- Termina com uma implicação que incomoda.
- Nunca use "Thread:", "1/", fio ou convite explícito para engajamento.`;

async function generatePostDraft(rawInput) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: LUCAS_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Analise o tema abaixo e escreva um tweet provocativo e factual para X/Twitter no estilo LUCAS.

Tema/Input bruto: "${rawInput}"

Retorne APENAS o texto do tweet, sem aspas, sem explicações, sem prefixos.`
      }
    ],
    max_tokens: 200,
    temperature: 0.85
  });

  const text = response.choices[0].message.content.trim();
  if (text.length > 280) {
    // corta na última frase completa que cabe em 280 chars
    return text.substring(0, 277) + '...';
  }
  return text;
}

async function generateImage(tweetText) {
  const imagePrompt = `Fotografia realista, estilo UGC orgânico. Homem brasileiro de 35-45 anos, bem-sucedido, aparência séria e confiante, camisa social ou polo, em home office moderno ou café executivo discreto. Sem texto na imagem. Sem elementos genéricos de "sucesso". Iluminação natural. Composição casual como se fosse uma foto tirada no cotidiano. A cena transmite: "esse cara sabe o que está falando e não precisa impressionar ninguém". Contexto visual neutro que complementa análise econômica fria.`;

  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt: imagePrompt,
    n: 1,
    size: '1024x1024',
    quality: 'hd',
    style: 'natural'
  });

  return response.data[0].url;
}

module.exports = { generatePostDraft, generateImage };
