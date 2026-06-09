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

async function postTweet(text, imageUrl = null, replyToTweetId = null) {
  const client = getClient();
  let tmpPath = null;

  try {
    const tweetPayload = { text };
    if (replyToTweetId) {
      tweetPayload.reply = { in_reply_to_tweet_id: replyToTweetId };
    }

    if (imageUrl) {
      tmpPath = fs.existsSync(imageUrl) ? imageUrl : await downloadImage(imageUrl);
      const mediaId = await client.v1.uploadMedia(tmpPath, { mimeType: 'image/png' });
      tweetPayload.media = { media_ids: [mediaId] };
    }

    const { data } = await client.v2.tweet(tweetPayload);
    return { tweetId: data.id, text };
  } finally {
    if (tmpPath) {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  }
}

let cachedUserId = null;

async function getBotUserId() {
  if (cachedUserId) return cachedUserId;
  const client = getClient();
  try {
    const me = await client.v2.me();
    if (me && me.data && me.data.id) {
      cachedUserId = me.data.id;
      return cachedUserId;
    }
  } catch (err) {
    console.warn('[Twitter] client.v2.me() falhou, tentando busca por username:', err.message);
  }
  
  try {
    const user = await client.v2.userByUsername('tamaraorganiza');
    if (user && user.data && user.data.id) {
      cachedUserId = user.data.id;
      return cachedUserId;
    }
  } catch (err) {
    console.error('[Twitter] Falha ao obter ID do usuário:', err.message);
    throw err;
  }
}

async function getMentionsList(sinceId = null) {
  const client = getClient();
  try {
    const userId = await getBotUserId();
    const options = {
      max_results: 10,
      expansions: ['author_id', 'referenced_tweets.id'],
      'tweet.fields': ['text', 'created_at', 'conversation_id', 'author_id'],
      'user.fields': ['username', 'name']
    };
    if (sinceId) {
      options.since_id = sinceId;
    }
    
    console.log(`[Twitter] Buscando menções a partir de ID: ${sinceId || 'nenhum'} para usuário ${userId}`);
    const response = await client.v2.userMentionTimeline(userId, options);
    
    if (!response || !response.data) return [];
    
    const tweets = response.data.data || [];
    const users = response.data.includes?.users || [];
    const userMap = new Map(users.map(u => [u.id, u]));
    
    return tweets.map(tweet => {
      const author = userMap.get(tweet.author_id);
      return {
        id: tweet.id,
        text: tweet.text,
        authorId: tweet.author_id,
        authorUsername: author ? author.username : null,
        authorName: author ? author.name : null,
        createdAt: tweet.created_at
      };
    });
  } catch (err) {
    console.error('[Twitter] Erro ao obter lista de menções:', err.message);
    return [];
  }
}

module.exports = { postTweet, getMentionsList };
