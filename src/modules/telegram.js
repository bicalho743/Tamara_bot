const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const { generatePostDraft, generatePostFromProduct, generateImage, generateReply } = require('./openai');
const { saveDraft, getDraft, setSession, getSession, clearSession, markPosted } = require('./db');
const { postTweet } = require('./twitter');

let bot;
let botChatId;

const ALLOWED_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ─── Notificação simples (usada pelo scheduler) ───────────────────────────────
async function notificarTelegram(mensagem) {
  if (!bot || !ALLOWED_CHAT_ID) return;
  try {
    await bot.sendMessage(ALLOWED_CHAT_ID, mensagem, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error('[Telegram] Erro ao notificar:', e.message);
  }
}

async function startBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  try {
    await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=-1&timeout=0`);
    console.log('[Telegram] Sessão anterior encerrada');
  } catch (e) {
    console.log('[Telegram] Nenhuma sessão anterior encontrada');
  }

  bot = new TelegramBot(token, {
    polling: {
      interval: 5000,
      autoStart: true,
      params: { timeout: 10, allowed_updates: ['message', 'callback_query'] }
    }
  });

  bot.on('message', handleMessage);
  bot.on('callback_query', handleCallbackQuery);
  bot.on('polling_error', (err) => {
    console.error('[Telegram] Polling error:', err.message);
  });

  console.log('[Telegram] Listeners registrados');
}

function isAuthorized(chatId) {
  return String(chatId) === String(ALLOWED_CHAT_ID);
}

// ─── Detecta se é link Amazon ─────────────────────────────────────────────────
function isAmazonLink(text) {
  return /https?:\/\/(amzn\.to|www\.amazon\.com\.br|amazon\.com\.br)/i.test(text);
}

function extractAmazonLink(text) {
  const match = text.match(/https?:\/\/(amzn\.to|www\.amazon\.com\.br|amazon\.com\.br)[^\s]*/i);
  return match ? match[0] : null;
}
// ─── Handler principal de mensagens ──────────────────────────────────────────
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  if (!isAuthorized(chatId)) return;

  const text = (msg.text || '').trim();
  if (!text) return;

  // Comandos
  if (text === '/start') return sendHelp(chatId);
  if (text === '/status') return sendStatus(chatId);
  if (text === '/produtos') return sendProdutos(chatId);

  // Verifica se está em modo edição
  const session = getSession(chatId);
  if (session?.state === 'editing') {
    return handleEdit(chatId, text, session.currentDraftId);
  }

  // ─── LINK AMAZON detectado ───────────────────────────────────────────────
  if (isAmazonLink(text)) {
    const link = extractAmazonLink(text);
    return handleAmazonLink(chatId, link);
  }
  // Modo REPLY
  if (text.toUpperCase().startsWith('REPLY:')) {
    const originalPost = text.slice(6).trim();
    if (!originalPost) return bot.sendMessage(chatId, 'Envie o post original após "REPLY:".');
    return handleReplyMode(chatId, originalPost);
  }

  // Tema livre → gera post da Tâmara
  setSession(chatId, { state: 'generating', rawInput: text });
  await bot.sendMessage(chatId, '⏳ Gerando post da Tâmara...');

  try {
    const draft = await generatePostDraft(text);
    const id = uuidv4();
    saveDraft({ id, rawInput: text, text: draft, imageUrl: null });
    setSession(chatId, { state: 'awaiting_action', currentDraftId: id });

    await bot.sendMessage(chatId,
      `📝 *RASCUNHO TÂMARA:*\n\n${draft}\n\n_(${draft.length}/500 chars)_`,
      { parse_mode: 'Markdown', reply_markup: buildKeyboard(id, false) }
    );
  } catch (err) {
    console.error('[handleMessage] Erro:', err.message);
    await bot.sendMessage(chatId, `❌ Erro: ${err.message}`);
    clearSession(chatId);
  }
}

// ─── Fluxo de link Amazon ─────────────────────────────────────────────────────
async function handleAmazonLink(chatId, link) {
  await bot.sendMessage(chatId, '🔍 Link Amazon detectado! Gerando post do produto...');

  try {
    const draft = await generatePostFromProduct(link);
    const id = uuidv4();
    saveDraft({ id, rawInput: link, text: draft, imageUrl: null, tipo: 'produto' });
    setSession(chatId, { state: 'awaiting_action', currentDraftId: id });

    await bot.sendMessage(chatId,
      `📦 *POST DE PRODUTO — TÂMARA:*\n\n${draft}\n\n_(${draft.length} chars)_`,
      { parse_mode: 'Markdown', reply_markup: buildKeyboard(id, false) }
    );
  } catch (err) {
    console.error('[handleAmazonLink] Erro:', err.message);
    await bot.sendMessage(chatId, `❌ Erro ao processar link: ${err.message}`);
    clearSession(chatId);
  }
}

// ─── Callbacks dos botões ─────────────────────────────────────────────────────
async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id;
  if (!isAuthorized(chatId)) return;

  const data = query.data;
  await bot.answerCallbackQuery(query.id);

  if (data.startsWith('post:')) {
    const id = data.split(':')[1];
    await handlePost(chatId, id, false);
  } else if (data.startsWith('post_img:')) {
    const id = data.split(':')[1];
    await handlePost(chatId, id, true);
  } else if (data.startsWith('img:')) {
    const id = data.split(':')[1];
    await handleGenerateImage(chatId, id);
  } else if (data.startsWith('ignore:')) {
    clearSession(chatId);
    await bot.sendMessage(chatId, '🗑️ Rascunho descartado.');
  } else if (data.startsWith('edit:')) {
    const id = data.split(':')[1];
    setSession(chatId, { state: 'editing', currentDraftId: id });
    await bot.sendMessage(chatId, '✏️ Envie o texto editado agora:');
  } else if (data.startsWith('copy_reply:')) {
    const id = data.split(':')[1];
    const draft = getDraft(id);
    if (!draft) return bot.sendMessage(chatId, 'Reply não encontrado.');
    await bot.sendMessage(chatId, draft.text);
  } else if (data.startsWith('regen_reply:')) {
    const id = data.split(':')[1];
    const draft = getDraft(id);
    if (!draft) return bot.sendMessage(chatId, 'Draft não encontrado.');
    await handleReplyMode(chatId, draft.rawInput);
  }
}

// ─── Gerar imagem ─────────────────────────────────────────────────────────────
async function handleGenerateImage(chatId, draftId) {
  const draft = getDraft(draftId);
  if (!draft) return bot.sendMessage(chatId, 'Rascunho não encontrado.');

  await bot.sendMessage(chatId, '🎨 Gerando imagem. Pode levar até 30 segundos...');

  try {
    const imagePath = await generateImage(draft.text);
    draft.imageUrl = imagePath;

    await bot.sendPhoto(chatId, imagePath, {
      caption: `*Imagem gerada para:*\n\n${draft.text}`,
      parse_mode: 'Markdown',
      reply_markup: buildKeyboard(draftId, true)
    });
  } catch (err) {
    console.error('[handleGenerateImage] Erro:', err.message);
    await bot.sendMessage(chatId, `❌ Erro ao gerar imagem: ${err.message}`);
  }
}

// ─── Publicar no X ────────────────────────────────────────────────────────────
async function handlePost(chatId, draftId, withImage) {
  const draft = getDraft(draftId);
  if (!draft) return bot.sendMessage(chatId, 'Rascunho não encontrado.');

  await bot.sendMessage(chatId, '🐦 Publicando no X...');

  try {
    const result = await postTweet(draft.text, withImage ? draft.imageUrl : null);
    markPosted(draft, result.tweetId);
    clearSession(chatId);

    await bot.sendMessage(chatId,
      `✅ *Publicado com sucesso!*\n\nhttps://x.com/i/web/status/${result.tweetId}`,
      { parse_mode: 'Markdown', disable_web_page_preview: false }
    );
  } catch (err) {
    console.error('[handlePost] Erro:', err.message);
    await bot.sendMessage(chatId, `❌ Erro ao publicar: ${err.message}`);
  }
}

