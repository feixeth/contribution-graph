const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'commits.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS commits (
    sha         TEXT PRIMARY KEY,
    date        TEXT NOT NULL,
    provider    TEXT NOT NULL,
    repository  TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_date ON commits(date);
`);

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO commits (sha, date, provider, repository)
  VALUES (@sha, @date, @provider, @repository)
`);

function insertCommits(rows) {
  const insertMany = db.transaction((items) => {
    let inserted = 0;
    for (const row of items) {
      const info = insertStmt.run(row);
      if (info.changes > 0) inserted++;
    }
    return inserted;
  });
  return insertMany(rows);
}

function getCommitsSince(dateStr) {
  return db
    .prepare(`SELECT date, COUNT(*) as count FROM commits WHERE date >= ? GROUP BY date`)
    .all(dateStr);
}

function getLastCommitDate(provider) {
  const row = db
    .prepare(`SELECT MAX(date) as maxDate FROM commits WHERE provider = ?`)
    .get(provider);
  return row ? row.maxDate : null;
}

function getStats() {
  const total = db.prepare(`SELECT COUNT(*) as c FROM commits`).get().c;
  const github = db.prepare(`SELECT COUNT(*) as c FROM commits WHERE provider = 'github'`).get().c;
  const gitlab = db.prepare(`SELECT COUNT(*) as c FROM commits WHERE provider = 'gitlab'`).get().c;
  const oldest = db.prepare(`SELECT MIN(date) as d FROM commits`).get().d;
  return { total, github, gitlab, oldest_commit: oldest };
}

module.exports = {
  db,
  insertCommits,
  getCommitsSince,
  getLastCommitDate,
  getStats,
};
