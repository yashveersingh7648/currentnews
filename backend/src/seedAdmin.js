import "dotenv/config";
import bcrypt from "bcryptjs";
import { admins } from "./db.js";

if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.JWT_SECRET) {
  console.error("Set ADMIN_USERNAME, ADMIN_PASSWORD and JWT_SECRET in backend environment first.");
  process.exit(1);
}
const username = process.env.ADMIN_USERNAME.trim();
const password_hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
await admins.updateOne(
  { username },
  { $set: { username, password_hash, updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
  { upsert: true }
);
console.log(`Created or updated admin "${username}" in MongoDB.`);
process.exit(0);
