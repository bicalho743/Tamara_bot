require('dotenv').config();
const express = require('express');
const { startBot } = require('./modules/telegram');
const { initDB } = require('./modules/db');

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', agent: 'LUCAS', ts: new Date().toISOString() }));

async function main() {
  await initDB();
  startBot();

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`[LUCAS] Servidor HTTP ativo na porta ${port}`);
    console.log(`[LUCAS] Bot do Telegram iniciado via polling`);
  });
}

main().catch(err => {
  console.error('[LUCAS] Falha crítica na inicialização:', err.message);
  process.exit(1);
});
