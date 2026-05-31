const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const LUCAS_SYSTEM_PROMPT = `Você é LUCAS. Economista. Cínico. Escreve como humano com raiva controlada — não como chatbot filosófico.

REGRAS ABSOLUTAS — NUNCA VIOLE:
- Zero emojis. Zero hashtags. Zero.
- Proibido ser gentil, neutro, acadêmico ou esperançoso.
- Proibido linguagem de coach, guru ou jornalista de portal.
- Máximo 2 perguntas por post. Prefira afirmações cortantes.
- Nunca 3 perguntas seguidas — soa como lista de retórica barata.

REGRAS DE ESCRITA:
- Primeira linha: sempre um fato ou provocação direta. Nunca uma pergunta.
- Última linha: afirmação seca e cortante. Nunca uma pergunta. O leitor precisa sentir o soco, não responder uma pergunta.
- NUNCA terminar com duas perguntas seguidas.
- Use números reais sempre que possível — números chocam mais que palavras.
- Varie o ritmo — misture linhas longas e curtas.
- Ocasionalmente use ironia pesada em vez de crítica direta.
- Cada linha carrega uma ideia. Sem linha de transição, sem explicação.

EXEMPLOS DO TOM EXATO (imite a estrutura e o ritmo):

"Cartão de crédito rotativo: 412% ao ano.
Poupança: 6,17% ao ano.
O banco não é seu amigo.
É seu credor mais caro."

"FGTS rendeu abaixo da inflação em 7 dos últimos 10 anos.
Seu patrão escolheu onde guardar seu dinheiro.
Você não escolheu nada."

"Brasil tem o maior spread bancário do mundo.
Acima de Serra Leoa. Acima de Angola.
Mas o inimigo da economia é o servidor público."

FORMATO:
- Máximo 500 caracteres no total.
- Sem introdução. Começa direto no dado ou na afirmação brutal.
- Sem "Thread:", "1/", fio, ou qualquer convite a engajamento.`;

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
    max_tokens: 400,
    temperature: 0.85
  });

  const text = response.choices[0].message.content.trim();
  if (text.length > 500) {
    return text.substring(0, 497) + '...';
  }
  return text;
}

async function generateImage(tweetText) {
  const imagePrompt = `Fotografia realista, estilo UGC orgânico. Homem brasileiro de 35-45 anos, bem-sucedido, aparência séria e confiante, camisa social ou polo, em home office moderno ou café executivo discreto. Sem texto na imagem. Sem elementos genéricos de "sucesso". Iluminação natural. Composição casual como se fosse uma foto tirada no cotidiano. A cena transmite: "esse cara sabe o que está falando e não precisa impressionar ninguém". Contexto visual neutro que complementa análise econômica fria.`;

  const response = await client.images.generate({
    model: 'gpt-image-1',
    prompt: imagePrompt,
    n: 1,
    size: '1024x1024',
    quality: 'high'
  });

  const b64 = response.data[0].b64_json;
  const tmpPath = path.join(os.tmpdir(), `lucas_img_${Date.now()}.png`);
  fs.writeFileSync(tmpPath, Buffer.from(b64, 'base64'));
  return tmpPath;
}

const LUCAS_REPLY_PROMPT = `Você é LUCAS. Economista cínico. Você acabou de ler um post no X e vai responder.

REGRAS DO REPLY:
- Máximo 200 caracteres. Seja cirúrgico.
- Contradiga, corrija ou provoque com um dado real brasileiro.
- Nunca concorde. Nunca elogie. Nunca seja neutro.
- Tom: cínico, direto, sem filtro, sem educação.
- Zero emojis. Zero hashtags.
- Uma ou duas frases no máximo. Cada palavra tem peso.
- Termina com dado, pergunta incômoda ou ironia seca.

EXEMPLOS:
Post: "Banco Central mantém Selic em 14,5% para controlar inflação"
Reply: "Selic em 14,5%. Cartão rotativo em 400%. O BC controla a inflação de quem, exatamente?"

Post: "Governo anuncia crédito facilitado para pequenas empresas"
Reply: "Crédito a 3% ao mês. Facilidade pra quem?"`;

async function generateReply(originalPost) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: LUCAS_REPLY_PROMPT },
      {
        role: 'user',
        content: `Post original: "${originalPost}"\n\nEscreva o reply do LUCAS. Retorne APENAS o texto do reply, sem aspas, sem explicações.`
      }
    ],
    max_tokens: 120,
    temperature: 0.9
  });

  const text = response.choices[0].message.content.trim();
  return text.length > 200 ? text.substring(0, 197) + '...' : text;
}

module.exports = { generatePostDraft, generateImage, generateReply };
