import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
const dbName = process.env.MONGODB_DB || "currentnews";
if (!uri) {
  console.error("MONGODB_URI is missing. Add your MongoDB Atlas connection string in the backend environment.");
  process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
await client.connect();
const db = client.db(dbName);
export const admins = db.collection("admins");
export const articles = db.collection("articles");
export const pageViews = db.collection("page_views");

await Promise.all([
  admins.createIndex({ username: 1 }, { unique: true }),
  articles.createIndex({ slug: 1 }, { unique: true }),
  articles.createIndex({ status: 1, published_at: -1 }),
  articles.createIndex({ updated_at: -1 }),
  pageViews.createIndex({ created_at: -1 }),
  pageViews.createIndex({ article_slug: 1 }),
]);
console.log(`MongoDB connected (database: ${dbName})`);
export default db;
