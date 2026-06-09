const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/db.json');

const DEFAULT_DB = {
  sessions: {},
  drafts: [],
  posted: [],
  respondedMentions: [],
  lastMentionId: null
};

let _db = null;

function load() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    _db = JSON.parse(raw);
  } catch {
    _db = JSON.parse(JSON.stringify(DEFAULT_DB));
    save();
  }
}

function save() {
  fs.writeFileSync(DB_PATH, JSON.stringify(_db, null, 2), 'utf-8');
}

function initDB() {
  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  load();
  console.log('[DB] Banco de dados local inicializado');
}

function getSession(chatId) {
  return _db.sessions[chatId] || null;
}

function setSession(chatId, data) {
  _db.sessions[chatId] = { ...(_db.sessions[chatId] || {}), ...data, updatedAt: new Date().toISOString() };
  save();
}

function clearSession(chatId) {
  delete _db.sessions[chatId];
  save();
}

function saveDraft(draft) {
  draft.createdAt = new Date().toISOString();
  _db.drafts.push(draft);
  // mantém apenas os 50 rascunhos mais recentes
  if (_db.drafts.length > 50) _db.drafts = _db.drafts.slice(-50);
  save();
  return draft;
}

function getDraft(id) {
  return _db.drafts.find(d => d.id === id) || null;
}

function updateDraft(draftId, updates) {
  const draft = _db.drafts.find(d => d.id === draftId);
  if (!draft) return null;
  Object.assign(draft, updates);
  save();
  return draft;
}

function markPosted(draft, tweetId) {
  _db.posted.push({ ...draft, tweetId, postedAt: new Date().toISOString() });
  if (_db.posted.length > 200) _db.posted = _db.posted.slice(-200);
  save();
}

function isMentionResponded(mentionId) {
  if (!_db.respondedMentions) _db.respondedMentions = [];
  return _db.respondedMentions.includes(mentionId);
}

function markMentionResponded(mentionId) {
  if (!_db.respondedMentions) _db.respondedMentions = [];
  if (!_db.respondedMentions.includes(mentionId)) {
    _db.respondedMentions.push(mentionId);
    if (_db.respondedMentions.length > 1000) {
      _db.respondedMentions = _db.respondedMentions.slice(-1000);
    }
    save();
  }
}

function getLastMentionId() {
  return _db.lastMentionId || null;
}

function setLastMentionId(id) {
  _db.lastMentionId = id;
  save();
}

module.exports = {
  initDB,
  getSession,
  setSession,
  clearSession,
  saveDraft,
  getDraft,
  updateDraft,
  markPosted,
  isMentionResponded,
  markMentionResponded,
  getLastMentionId,
  setLastMentionId
};
