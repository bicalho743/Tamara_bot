const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const { generatePostDraft, generatePostFromProduct, generateImage, generateReply } = require('./openai');
const { saveDraft, getDraft, setSession, getSession, clearSession, markPosted } = require('./db');
const { postTweet } = require('./twitter');

let bot;
const ALLOWED_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ─── Notificação simples ──────────────────────────────────────────────────────
async function notificarTelegram(mensagem) {
  if (!bot || !ALLOWED_CHAT_ID) return;
  try {
    await bot.sendMessage(ALLOWED_CHAT_ID, mensagem, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error('[Telegram] Erro ao notificar:', e.message);
  }
}

// ─── Envia post agendado para aprovação ──────────────────────────────────────
async function enviarParaAprovacao(id, texto, janela) {
  if (!bot || !ALLOWED_CHAT_ID) return;
  try {
    await bot.sendMessage(
      ALLOWED_CHAT_ID,
      `🕐 *POST AGENDADO — ${janela}*\n\n${texto}\n\n_(${texto.length} chars)_\n\n⏱ _Posta automaticamente em 30 min se não responder._`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Aprovar e Postar agora', callback_data: `sched_approve:${id}` },
              { text: '❌ Descartar', callback_data: `sched_discard:${id}` }
            ]
          ]
        }
      }
    );
  } catch (e) {
    console.error('[Telegram] Erro ao enviar aprovação:', e.message);
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

function isAmazonLink(text) {
  return /https?:\/\/(amzn\.to|www\.amazon\.com\.br|amazon\.com\.br)/i.test(text);
}

function extractAmazonLink(text) {
  const match = text.match(/https?:\/\/(amzn\.to|www\.amazon\.com\.br|amazon\.com\.br)[^\s]*/i);
  return match ? match[0] : null;
}

// ─── Handler principal ────────────────────────────────────────────────────────
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  if (!isAuthorized(chatId)) return;

  const text = (msg.text || '').trim();
  if (!text) return;

  if (text === '/start') return sendHelp(chatId);
  if (text === '/status') return sendStatus(chatId);

  const session = getSession(chatId);
  if (session?.state === 'editing') {
    return handleEdit(chatId, text, session.currentDraftId);
  }

  if (isAmazonLink(text)) {
    const link = extractAmazonLink(text);
    return handleAmazonLink(chatId, link);
  }

  if (text.toUpperCase().startsWith('REPLY:')) {
    const originalPost = text.slice(6).trim();
    if (!originalPost) return bot.sendMessage(chatId, 'Envie o post original após "REPLY:".');
    return handleReplyMode(chatId, originalPost);
  }

  // Tema livre
  setSession(chatId, { state: 'generating', rawInput: text });
  await bot.sendMessage(chatId, '⏳ Gerando post da Tâmara...');

  try {
    const draft = await generatePostDraft(text);
    const id = uuidv4();
    saveDraft({ id, rawInput: text, text: draft, imageUrl: null });
    setSession(chatId, { state: 'awaiting_action', currentDraftId: id });

    await bot.sendMessage(chatId,
      `📝 *RASCUNHO TÂMARA:*\n\n${draft}\n\n_(${draft.length} chars)_`,
      { parse_mode: 'Markdown', reply_markup: buildKeyboard(id, false) }
    );
  } catch (err) {
    console.error('[handleMessage] Erro:', err.message);
    await bot.sendMessage(chatId, `❌ Erro: ${err.message}`);
    clearSession(chatId);
  }
}

// ─── Link Amazon ──────────────────────────────────────────────────────────────
async function handleAmazonLink(chatId, link) {
  await bot.sendMessage(chatId, '🔍 Link Amazon detectado! Gerando post...');

  try {
    const draft = await generatePostFromProduct(link);
    const id = uuidv4();
    saveDraft({ id, rawInput: link, text: draft, imageUrl: null, tipo: 'produto' });
    setSession(chatId, { state: 'awaiting_action', currentDraftId: id });

    await bot.sendMessage(chatId,
      `📦 *POST DE PRODUTO:*\n\n${draft}\n\n_(${draft.length} chars)_`,
      { parse_mode: 'Markdown', reply_markup: buildKeyboard(id, false) }
    );
  } catch (err) {
    console.error('[handleAmazonLink] Erro:', err.message);
    await bot.sendMessage(chatId, `❌ Erro: ${err.message}`);
    clearSession(chatId);
  }
}

