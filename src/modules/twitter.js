const { TwitterApi } = require('twitter-api-v2');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

function getClient() {
  const appKey    = (process.env.TWITTER_API_KEY       || '').trim();
  const appSecret = (process.env.TWITTER_API_SECRET    || '').trim();
  const accessToken  = (process.env.TWITTER_ACCESS_TOKEN  || '').trim();
  const accessSecret = (process.env.TWITTER_ACCESS_SECRET || '').trim();

  console.log('[Twitter] OAuth 1.0a key check:');
  console.log('  TWITTER_API_KEY        :', appKey.substring(0, 4)       || '(vazio)');
  console.log('  TWITTER_API_SECRET     :', appSecret.substring(0, 4)    || '(vazio)');
  console.log('  TWITTER_ACCESS_TOKEN   :', accessToken.substring(0, 4)  || '(vazio)');
  console.log('  TWITTER_ACCESS_SECRET  :', accessSecret.substring(0, 4) || '(vazio)');

  return new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
}

async function downloadImage(url) {
  const tmpPath = path.join(os.tmpdir(), `lucas_img_${Date.now()}.png`);
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  fs.writeFileSync(tmpPath, response.data);
  return tmpPath;
}

async function postTweet(text, imageUrl = null) {
  const client = getClient();
  let tmpPath = null;

  try {
    if (imageUrl) {
      tmpPath = await downloadImage(imageUrl);
      const mediaId = await client.v1.uploadMedia(tmpPath, { mimeType: 'image/png' });
      const { data } = await client.v2.tweet({ text, media: { media_ids: [mediaId] } });
      return { tweetId: data.id, text };
    }

    const { data } = await client.v2.tweet(text);
    return { tweetId: data.id, text };
  } finally {
    if (tmpPath) {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  }
}

module.exports = { postTweet };