// ─── Editar rascunho ──────────────────────────────────────────────────────────
async function handleEdit(chatId, newText, draftId) {
  const draft = getDraft(draftId);
  if (!draft) return bot.sendMessage(chatId, 'Rascunho não encontrado.');

  draft.text = newText;
  setSession(chatId, { state: 'awaiting_action', currentDraftId: draftId });

  await bot.sendMessage(chatId,
    `✏️ *RASCUNHO EDITADO:*\n\n${newText}\n\n_(${newText.length}/500 chars)_`,
    { parse_mode: 'Markdown', reply_markup: buildKeyboard(draftId, !!draft.imageUrl) }
  );
}

// ─── Modo Reply ───────────────────────────────────────────────────────────────
async function handleReplyMode(chatId, originalPost) {
  setSession(chatId, { state: 'generating_reply', originalPost });
  await bot.sendMessage(chatId, '⏳ Gerando reply...');

  try {
    const replyText = await generateReply(originalPost);
    const id = uuidv4();
    saveDraft({ id, type: 'reply', rawInput: originalPost, text: replyText });
    setSession(chatId, { state: 'awaiting_reply_action', currentDraftId: id });

    await bot.sendMessage(chatId,
      `💬 *REPLY TÂMARA:*\n\n${replyText}\n\n_(${replyText.length}/200 chars)_`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📋 Copiar Reply', callback_data: `copy_reply:${id}` },
              { text: '🔄 Gerar Outro', callback_data: `regen_reply:${id}` }
            ],
            [{ text: '❌ Ignorar', callback_data: `ignore:${id}` }]
          ]
        }
      }
    );
  } catch (err) {
    console.error('[handleReplyMode] Erro:', err.message);
    await bot.sendMessage(chatId, `❌ Erro ao gerar reply: ${err.message}`);
    clearSession(chatId);
  }
}

