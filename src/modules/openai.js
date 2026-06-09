const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const { getSystemPrompt } = require('./brainLoader');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });mo 220 caracteres
- Nunca bajulador, nunca professoral
- Nunca competir com o autor
- Nunca parecer automático
- Soar humana, elegante e sofisticada`;

// ─── Gera post premium ────────────────────────────────────────────────────────
async function generatePostDraft(rawInput) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: getSystemPrompt('post') },
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

// ─── Gera post de produto Amazon ──────────────────────────────────────────────
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
      { role: 'system', content: getSystemPrompt('post') },
      {
        role: 'user',
        content: `Escreva um post para X/Twitter com uma dica de organização relacionada a este tipo de produto.\n\n${productContext}\n\nINSTRUÇÕES EXTRAS:\n- NUNCA cite o nome da marca, nome do produto ou modelo\n- A dica deve parecer completamente orgânica — produto é a solução natural, nunca o foco\n- NÃO coloque o link no texto — será adicionado automaticamente\n- Máximo 380 caracteres\n- Retorne APENAS o texto do post, sem aspas, sem explicações`
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

// ─── Gera imagem ──────────────────────────────────────────────────────────────
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

// ─── Gera reply elegante ──────────────────────────────────────────────────────
async function generateReply(originalPost) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: getSystemPrompt('reply') },
      {
        role: 'user',
        content: `Você viu este post no X e vai responder como TÂMARA CAVALCANTE.\n\nPost original: "${originalPost}"\n\nEscreva o reply seguindo a estrutura VALIDA → COMPLEMENTA → FECHA LEVE.\nMáximo 220 caracteres.\nRetorne APENAS o texto do reply, sem aspas, sem explicações.`
      }
    ],
    max_tokens: 120,
    temperature: 0.85
  });

  const text = response.choices[0].message.content.trim();
  return text.length > 220 ? text.substring(0, 217) + '...' : text;
}

async function classifyMention(mentionText) {
  const prompt = `Classifique o tweet a seguir em uma das seguintes categorias exatas:
1. "pergunta_segura" (pergunta simples, positiva e dentro do tema organização, casa, rotina, mudança, closet, home office, ambientes)
2. "elogio" (elogio simples ou comentário positivo sobre organização, casa, rotina, mudança, closet, home office ou ambientes)
3. "critica_reclamacao" (crítica ou reclamação)
4. "pedido_preco_orcamento" (pedido de preço ou orçamento)
5. "parceria_comercial" (parceria, publicidade ou contato comercial)
6. "caso_pessoal" (cliente relatando caso pessoal complexo ou específico de organização)
7. "assunto_sensivel" (assuntos sensíveis, polêmicos, íntimos ou de cunho negativo)
8. "duvida_ambigua" (dúvida ambígua, confusa ou que não se encaixa claramente em pergunta segura)
9. "assunto_juridico" (assuntos jurídicos, processos, reclamações formais)
10. "spam" (mensagens sem nexo, robóticas, links suspeitos, ofensas gerais, provocações ou propagandas)

Tweet: "${mentionText}"

Retorne APENAS um objeto JSON com as chaves "categoria" (string com uma das opções exatas acima) e "justificativa" (string explicando brevemente a classificação em português). Exemplo:
{
  "categoria": "pergunta_segura",
  "justificativa": "O usuário faz uma pergunta simples e construtiva sobre como organizar o home office."
}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1
  });

  const resObj = JSON.parse(response.choices[0].message.content.trim());
  return resObj;
}

async function generateMentionResponse(mentionText) {
  const prompt = `Você é TÂMARA CAVALCANTE, Personal Organizer de alto padrão. Você recebeu a seguinte menção/pergunta no X/Twitter e precisa responder.

Menção: "${mentionText}"

Instruções para a resposta:
1. Tom de voz: elegante, acolhedor, sofisticado, natural, sem parecer IA.
2. Não tente vender serviços diretamente.
3. Não constranja a pessoa, não diga que a casa dela está bagunçada e não use tom de julgamento.
4. Escreva uma resposta curta e humana, com parágrafos curtos e elegantes, focando em trazer um insight valioso sobre organização, casa ou rotina de forma elegante.
5. Limite o tamanho a no máximo 280 caracteres.
6. Zero emojis, zero hashtags.
7. Retorne APENAS o texto da resposta, sem aspas, sem explicações ou prefixos.

Exemplo de resposta ideal:
"Home office junto ao quarto pode funcionar, mas precisa de limites bem claros.

Quando o espaço de descanso e o espaço de trabalho se misturam demais, a rotina costuma pesar.

Se não houver outro ambiente, eu gosto de pensar em separações visuais, poucos itens aparentes e um cantinho que “desapareça” ao fim do dia."`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: getSystemPrompt('mention') },
      { role: 'user', content: prompt }
    ],
    max_tokens: 250,
    temperature: 0.8
  });

  const text = response.choices[0].message.content.trim();
  return text.length > 280 ? text.substring(0, 277) + '...' : text;
}

module.exports = {
  generatePostDraft,
  generatePostFromProduct,
  generateImage,
  generateReply,
  classifyMention,
  generateMentionResponse
};
