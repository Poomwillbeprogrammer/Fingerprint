const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// สร้างโฟลเดอร์ data ถ้ายังไม่มี
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'fingerprint_data.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('❌ Error opening SQLite:', err);
  else console.log('✅ Connected to SQLite:', dbPath);
});


// Helper functions for Promises
const dbAsync = {
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  },
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },
  exec: (sql) => {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

// Asynchronous Initialization before server starts
async function initDatabase() {
  const hash = bcrypt.hashSync('admin123', 10);
  const initSql = `
    PRAGMA busy_timeout = 10000;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      department TEXT,
      role TEXT DEFAULT 'User',
      fingerprint_template TEXT,
      created_at DATETIME DEFAULT (datetime('now', '+7 hours'))
    );

    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      fingerprint_id INTEGER,
      status TEXT NOT NULL,
      score INTEGER,
      timestamp DATETIME DEFAULT (datetime('now', '+7 hours'))
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now', '+7 hours'))
    );

    INSERT OR REPLACE INTO admins (id, username, password_hash) 
    VALUES (1, 'admin', '${hash}');

    INSERT OR IGNORE INTO users (id, name, department, role, created_at) VALUES 
    (1, 'Poom Wang', 'Engineering', 'Admin', datetime('now', '+7 hours')),
    (2, 'Somchai Jaidee', 'Operations', 'User', datetime('now', '+7 hours')),
    (3, 'Wichai Rakngan', 'Security', 'User', datetime('now', '+7 hours'));

    INSERT OR IGNORE INTO access_logs (id, user_id, user_name, fingerprint_id, status, score, timestamp) VALUES 
    (1, 1, 'Poom Wang', 1, 'GRANTED', 145, datetime('now', '+7 hours', '-15 minutes')),
    (2, 2, 'Somchai Jaidee', 2, 'GRANTED', 128, datetime('now', '+7 hours', '-45 minutes')),
    (3, NULL, 'Unknown User', 99, 'DENIED', 32, datetime('now', '+7 hours', '-1 hour')),
    (4, 3, 'Wichai Rakngan', 3, 'GRANTED', 135, datetime('now', '+7 hours', '-2 hours'));
  `;

  await dbAsync.exec(initSql);

  // Migration: เพิ่มคอลัมน์ fingerprint_template หากฐานข้อมูลเดิมยังไม่มี
  try {
    await dbAsync.run("ALTER TABLE users ADD COLUMN fingerprint_template TEXT;");
  } catch (e) {
    // Column already exists, ignore
  }

  console.log('✅ Database schema and initial records ready!');
}

module.exports = { db, dbAsync, initDatabase };
