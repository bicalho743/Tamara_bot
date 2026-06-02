const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TAMARA_SYSTEM_PROMPT = `Você é TÂMARA CAVALCANTE. Personal Organizer premium especialista em organização de casas de alto padrão e mudanças residenciais.

POSICIONAMENTO:
- Público: mulheres 35+, alta renda, casas sofisticadas
- Problema que resolve: casa bonita que não funciona na rotina
- Não é minimalismo. Não é "Marie Kondo". É praticidade elegante.
- Nunca sugira que o cliente tem "coisa demais" ou precisa descartar

LINGUAGEM PREMIUM — USE SEMPRE:
- casa funcional, rotina leve, organização invisível
- closet, cozinha funcional, casa fluida
- praticidade silenciosa, experiência premium
- tempo, conforto, leveza, sofisticação

PROIBIDO:
- hacks baratos, DIY, economia doméstica
- "pote de sorvete", "caixinha de sapato", gambiarra
- marcas, nomes de produtos, modelos
- linguagem de coach, guru ou vendedor
- "incrível", "transformador", "muda sua vida"
- emojis — zero emojis em todos os posts
- hashtags

ESTRUTURA DO POST PARA X:
- Linha 1: frase forte, opinião ou verdade inconveniente — gera reação
- Meio: desenvolvimento prático em 2-3 linhas curtas
- Última linha: CTA do X — gera reply ou compartilhamento

CTA PARA X — rotacione, nunca repita o mesmo 2 posts seguidos:
1. "Você reconhece esse padrão?"
2. "Concorda ou exagero?"
3. "Quem está mudando precisava ler isso."
4. "Isso deveria ser ensinado antes da primeira mudança."
5. "Qual cômodo é o caos da sua casa hoje?"
6. "Manda pra quem está passando por isso agora."

TEMAS — varie entre:
- Casa bonita que não funciona na rotina
- Organização invisível — quando tudo tem lugar
- Mudança sem estresse — decisões antes do caminhão
- Closet e guarda-roupa funcional
- Cozinha que facilita a rotina
- Casa nova — por onde começar com clareza
- Rotina doméstica leve
- Luxo silencioso — a casa que não precisa de esforço

EXEMPLOS DO TOM EXATO:

"Uma casa bonita não significa uma casa funcional.
São coisas diferentes — e confundir as duas cansa.
Você reconhece esse padrão?"

"Uma mudança bem feita não começa no caminhão.
Começa semanas antes, nas decisões invisíveis.
O que vai? Onde vai morar? Isso é o que reduz o caos."

"O verdadeiro luxo de uma casa organizada:
não precisar pensar onde estão as coisas.
Concorda ou exagero?"

"Em mudança, a primeira caixa a abrir deveria ser a do conforto.
Roupa de cama, banho, remédios, carregadores.
Seu futuro eu — exausto — agradece."

"Organização boa é a que funciona no dia corrido.
Não a que fica bonita para foto e bagunça em 3 dias."

FORMATO:
- Máximo 460 caracteres
- Sem introdução — começa direto na frase forte
- Sem Thread, 1/, fio
- CTA sempre na última linha`;

async function generatePostDraft(rawInput) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: TAMARA_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Escreva um post para X/Twitter no estilo TÂMARA CAVALCANTE.\n\nTema: "${rawInput}"\n\nRetorne APENAS o texto do post, sem aspas, sem explicações, sem prefixos.`
      }
    ],
    max_tokens: 400,
    temperature: 0.85
  });

  const text = response.choices[0].message.content.trim();
  return text.length > 460 ? text.substring(0, 457) + '...' : text;
}

async function fetchProductName(amazonUrl) {
  try {
    const { data } = await axios.get(amazonUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      },
      timeout: 10000
    });
    const titleMatch = data.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) {
      return titleMatch[1].replace(/\s*[-|]\s*Amazon.*$/i, '').trim().substring(0, 120);
    }
    return null;
  } catch (e) {
    console.log('[openai] Não conseguiu buscar nome do produto:', e.message);
    return null;
  }
}

async function generatePostFromProduct(amazonUrl) {
  const productName = await fetchProductName(amazonUrl);
  const productContext = productName
    ? `Tipo de produto: "${productName}"`
    : `Link do produto: ${amazonUrl}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: TAMARA_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Escreva um post para X/Twitter com uma dica de organização relacionada a este tipo de produto.\n\n${productContext}\n\nINSTRUÇÕES EXTRAS:\n- NUNCA cite o nome da marca, nome do produto ou modelo\n- A dica deve parecer orgânica — o produto é a solução natural, não o foco\n- NÃO coloque o link no texto — será adicionado automaticamente\n- Máximo 380 caracteres\n- Retorne APENAS o texto do post, sem aspas, sem explicações`
      }
    ],
    max_tokens: 300,
    temperature: 0.85
  });

  const text = response.choices[0].message.content.trim();
  const postText = text.length > 380 ? text.substring(0, 377) + '...' : text;
  const linkLine = `\n\n${amazonUrl}`;
  const maxPost = 500 - linkLine.length;
  const finalPost = postText.length > maxPost ? postText.substring(0, maxPost - 3) + '...' : postText;
  return `${finalPost}${linkLine}`;
}

async function generateImage(postText) {
  const imagePrompt = `Elegant home organization flat lay on white marble background. Clean, minimal, premium aesthetic. Related to: "${postText}". Style: high-end interior design magazine, bright natural light, top-down view. No people, no faces, no text overlay. Luxury lifestyle photography.`;

  const response = await client.images.generate({
    model: 'gpt-image-1',
    prompt: imagePrompt,
    n: 1,
    size: '1024x1024',
    quality: 'high'
  });

  const b64 = response.data[0].b64_json;
  const tmpPath = path.join(os.tmpdir(), `tamara_img_${Date.now()}.png`);
  fs.writeFileSync(tmpPath, Buffer.from(b64, 'base64'));
  return tmpPath;
}

const TAMARA_REPLY_PROMPT = `Você é TÂMARA CAVALCANTE. Personal Organizer premium.

REGRAS DO REPLY:
- Máximo 200 caracteres
- Responda com insight prático ou verdade elegante
- Tom: sofisticado, direto, sem enrolação
- Zero emojis, zero hashtags
- Uma ou duas frases no máximo`;

async function generateReply(originalPost) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: TAMARA_REPLY_PROMPT },
      {
        role: 'user',
        content: `Post original: "${originalPost}"\n\nEscreva o reply da TÂMARA. Retorne APENAS o texto, sem aspas, sem explicações.`
      }
    ],
    max_tokens: 120,
    temperature: 0.9
  });

  const text = response.choices[0].message.content.trim();
  return text.length > 200 ? text.substring(0, 197) + '...' : text;
}

module.exports = { generatePostDraft, generatePostFromProduct, generateImage, generateReply };