// ─── Callbacks ────────────────────────────────────────────────────────────────
async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id;
  if (!isAuthorized(chatId)) return;

  const data = query.data;
  await bot.answerCallbackQuery(query.id);

  // Aprovação de post agendado
  if (data.startsWith('sched_approve:')) {
    const id = data.split(':')[1];
    const { aprovarPost } = require('../index');
    try {
      const result = await aprovarPost(id);
      if (!result.ok) return bot.sendMessage(chatId, `⚠️ ${result.msg}`);
      await bot.sendMessage(chatId,
        `✅ *Publicado!*\n\nhttps://x.com/i/web/status/${result.tweetId}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      await bot.sendMessage(chatId, `❌ Erro ao publicar: ${err.message}`);
    }
    return;
  }

  if (data.startsWith('sched_discard:')) {
    const id = data.split(':')[1];
    const { descartarPost } = require('../index');
    const ok = await descartarPost(id);
    await bot.sendMessage(chatId, ok ? '🗑️ Post descartado.' : '⚠️ Post não encontrado ou já expirou.');
    return;
  }

  // Ações normais
  if (data.startsWith('post:')) {
    await handlePost(chatId, data.split(':')[1], false);
  } else if (data.startsWith('post_img:')) {
    await handlePost(chatId, data.split(':')[1], true);
  } else if (data.startsWith('img:')) {
    await handleGenerateImage(chatId, data.split(':')[1]);
  } else if (data.startsWith('ignore:')) {
    clearSession(chatId);
    await bot.sendMessage(chatId, '🗑️ Rascunho descartado.');
  } else if (data.startsWith('edit:')) {
    const id = data.split(':')[1];
    setSession(chatId, { state: 'editing', currentDraftId: id });
    await bot.sendMessage(chatId, '✏️ Envie o texto editado agora:');
  } else if (data.startsWith('copy_reply:')) {
    const draft = getDraft(data.split(':')[1]);
    if (draft) await bot.sendMessage(chatId, draft.text);
  } else if (data.startsWith('regen_reply:')) {
    const draft = getDraft(data.split(':')[1]);
    if (draft) await handleReplyMode(chatId, draft.rawInput);
  }
}

async function handleGenerateImage(chatId, draftId) {
  const draft = getDraft(draftId);
  if (!draft) return bot.sendMessage(chatId, 'Rascunho não encontrado.');
  await bot.sendMessage(chatId, '🎨 Gerando imagem...');
  try {
    const imagePath = await generateImage(draft.text);
    draft.imageUrl = imagePath;
    await bot.sendPhoto(chatId, imagePath, {
      caption: `*Imagem gerada*`,
      parse_mode: 'Markdown',
      reply_markup: buildKeyboard(draftId, true)
    });
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Erro: ${err.message}`);
  }
}

async function handlePost(chatId, draftId, withImage) {
  const draft = getDraft(draftId);
  if (!draft) return bot.sendMessage(chatId, 'Rascunho não encontrado.');
  await bot.sendMessage(chatId, '🐦 Publicando no X...');
  try {
    const result = await postTweet(draft.text, withImage ? draft.imageUrl : null);
    markPosted(draft, result.tweetId);
    clearSession(chatId);
    await bot.sendMessage(chatId,
      `✅ *Publicado!*\n\nhttps://x.com/i/web/status/${result.tweetId}`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Erro: ${err.message}`);
  }
}

async function handleEdit(chatId, newText, draftId) {
  const draft = getDraft(draftId);
  if (!draft) return bot.sendMessage(chatId, 'Rascunho não encontrado.');
  draft.text = newText;
  setSession(chatId, { state: 'awaiting_action', currentDraftId: draftId });
  await bot.sendMessage(chatId,
    `✏️ *EDITADO:*\n\n${newText}\n\n_(${newText.length} chars)_`,
    { parse_mode: 'Markdown', reply_markup: buildKeyboard(draftId, !!draft.imageUrl) }
  );
}

async function handleReplyMode(chatId, originalPost) {
  setSession(chatId, { state: 'generating_reply', originalPost });
  await bot.sendMessage(chatId, '⏳ Gerando reply...');
  try {
    const replyText = await generateReply(originalPost);
    const id = uuidv4();
    saveDraft({ id, type: 'reply', rawInput: originalPost, text: replyText });
    setSession(chatId, { state: 'awaiting_reply_action', currentDraftId: id });
    await bot.sendMessage(chatId,
      `💬 *REPLY TÂMARA:*\n\n${replyText}\n\n_(${replyText.length} chars)_`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📋 Copiar', callback_data: `copy_reply:${id}` },
              { text: '🔄 Gerar outro', callback_data: `regen_reply:${id}` }
            ],
            [{ text: '❌ Ignorar', callback_data: `ignore:${id}` }]
          ]
        }
      }
    );
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Erro: ${err.message}`);
    clearSession(chatId);
  }
}

function buildKeyboard(draftId, hasImage) {
  const rows = [];
  if (!hasImage) {
    rows.push([
      { text: '✅ Postar no X', callback_data: `post:${draftId}` },
      { text: '🎨 Gerar Imagem', callback_data: `img:${draftId}` }
    ]);
  } else {
    rows.push([
      { text: '✅ Sem imagem', callback_data: `post:${draftId}` },
      { text: '🖼️ Com imagem', callback_data: `post_img:${draftId}` }
    ]);
  }
  rows.push([
    { text: '✏️ Editar', callback_data: `edit:${draftId}` },
    { text: '❌ Ignorar', callback_data: `ignore:${draftId}` }
  ]);
  return { inline_keyboard: rows };
}

async function sendHelp(chatId) {
  await bot.sendMessage(chatId,
    `📦 *TÂMARA — Agente de Conteúdo*\n\n` +
    `Envie qualquer tema e eu gero o post.\n\n` +
    `*Link Amazon:* cole um link e eu crio um post do produto.\n\n` +
    `*Modo REPLY:* envie \`REPLY: <texto>\` para gerar um reply.\n\n` +
    `/status — situação atual\n` +
    `/start — esta mensagem`,
    { parse_mode: 'Markdown' }
  );
}

async function sendStatus(chatId) {
  const session = getSession(chatId);
  const state = session ? session.state : 'idle';
  await bot.sendMessage(chatId, `Estado: \`${state}\``, { parse_mode: 'Markdown' });
}

module.exports = { startBot, notificarTelegram, enviarParaAprovacao };
