const { spawn } = require('child_process');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const os = require('os');

const PYTHON_SCRIPT = path.join(__dirname, '../../scripts/post_tweet.py');

async function postTweet(text, imageUrl = null) {
  let imagePath = null;

  if (imageUrl) {
    imagePath = await downloadImage(imageUrl);
  }

  return new Promise((resolve, reject) => {
    const args = [PYTHON_SCRIPT, text];
    if (imagePath) args.push(imagePath);

    const env = {
      ...process.env,
      TWITTER_API_KEY: process.env.TWITTER_API_KEY,
      TWITTER_API_SECRET: process.env.TWITTER_API_SECRET,
      TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN,
      TWITTER_ACCESS_SECRET: process.env.TWITTER_ACCESS_SECRET
    };

    const proc = spawn('python', args, { env });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', code => {
      if (imagePath) {
        try { fs.unlinkSync(imagePath); } catch {}
      }

      if (code !== 0) {
        return reject(new Error(`Python script falhou (código ${code}): ${stderr.trim()}`));
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (result.error) return reject(new Error(result.error));
        resolve(result);
      } catch {
        reject(new Error(`Resposta inválida do script: ${stdout.trim()}`));
      }
    });

    proc.on('error', err => reject(new Error(`Falha ao chamar Python: ${err.message}`)));
  });
}

async function downloadImage(url) {
  const tmpPath = path.join(os.tmpdir(), `lucas_img_${Date.now()}.png`);
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  fs.writeFileSync(tmpPath, response.data);
  return tmpPath;
}

module.exports = { postTweet };
