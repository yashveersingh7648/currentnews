import "dotenv/config";
import bcrypt from "bcryptjs";
import db from "./db.js";

if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.JWT_SECRET) {
  console.error("Set ADMIN_USERNAME, ADMIN_PASSWORD and JWT_SECRET in backend/.env first.");
  process.exit(1);
}
const username = process.env.ADMIN_USERNAME.trim();
const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
const existing = db.prepare("SELECT id FROM admins WHERE username = ?").get(username);
if (existing) {
  db.prepare("UPDATE admins SET password_hash = ? WHERE username = ?").run(passwordHash, username);
  console.log(`Updated password for admin "${username}".`);
} else {
  db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(username, passwordHash);
  console.log(`Created admin "${username}".`);
}
