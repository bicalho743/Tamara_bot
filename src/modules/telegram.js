const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const { generatePostDraft, generateImage } = require('./openai');
const { saveDraft, getDraft, setSession, getSession, clearSession, markPosted } = require('./db');
const { postTweet } = require('./twitter');

let bot;

const ALLOWED_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function startBot() {
  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

  bot.on('message', handleMessage);
  bot.on('callback_query', handleCallbackQuery);
  bot.on('polling_error', err => console.error('[Telegram] Polling error:', err.message));

  console.log('[Telegram] Listeners registrados');
}

function isAuthorized(chatId) {
  return String(chatId) === String(ALLOWED_CHAT_ID);
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  if (!isAuthorized(chatId)) return;

  const text = (msg.text || '').trim();
  if (!text || text.startsWith('/')) {
    if (text === '/start') return sendHelp(chatId);
    if (text === '/status') return sendStatus(chatId);
    return;
  }

  setSession(chatId, { state: 'generating', rawInput: text });

  await bot.sendMessage(chatId, 'Processando. Aguarde...');

  try {
    const draft = await generatePostDraft(text);
    const id = uuidv4();

    saveDraft({ id, rawInput: text, text: draft, imageUrl: null });
    setSession(chatId, { state: 'awaiting_action', currentDraftId: id });

    await bot.sendMessage(chatId, `*RASCUNHO LUCAS:*\n\n${draft}\n\n_(${draft.length}/280 chars)_`, {
      parse_mode: 'Markdown',
      reply_markup: buildKeyboard(id, false)
    });
  } catch (err) {
    console.error('[handleMessage] Erro na geração:', err.message);
    await bot.sendMessage(chatId, `Erro na geração: ${err.message}`);
    clearSession(chatId);
  }
}

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
    const id = data.split(':')[1];
    clearSession(chatId);
    await bot.sendMessage(chatId, 'Rascunho descartado.');
  } else if (data.startsWith('edit:')) {
    const id = data.split(':')[1];
    setSession(chatId, { state: 'editing', currentDraftId: id });
    await bot.sendMessage(chatId, 'Envie o texto editado agora:');
  }
}

async function handleGenerateImage(chatId, draftId) {
  const draft = getDraft(draftId);
  if (!draft) return bot.sendMessage(chatId, 'Rascunho não encontrado.');

  await bot.sendMessage(chatId, 'Gerando imagem. Isso pode levar até 30 segundos...');

  try {
    const imageUrl = await generateImage(draft.text);
    draft.imageUrl = imageUrl;

    await bot.sendPhoto(chatId, imageUrl, {
      caption: `*Imagem gerada para:*\n\n${draft.text}`,
      parse_mode: 'Markdown',
      reply_markup: buildKeyboard(draftId, true)
    });
  } catch (err) {
    console.error('[handleGenerateImage] Erro:', err.message);
    await bot.sendMessage(chatId, `Erro ao gerar imagem: ${err.message}`);
  }
}

async function handlePost(chatId, draftId, withImage) {
  const draft = getDraft(draftId);
  if (!draft) return bot.sendMessage(chatId, 'Rascunho não encontrado.');

  await bot.sendMessage(chatId, 'Publicando no X...');

  try {
    const result = await postTweet(draft.text, withImage ? draft.imageUrl : null);
    markPosted(draft, result.tweetId);
    clearSession(chatId);

    await bot.sendMessage(
      chatId,
      `Publicado com sucesso.\n\nhttps://x.com/i/web/status/${result.tweetId}`,
      { disable_web_page_preview: false }
    );
  } catch (err) {
    console.error('[handlePost] Erro:', err.message);
    await bot.sendMessage(chatId, `Erro ao publicar: ${err.message}`);
  }
}

function buildKeyboard(draftId, hasImage) {
  const rows = [];

  if (!hasImage) {
    rows.push([
      { text: 'Postar no X', callback_data: `post:${draftId}` },
      { text: 'Gerar Imagem', callback_data: `img:${draftId}` }
    ]);
  } else {
    rows.push([
      { text: 'Postar sem imagem', callback_data: `post:${draftId}` },
      { text: 'Postar com imagem', callback_data: `post_img:${draftId}` }
    ]);
  }

  rows.push([
    { text: 'Editar', callback_data: `edit:${draftId}` },
    { text: 'Ignorar', callback_data: `ignore:${draftId}` }
  ]);

  return { inline_keyboard: rows };
}

async function sendHelp(chatId) {
  await bot.sendMessage(
    chatId,
    '*LUCAS — Agente de Conteúdo*\n\nEnvie qualquer tema ou ideia bruta. Eu gero o tweet.\n\n`/status` — situação atual\n`/start` — esta mensagem',
    { parse_mode: 'Markdown' }
  );
}

async function sendStatus(chatId) {
  const session = getSession(chatId);
  const state = session ? session.state : 'idle';
  await bot.sendMessage(chatId, `Estado atual: \`${state}\``, { parse_mode: 'Markdown' });
}

module.exports = { startBot };