// ─── Teclado de ações ─────────────────────────────────────────────────────────
function buildKeyboard(draftId, hasImage) {
  const rows = [];

  if (!hasImage) {
    rows.push([
      { text: '✅ Postar no X', callback_data: `post:${draftId}` },
      { text: '🎨 Gerar Imagem', callback_data: `img:${draftId}` }
    ]);
  } else {
    rows.push([
      { text: '✅ Postar sem imagem', callback_data: `post:${draftId}` },
      { text: '🖼️ Postar com imagem', callback_data: `post_img:${draftId}` }
    ]);
  }

  rows.push([
    { text: '✏️ Editar', callback_data: `edit:${draftId}` },
    { text: '❌ Ignorar', callback_data: `ignore:${draftId}` }
  ]);

  return { inline_keyboard: rows };
}

// ─── Mensagens de sistema ─────────────────────────────────────────────────────
async function sendHelp(chatId) {
  await bot.sendMessage(chatId,
    `📦 *TÂMARA — Agente de Conteúdo*\n\n` +
    `Envie qualquer tema e eu gero o post.\n\n` +
    `*Link Amazon:* cole um link e eu crio um post do produto.\n\n` +
    `*Modo REPLY:* envie \`REPLY: <texto do post>\` para gerar um reply.\n\n` +
    `/produtos — ver lista de produtos cadastrados\n` +
    `/status — situação atual\n` +
    `/start — esta mensagem`,
    { parse_mode: 'Markdown' }
  );
}

async function sendStatus(chatId) {
  const session = getSession(chatId);
  const state = session ? session.state : 'idle';
  await bot.sendMessage(chatId, `Estado atual: \`${state}\``, { parse_mode: 'Markdown' });
}

async function sendProdutos(chatId) {
  try {
    const { listarProdutos } = require('../index');
    const produtos = listarProdutos();
    if (produtos.length === 0) {
      return bot.sendMessage(chatId, '📭 Nenhum produto cadastrado ainda.');
    }
    const lista = produtos.map((p, i) => `${i + 1}. ${p}`).join('\n');
    await bot.sendMessage(chatId,
      `📦 *Produtos cadastrados (${produtos.length}):*\n\n${lista}`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    await bot.sendMessage(chatId, '⚠️ Erro ao listar produtos.');
  }
}

module.exports = { startBot, notificarTelegram };
