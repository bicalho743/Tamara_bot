require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { startBot, notificarTelegram, enviarParaAprovacao } = require('./modules/telegram');
const { initDB } = require('./modules/db');
const { generatePostDraft } = require('./modules/openai');
const { postTweet } = require('./modules/twitter');
const { processarMencoes } = require('./modules/mentions');

const app = express();
app.use(express.json());

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', agent: 'TAMARA', ts: new Date().toISOString() })
);

// ─── TEMAS PREMIUM ────────────────────────────────────────────────────────────
const TEMAS = [
  'casa bonita que não funciona na rotina diária',
  'organização invisível — quando tudo tem lugar certo',
  'mudança sem estresse — decisões antes do caminhão chegar',
  'closet funcional que facilita a rotina da manhã',
  'cozinha que trabalha por você, não contra você',
  'casa nova — por onde começar com clareza',
  'rotina doméstica leve e sem esforço',
  'luxo silencioso — a casa que não precisa de esforço para funcionar',
  'organização de guarda-roupa sem perder o que tem',
  'mudança — o que decidir semanas antes do dia D',
  'despensa organizada que facilita o dia a dia',
  'home office funcional dentro de casa',
  'organização pós-mudança — prioridades da primeira semana',
  'a diferença entre casa arrumada e casa organizada',
  'por que reorganizar o mesmo espaço várias vezes',
  'cômodo que mais impacta a rotina diária',
  'organização de banheiro em casa de alto padrão',
  'como a desorganização consome tempo invisível todo dia',
  'mudança com filhos — o que organizar primeiro',
  'sala de estar funcional sem perder a estética'
];

let temaIndex = 0;

// ─── APROVAÇÕES PENDENTES ─────────────────────────────────────────────────────
const aprovacoesPendentes = new Map();

// ─── GERA HORÁRIO ALEATÓRIO DENTRO DE UMA JANELA ─────────────────────────────
function randomMinutes(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── FLUXO COM APROVAÇÃO ──────────────────────────────────────────────────────
async function postComAprovacao(janela) {
  const tema = TEMAS[temaIndex % TEMAS.length];
  temaIndex++;

  console.log(`[SCHEDULER] Janela ${janela} — tema: "${tema}"`);

  try {
    const texto = await generatePostDraft(tema);
    const id = `sched_${Date.now()}`;

    // Salva pending com timeout de 30 min
    const timeout = setTimeout(async () => {
      if (aprovacoesPendentes.has(id)) {
        aprovacoesPendentes.delete(id);
        console.log(`[SCHEDULER] Timeout — postando automaticamente: ${id}`);
        try {
          const result = await postTweet(texto);
          await notificarTelegram(
            `⏱ *Post publicado automaticamente (30 min):*\n\n${texto}\n\nhttps://x.com/i/web/status/${result.tweetId}`
          );
        } catch (err) {
          await notificarTelegram(`❌ *Erro no post automático:* ${err.message}`);
        }
      }
    }, 30 * 60 * 1000); // 30 minutos

    aprovacoesPendentes.set(id, { texto, timeout });

    // Envia para aprovação no Telegram
    await enviarParaAprovacao(id, texto, janela);

  } catch (err) {
    console.error(`[SCHEDULER] Erro na janela ${janela}:`, err.message);
    await notificarTelegram(`❌ *Erro no agendador (${janela}):* ${err.message}`);
  }
}

// ─── EXPORTA PARA O TELEGRAM.JS USAR ─────────────────────────────────────────
async function aprovarPost(id) {
  const pending = aprovacoesPendentes.get(id);
  if (!pending) return { ok: false, msg: 'Post não encontrado ou já expirou.' };

  clearTimeout(pending.timeout);
  aprovacoesPendentes.delete(id);

  const result = await postTweet(pending.texto);
  return { ok: true, tweetId: result.tweetId, texto: pending.texto };
}

async function descartarPost(id) {
  const pending = aprovacoesPendentes.get(id);
  if (!pending) return false;
  clearTimeout(pending.timeout);
  aprovacoesPendentes.delete(id);
  return true;
}

// ─── AGENDADOR COM JANELAS ABERTAS ───────────────────────────────────────────
function iniciarAgendador() {
  // Janela 1: entre 8h e 9h
  cron.schedule('0 8 * * *', () => {
    const delay = randomMinutes(0, 59) * 60 * 1000;
    setTimeout(() => postComAprovacao('8h-9h'), delay);
  }, { timezone: 'America/Sao_Paulo' });

  // Janela 2: entre 12h e 13h
  cron.schedule('0 12 * * *', () => {
    const delay = randomMinutes(0, 59) * 60 * 1000;
    setTimeout(() => postComAprovacao('12h-13h'), delay);
  }, { timezone: 'America/Sao_Paulo' });

  // Janela 3: entre 17h e 19h
  cron.schedule('0 17 * * *', () => {
    const delay = randomMinutes(0, 119) * 60 * 1000;
    setTimeout(() => postComAprovacao('17h-19h'), delay);
  }, { timezone: 'America/Sao_Paulo' });

  // Janela 4: entre 20h e 22h
  cron.schedule('0 20 * * *', () => {
    const delay = randomMinutes(0, 119) * 60 * 1000;
    setTimeout(() => postComAprovacao('20h-22h'), delay);
  }, { timezone: 'America/Sao_Paulo' });

  // Verificação de menções a cada 5 minutos
  cron.schedule('*/5 * * * *', () => {
    processarMencoes();
  });

  console.log('[SCHEDULER] Agendador ativo — janelas: 8-9h / 12-13h / 17-19h / 20-22h (Brasília) e Monitor de menções (a cada 5 min)');
}

async function main() {
  await initDB();
  await startBot();
  iniciarAgendador();

  // Executa uma vez ao iniciar para processar menções recebidas offline
  processarMencoes();

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`[TAMARA] Servidor HTTP ativo na porta ${port}`);
  });
}

main().catch(err => {
  console.error('[TAMARA] Falha crítica:', err.message);
  process.exit(1);
});

module.exports = { aprovarPost, descartarPost };
