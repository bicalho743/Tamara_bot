require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { startBot } = require('./modules/telegram');
const { initDB } = require('./modules/db');
const { generatePostDraft } = require('./modules/openai');
const { postTweet } = require('./modules/twitter');

const app = express();
app.use(express.json());

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', agent: 'LUCAS', ts: new Date().toISOString() })
);

const TEMAS_AUTOMATICOS = [
  'juros altos no Brasil e impacto no crédito pessoal',
  'spread bancário brasileiro comparado ao mundo',
  'FGTS rendimento abaixo da inflação',
  'cartão de crédito rotativo taxa absurda',
  'concentração bancária no Brasil',
  'dívida pública brasileira e quem se beneficia',
  'custo do crédito para pequenas empresas',
  'poupança vs inflação histórico',
  'bancos públicos vs privados lucro',
  'imposto sobre investimentos no Brasil',
  'câmbio e reservas internacionais',
  'endividamento das famílias brasileiras',
  'tarifas bancárias abusivas',
  'sistema financeiro e desigualdade',
  'PIB vs salário real do trabalhador',
  'privatizações e resultado para população',
  'previdência social déficit real ou fake',
  'carga tributária brasileira vs serviços entregues',
  'lucro dos bancos em ano de crise',
  'financiamento imobiliário custo real'
];

let temaIndex = 0;

async function postAutomatico(horario) {
  const tema = TEMAS_AUTOMATICOS[temaIndex % TEMAS_AUTOMATICOS.length];
  temaIndex++;
  console.log(`[SCHEDULER] ${horario} — gerando post sobre: "${tema}"`);
  try {
    const texto = await generatePostDraft(tema);
    console.log(`[SCHEDULER] Post gerado (${texto.length} chars):\n${texto}`);
    const result = await postTweet(texto);
    console.log(`[SCHEDULER] Publicado: https://x.com/i/web/status/${result.tweetId}`);
  } catch (err) {
    console.error(`[SCHEDULER] Erro no post das ${horario}:`, err.message);
  }
}

function iniciarAgendador() {
  cron.schedule('0 8 * * *',  () => postAutomatico('08:00'), { timezone: 'America/Sao_Paulo' });
  cron.schedule('0 12 * * *', () => postAutomatico('12:00'), { timezone: 'America/Sao_Paulo' });
  cron.schedule('0 18 * * *', () => postAutomatico('18:00'), { timezone: 'America/Sao_Paulo' });
  cron.schedule('0 21 * * *', () => postAutomatico('21:00'), { timezone: 'America/Sao_Paulo' });
  console.log('[SCHEDULER] Agendador ativo — posts às 8h, 12h, 18h e 21h (Brasília)');
}

async function main() {
  await initDB();
  await startBot();
  iniciarAgendador();
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`[LUCAS] Servidor HTTP ativo na porta ${port}`);
  });
}

main().catch(err => {
  console.error('[LUCAS] Falha crítica:', err.message);
  process.exit(1);
});
