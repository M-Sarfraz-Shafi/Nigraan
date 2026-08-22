const { db } = require("../db");

const [, , username] = process.argv;
if (!username) {
  console.error("Usage: npm run delete-user -- <username>");
  process.exit(1);
}

const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
if (!user) {
  console.error(`No user "${username}" found.`);
  process.exit(1);
}

try {
  db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
} catch (e) {
  if (String(e.message).includes("FOREIGN KEY")) {
    console.error(`Cannot delete "${username}" — they still own one or more projects. Transfer or delete those projects first.`);
    process.exit(1);
  }
  throw e;
}
console.log(`Deleted user "${username}". Their sessions and project memberships are removed.`);
