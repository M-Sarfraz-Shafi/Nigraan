const fs = require("node:fs");
const path = require("node:path");

const DB_PATH = process.env.PM_DB_PATH || path.join(__dirname, "..", "data.db");
const BACKUP_DIR = process.env.PM_BACKUP_DIR || path.join(__dirname, "..", "backups");

if (!fs.existsSync(DB_PATH)) {
  console.error(`No database found at ${DB_PATH} — nothing to back up.`);
  process.exit(1);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dest = path.join(BACKUP_DIR, `data-${stamp}.db`);
fs.copyFileSync(DB_PATH, dest);

console.log(`Backed up ${DB_PATH} -> ${dest}`);
