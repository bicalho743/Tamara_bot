require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { startBot, notificarTelegram } = require('./modules/telegram');
const { initDB } = require('./modules/db');
const { generatePostDraft, generatePostFromProduct } = require('./modules/openai');
const { postTweet } = require('./modules/twitter');

const app = express();
app.use(express.json());

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', agent: 'TAMARA', ts: new Date().toISOString() })
);

// ─── TEMAS DE ORGANIZAÇÃO (posts sem produto) ────────────────────────────────
const TEMAS_ORGANIZACAO = [
  'como organizar a mudança com 3 dias de antecedência',
  'quais itens embalar primeiro numa mudança',
  'como etiquetar caixas de mudança corretamente',
  'erros mais comuns no dia da mudança',
  'como montar a cozinha do zero no lugar novo',
  'organização de armário de roupas após mudança',
  'como organizar documentos antes de mudar',
  'dicas para mudança com crianças pequenas',
  'como descartar o que não precisa antes de mudar',
  'checklist completo pré-mudança',
  'como organizar banheiro novo em menos de 1 hora',
  'primeiro dia no apartamento novo por onde começar',
  'como proteger móveis durante a mudança',
  'organização de cozinha pequena após mudança',
  'como manter a rotina durante o período de mudança'
];

// ─── LINKS DE PRODUTOS AMAZON ────────────────────────────────────────────────
let PRODUTOS_AMAZON = [
  'https://amzn.to/4dEfbuU',
  'https://amzn.to/4vs7P3P',
  'https://amzn.to/4fStSMb',
  'https://amzn.to/4uM2y7d',
  'https://amzn.to/3PATUsZ',
  'https://amzn.to/4eekxNA',
  'https://amzn.to/4x3pTCE',
  'https://amzn.to/3RxbfUh',
  'https://amzn.to/4o6VdwA',
  'https://amzn.to/43MtqI5',
  'https://amzn.to/4u8VY9K',
  'https://amzn.to/4dXww0C',
  'https://amzn.to/4u7jrrC',
  'https://amzn.to/4fevsb7',
  'https://amzn.to/434c49w',
  'https://amzn.to/4vkoUfN',
  'https://amzn.to/4uI5mlw'
];

let produtoIndex = 0;
let temaIndex = 0;

// ─── POST AUTOMÁTICO ─────────────────────────────────────────────────────────
async function postAutomatico(horario, tipo) {
  console.log(`[SCHEDULER] ${horario} — tipo: ${tipo}`);

  try {
    let texto;

    if (tipo === 'produto') {
      if (PRODUTOS_AMAZON.length === 0) {
        console.log('[SCHEDULER] Sem produtos cadastrados — gerando dica no lugar');
        const tema = TEMAS_ORGANIZACAO[temaIndex % TEMAS_ORGANIZACAO.length];
        temaIndex++;
        texto = await generatePostDraft(tema);
      } else {
        const produto = PRODUTOS_AMAZON[produtoIndex % PRODUTOS_AMAZON.length];
        produtoIndex++;
        console.log(`[SCHEDULER] Produto: ${produto}`);
        texto = await generatePostFromProduct(produto);

        // Avisa quando a lista acabar
        if (produtoIndex >= PRODUTOS_AMAZON.length) {
          await notificarTelegram(
            '⚠️ *Tâmara Bot:* Lista de produtos Amazon acabou!\n\nMande novos links para continuar postando produtos.'
          );
          produtoIndex = 0;
        }
      }
    } else {
      const tema = TEMAS_ORGANIZACAO[temaIndex % TEMAS_ORGANIZACAO.length];
      temaIndex++;
      texto = await generatePostDraft(tema);
    }

    console.log(`[SCHEDULER] Post gerado (${texto.length} chars):\n${texto}`);
    const result = await postTweet(texto);
    console.log(`[SCHEDULER] Publicado: https://x.com/i/web/status/${result.tweetId}`);

    await notificarTelegram(
      `✅ *Post automático publicado:*\n\n${texto}\n\nhttps://x.com/i/web/status/${result.tweetId}`
    );
  } catch (err) {
    console.error(`[SCHEDULER] Erro no post das ${horario}:`, err.message);
    await notificarTelegram(`❌ *Erro no post das ${horario}:* ${err.message}`);
  }
}

function iniciarAgendador() {
  // 8h e 18h → dica de organização (sem produto)
  cron.schedule('0 8 * * *',  () => postAutomatico('08:00', 'dica'),    { timezone: 'America/Sao_Paulo' });
  cron.schedule('0 18 * * *', () => postAutomatico('18:00', 'dica'),    { timezone: 'America/Sao_Paulo' });
  // 12h e 21h → produto Amazon
  cron.schedule('0 12 * * *', () => postAutomatico('12:00', 'produto'), { timezone: 'America/Sao_Paulo' });
  cron.schedule('0 21 * * *', () => postAutomatico('21:00', 'produto'), { timezone: 'America/Sao_Paulo' });

  console.log('[SCHEDULER] Agendador ativo — posts às 8h, 12h, 18h e 21h (Brasília)');
}

// ─── FUNÇÕES EXPORTADAS PARA O TELEGRAM.JS ───────────────────────────────────
function adicionarProduto(link) {
  PRODUTOS_AMAZON.push(link);
  console.log(`[PRODUTOS] Link adicionado: ${link} (total: ${PRODUTOS_AMAZON.length})`);
}

function listarProdutos() {
  return PRODUTOS_AMAZON;
}

async function main() {
  await initDB();
  await startBot();
  iniciarAgendador();

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`[TAMARA] Servidor HTTP ativo na porta ${port}`);
  });
}

main().catch(err => {
  console.error('[TAMARA] Falha crítica:', err.message);
  process.exit(1);
});

module.exports = { adicionarProduto, listarProdutos };
