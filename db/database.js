const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

const DB_PATH = path.join(__dirname, 'data.db');
const BACKUP_DIR = path.join(__dirname, 'backups');

let db;

function initDB() {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      gender TEXT DEFAULT 'any',
      age INTEGER,
      language TEXT DEFAULT 'id',
      is_banned INTEGER DEFAULT 0,
      ban_reason TEXT,
      total_chats INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user1_id INTEGER NOT NULL,
      user2_id INTEGER NOT NULL,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      ended_at TEXT,
      ended_by INTEGER
    );

    CREATE TABLE IF NOT EXISTS queue (
      user_id INTEGER PRIMARY KEY,
      gender_filter TEXT DEFAULT 'any',
      priority INTEGER DEFAULT 0,
      joined_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id INTEGER,
      reported_id INTEGER,
      category TEXT,
      session_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id INTEGER PRIMARY KEY,
      plan TEXT,
      expires_at TEXT,
      stars_paid INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS fsub (
      chat_id INTEGER PRIMARY KEY,
      title TEXT,
      link TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user1 ON sessions(user1_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user2 ON sessions(user2_id);
    CREATE INDEX IF NOT EXISTS idx_queue_priority ON queue(priority DESC, joined_at ASC);
  `);

    // Default settings
    const defaults = {
        media_log_enabled: '0',
        fsub_enabled: '0',
        maintenance_mode: '0',
    };
    const insertSetting = db.prepare(
        'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
    );
    for (const [key, value] of Object.entries(defaults)) {
        insertSetting.run(key, value);
    }

    console.log('[DB] Database initialized at', DB_PATH);
    return db;
}

function getDB() {
    if (!db) throw new Error('DB not initialized. Call initDB() first.');
    return db;
}

// ─── USER ─────────────────────────────────────────────────────────────────────

function getUser(id) {
    return getDB().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function upsertUser(user) {
    getDB()
        .prepare(`
      INSERT INTO users (id, username, first_name)
      VALUES (@id, @username, @first_name)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name
    `)
        .run(user);
}

function updateUserSettings(id, settings) {
    const fields = Object.keys(settings)
        .map((k) => `${k} = @${k}`)
        .join(', ');
    getDB()
        .prepare(`UPDATE users SET ${fields} WHERE id = @id`)
        .run({ id, ...settings });
}

function banUser(id, reason) {
    getDB()
        .prepare('UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?')
        .run(reason || 'Violated rules', id);
}

function unbanUser(id) {
    getDB()
        .prepare('UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?')
        .run(id);
}

function isBanned(id) {
    const user = getDB().prepare('SELECT is_banned FROM users WHERE id = ?').get(id);
    return user ? user.is_banned === 1 : false;
}

function incrementTotalChats(id) {
    getDB()
        .prepare('UPDATE users SET total_chats = total_chats + 1 WHERE id = ?')
        .run(id);
}

function getTotalUsers() {
    return getDB().prepare('SELECT COUNT(*) as count FROM users').get().count;
}

function getAllUserIds() {
    return getDB().prepare('SELECT id FROM users WHERE is_banned = 0').all().map((r) => r.id);
}

// ─── SESSION ──────────────────────────────────────────────────────────────────

function getActiveSession(userId) {
    return getDB()
        .prepare(`
      SELECT * FROM sessions
      WHERE (user1_id = ? OR user2_id = ?) AND ended_at IS NULL
      LIMIT 1
    `)
        .get(userId, userId);
}

function createSession(user1Id, user2Id) {
    const info = getDB()
        .prepare('INSERT INTO sessions (user1_id, user2_id) VALUES (?, ?)')
        .run(user1Id, user2Id);
    return info.lastInsertRowid;
}

function endSession(sessionId, endedBy) {
    getDB()
        .prepare(
            "UPDATE sessions SET ended_at = CURRENT_TIMESTAMP, ended_by = ? WHERE id = ?"
        )
        .run(endedBy, sessionId);
}

function getPartner(userId) {
    const session = getActiveSession(userId);
    if (!session) return null;
    return session.user1_id === userId ? session.user2_id : session.user1_id;
}

function getActiveSessions() {
    return getDB()
        .prepare('SELECT * FROM sessions WHERE ended_at IS NULL')
        .all();
}

function getTodaySessionCount() {
    return getDB()
        .prepare(
            "SELECT COUNT(*) as count FROM sessions WHERE date(started_at) = date('now')"
        )
        .get().count;
}

// ─── QUEUE ────────────────────────────────────────────────────────────────────

function addQueue(userId, genderFilter = 'any', priority = 0) {
    getDB()
        .prepare(`
      INSERT OR REPLACE INTO queue (user_id, gender_filter, priority, joined_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `)
        .run(userId, genderFilter, priority);
}

function removeQueue(userId) {
    getDB().prepare('DELETE FROM queue WHERE user_id = ?').run(userId);
}

function getQueue() {
    return getDB()
        .prepare('SELECT * FROM queue ORDER BY priority DESC, joined_at ASC')
        .all();
}

function isInQueue(userId) {
    return !!getDB().prepare('SELECT 1 FROM queue WHERE user_id = ?').get(userId);
}

function getQueueSize() {
    return getDB().prepare('SELECT COUNT(*) as count FROM queue').get().count;
}

// ─── REPORT ───────────────────────────────────────────────────────────────────

function createReport(reporterId, reportedId, category, sessionId) {
    return getDB()
        .prepare(
            'INSERT INTO reports (reporter_id, reported_id, category, session_id) VALUES (?, ?, ?, ?)'
        )
        .run(reporterId, reportedId, category, sessionId).lastInsertRowid;
}

function getReportsByUser(userId) {
    return getDB()
        .prepare('SELECT * FROM reports WHERE reported_id = ? ORDER BY created_at DESC')
        .all(userId);
}

// ─── SUBSCRIPTION ─────────────────────────────────────────────────────────────

function upsertSubscription(userId, plan, expiresAt, starsPaid) {
    getDB()
        .prepare(`
      INSERT INTO subscriptions (user_id, plan, expires_at, stars_paid)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        plan = excluded.plan,
        expires_at = excluded.expires_at,
        stars_paid = excluded.stars_paid,
        created_at = CURRENT_TIMESTAMP
    `)
        .run(userId, plan, expiresAt, starsPaid);
}

function getSubscription(userId) {
    return getDB()
        .prepare('SELECT * FROM subscriptions WHERE user_id = ?')
        .get(userId);
}

function isSubscriptionActive(userId) {
    const sub = getSubscription(userId);
    if (!sub) return false;
    return new Date(sub.expires_at) > new Date();
}

function getSubscriptionPlan(userId) {
    if (!isSubscriptionActive(userId)) return 'free';
    const sub = getSubscription(userId);
    return sub ? sub.plan : 'free';
}

// ─── FSUB ─────────────────────────────────────────────────────────────────────

function getFsubChannels() {
    return getDB().prepare('SELECT * FROM fsub').all();
}

function addFsub(chatId, title, link) {
    getDB()
        .prepare('INSERT OR REPLACE INTO fsub (chat_id, title, link) VALUES (?, ?, ?)')
        .run(chatId, title || '', link || '');
}

function removeFsub(chatId) {
    getDB().prepare('DELETE FROM fsub WHERE chat_id = ?').run(chatId);
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

function getSetting(key) {
    const row = getDB().prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
}

function setSetting(key, value) {
    getDB()
        .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run(key, String(value));
}

// ─── BACKUP ───────────────────────────────────────────────────────────────────

async function backupDatabase() {
    const now = new Date();
    // Use WIB (UTC+7)
    const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const ts = wib.toISOString().replace('T', '_').substring(0, 16).replace(':', '-');

    const dbDest = path.join(BACKUP_DIR, `data_${ts}.db`);
    const zipDest = path.join(BACKUP_DIR, `backup_${ts}.zip`);

    await db.backup(dbDest);

    // Create ZIP
    const zip = new AdmZip();
    zip.addLocalFile(dbDest);
    zip.writeZip(zipDest);

    // Delete raw .db to save space
    fs.unlinkSync(dbDest);

    console.log(`[DB] Backup saved as ZIP: ${zipDest}`);
    return zipDest;
}

function restoreDatabase(zipBuffer) {
    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();

    // Find any .db file inside the zip archive
    const dbEntry = zipEntries.find(e => e.entryName.endsWith('.db'));
    if (!dbEntry) {
        throw new Error('File ZIP tidak valid: database (.db) tidak ditemukan.');
    }

    // 1. Close current database safely
    if (db) {
        db.close();
        db = null;
    }

    // 2. Overwrite data.db with unzipped buffer
    const newDbData = dbEntry.getData();
    fs.writeFileSync(DB_PATH, newDbData);

    // 3. Re-initialize DB connection
    initDB();
    console.log('[DB] Database successfully restored from ZIP.');
}

module.exports = {
    initDB,
    getDB,
    // user
    getUser,
    upsertUser,
    updateUserSettings,
    banUser,
    unbanUser,
    isBanned,
    incrementTotalChats,
    getTotalUsers,
    getAllUserIds,
    // session
    getActiveSession,
    createSession,
    endSession,
    getPartner,
    getActiveSessions,
    getTodaySessionCount,
    // queue
    addQueue,
    removeQueue,
    getQueue,
    isInQueue,
    getQueueSize,
    // report
    createReport,
    getReportsByUser,
    // subscription
    upsertSubscription,
    getSubscription,
    isSubscriptionActive,
    getSubscriptionPlan,
    // fsub
    getFsubChannels,
    addFsub,
    removeFsub,
    // settings
    getSetting,
    setSetting,
    // backup and restore
    backupDatabase,
    restoreDatabase,
};
