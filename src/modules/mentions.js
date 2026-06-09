const { getMentionsList, postTweet } = require('./twitter');
const { classifyMention, generateMentionResponse } = require('./openai');
const { isMentionResponded, markMentionResponded, getLastMentionId, setLastMentionId, saveDraft } = require('./db');
const { enviarMentaoParaAprovacao, notificarTelegram } = require('./telegram');
const { v4: uuidv4 } = require('uuid');

async function processarMencoes() {
  console.log('[MENTIONS] Iniciando verificação de menções...');
  try {
    const lastId = getLastMentionId();
    const mencoes = await getMentionsList(lastId);
    
    if (!mencoes || mencoes.length === 0) {
      console.log('[MENTIONS] Nenhuma nova menção encontrada.');
      return;
    }

    console.log(`[MENTIONS] Encontradas ${mencoes.length} novas menções.`);

    // Process from oldest to newest to maintain timeline sequence
    const ordenadas = [...mencoes].reverse();

    for (const mencao of ordenadas) {
      const { id, text, authorUsername } = mencao;
      
      // Update last processed ID
      setLastMentionId(id);

      if (isMentionResponded(id)) {
        console.log(`[MENTIONS] Menção ${id} de @${authorUsername} já foi processada. Puxando próximo.`);
        continue;
      }

      console.log(`[MENTIONS] Processando menção ${id} de @${authorUsername}: "${text}"`);

      // Classificar
      const classif = await classifyMention(text);
      const { categoria, justificativa } = classif;
      console.log(`[MENTIONS] Classificação para ${id}: Categoria = ${categoria} | Justificativa: ${justificativa}`);

      if (categoria === 'spam') {
        console.log(`[MENTIONS] Menção ${id} ignorada como SPAM.`);
        markMentionResponded(id);
        continue;
      }

      // Gerar sugestão de resposta
      const respostaSugerida = await generateMentionResponse(text);

      if (categoria === 'pergunta_segura' || categoria === 'elogio') {
        // Responder automaticamente
        console.log(`[MENTIONS] Auto-resposta segura aprovada para ${id}. Postando...`);
        try {
          const result = await postTweet(respostaSugerida, null, id);
          markMentionResponded(id);
          console.log(`[MENTIONS] Resposta postada com sucesso: ${result.tweetId}`);
          await notificarTelegram(
            `🤖 *Resposta automática enviada no X!*\n\n` +
            `*De:* @${authorUsername}\n` +
            `*Tweet:* "${text}"\n\n` +
            `*Resposta:* "${respostaSugerida}"\n\n` +
            `https://x.com/i/web/status/${result.tweetId}`
          );
        } catch (postErr) {
          console.error(`[MENTIONS] Erro ao postar resposta automática para ${id}:`, postErr.message);
          await notificarTelegram(`❌ *Erro ao postar resposta automática no X:* ${postErr.message}`);
        }
      } else {
        // Enviar para aprovação no Telegram
        console.log(`[MENTIONS] Enviando menção ${id} (${categoria}) para aprovação no Telegram.`);
        const draftId = uuidv4();
        saveDraft({
          id: draftId,
          type: 'mention_reply',
          mentionId: id,
          mentionAuthor: authorUsername,
          mentionText: text,
          text: respostaSugerida,
          categoria,
          justificativa
        });

        await enviarMentaoParaAprovacao(draftId, text, authorUsername, respostaSugerida, categoria, justificativa);
      }
    }
  } catch (err) {
    console.error('[MENTIONS] Erro no fluxo de menções:', err);
  }
}

module.exports = { processarMencoes };
