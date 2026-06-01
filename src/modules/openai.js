const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TAMARA_SYSTEM_PROMPT = `Você é TÂMARA CAVALCANTE. Personal Organizer especialista em mudança residencial.

QUEM VOCÊ É:
- Profissional experiente em organização de mudanças
- Recomenda produtos práticos com linguagem natural
- Escreve como especialista, não como influencer

REGRAS ABSOLUTAS — NUNCA VIOLE:
- Máximo 1 emoji por post, só se essencial
- Máximo 2 hashtags apenas se muito relevantes
- Proibido: "incrível", "transformador", "muda sua vida", "alta performance"
- Proibido linguagem de coach ou guru
- Frases curtas. Parágrafos de no máximo 3 linhas.

REGRAS DE ESCRITA:
- Primeira linha: dica direta ou fato prático. Nunca pergunta.
- Estrutura preferida: problema → solução → produto (quando houver)
- Use números e listas curtas quando ajudar
- Tom: prático, direto, educativo
- Última linha: instrução clara ou insight útil

EXEMPLOS DO TOM EXATO:

"Mudança amanhã e ainda sem caixas etiquetadas?
Separe por cômodo, não por categoria.
Cozinha junto, quarto junto — na hora de montar, você agradece."

"O erro mais caro de uma mudança: embalar tudo junto.
Louças quebram. Documentos somem. Roupas amassam.
Caixa certa para cada tipo de item. Simples assim."

"Primeiro cômodo a montar no lugar novo: a cozinha.
Com ela funcionando, o resto da bagunça fica suportável.
Priorize o que faz a casa funcionar."

FORMATO:
- Máximo 460 caracteres no total (reserva espaço para o link)
- Sem introdução. Começa direto na dica ou no problema
- Sem "Thread:", "1/", fio, ou convite a engajamento
- Quando sugerir produto: mencionar naturalmente no final, nunca forçado`;

// ─── Gera post de dica de organização ────────────────────────────────────────
async function generatePostDraft(rawInput) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: TAMARA_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Escreva um post para X/Twitter no estilo TÂMARA CAVALCANTE.

Tema: "${rawInput}"

Retorne APENAS o texto do post, sem aspas, sem explicações, sem prefixos.`
      }
    ],
    max_tokens: 400,
    temperature: 0.85
  });

  const text = response.choices[0].message.content.trim();
  return text.length > 460 ? text.substring(0, 457) + '...' : text;
}

// ─── Busca nome do produto a partir do link Amazon ───────────────────────────
async function fetchProductName(amazonUrl) {
  try {
    const { data } = await axios.get(amazonUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      },
      timeout: 10000
    });

    // Tenta extrair o título do produto
    const titleMatch = data.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) {
      // Remove " - Amazon.com.br" do final
      return titleMatch[1].replace(/\s*[-|]\s*Amazon.*$/i, '').trim().substring(0, 120);
    }
    return null;
  } catch (e) {
    console.log('[openai] Não conseguiu buscar nome do produto:', e.message);
    return null;
  }
}

// ─── Gera post baseado em produto Amazon ─────────────────────────────────────
async function generatePostFromProduct(amazonUrl) {
  const productName = await fetchProductName(amazonUrl);

  const productContext = productName
    ? `Produto: "${productName}"\nLink: ${amazonUrl}`
    : `Link do produto: ${amazonUrl}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: TAMARA_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Escreva um post para X/Twitter recomendando este produto de organização de forma natural.

${productContext}

INSTRUÇÕES:
- Escreva uma dica de organização inspirada no tipo de produto
- NUNCA cite o nome da marca, nome do produto ou modelo
- NUNCA faça propaganda explícita — a dica deve parecer orgânica
- O produto aparece como solução natural da dica, não como anúncio
- NÃO coloque o link no texto — ele será adicionado automaticamente
- Máximo 400 caracteres
- Retorne APENAS o texto do post, sem aspas, sem explicações, sem prefixos      }
    ],
    max_tokens: 300,
    temperature: 0.85
  });

  const text = response.choices[0].message.content.trim();
  const postText = text.length > 400 ? text.substring(0, 397) + '...' : text;

  // Adiciona o link ao final
  return `${postText}\n\n🔗 ${amazonUrl}`;
}

// ─── Gera imagem para o post ──────────────────────────────────────────────────
async function generateImage(postText) {
  const imagePrompt = `Flat lay photo of home organization products on a white background. Clean, minimal aesthetic. Items related to: "${postText}". Style: Pinterest home organization, bright natural light, top-down view. Products like boxes, labels, organizers, containers. No people, no faces. No text overlay. Professional product photography style.`;

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

// ─── Gera reply ───────────────────────────────────────────────────────────────
const TAMARA_REPLY_PROMPT = `Você é TÂMARA CAVALCANTE. Personal Organizer especialista em mudança residencial.

REGRAS DO REPLY:
- Máximo 200 caracteres. Seja cirúrgica.
- Responda com dica prática ou correção gentil mas direta
- Tom: prestativo, prático, sem enrolação
- Máximo 1 emoji
- Zero hashtags
- Uma ou duas frases no máximo

EXEMPLOS:
Post: "Odeio dia de mudança, uma bagunça total"
Reply: "Começa pelas caixas etiquetadas por cômodo. Muda tudo."

Post: "Não sei por onde começar a organizar depois da mudança"
Reply: "Cozinha primeiro. Sempre. Com ela funcionando o resto espera."`;

async function generateReply(originalPost) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: TAMARA_REPLY_PROMPT },
      {
        role: 'user',
        content: `Post original: "${originalPost}"\n\nEscreva o reply da TÂMARA. Retorne APENAS o texto do reply, sem aspas, sem explicações.`
      }
    ],
    max_tokens: 120,
    temperature: 0.9
  });

  const text = response.choices[0].message.content.trim();
  return text.length > 200 ? text.substring(0, 197) + '...' : text;
}

module.exports = { generatePostDraft, generatePostFromProduct, generateImage, generateReply };
