import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import slugify from "slugify";
import Parser from "rss-parser";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ObjectId } from "mongodb";
import { admins, articles, pageViews } from "./db.js";
import { requireAdmin } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const rssParser = new Parser({ timeout: 8000 });
const PORT = Number(process.env.PORT || 5000);
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.resolve(__dirname, "../uploads"));
fs.mkdirSync(uploadsDir, { recursive: true });
if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing. Set it in backend environment.");
  process.exit(1);
}
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173").split(",").map(x => x.trim().replace(/\/+$/, "")).filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin.replace(/\/+$/, ""))) return callback(null, true);
    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(null, false);
  },
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadsDir, { fallthrough: true, maxAge: "1h" }));

if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
}
const maxUploadBytes = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 20)) * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))$/i.test(file.mimetype);
    cb(allowed ? null : new Error("Only JPG, PNG, WEBP, GIF images and MP4, WEBM, MOV videos are allowed."), allowed);
  }
});
function uploadToCloudinary(file) {
  return new Promise((resolve, reject) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return reject(new Error("Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in backend environment."));
    }
    const isVideo = file.mimetype.startsWith("video/");
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 12);
    const safeBase = slugify(path.basename(file.originalname, ext), { lower: true, strict: true }).slice(0, 60) || "media";
    const stream = cloudinary.uploader.upload_stream({ folder: "currentnews", resource_type: isVideo ? "video" : "image", public_id: `${Date.now()}-${safeBase}`, overwrite: false }, (error, result) => error ? reject(error) : resolve(result));
    stream.end(file.buffer);
  });
}
function makeSlug(title) { return slugify(title, { lower: true, strict: true, trim: true }).slice(0, 90) || `news-${Date.now()}`; }
async function uniqueSlug(title, currentId = null) {
  const base = makeSlug(title); let slug = base; let n = 2;
  while (true) {
    const row = await articles.findOne({ slug, ...(currentId ? { _id: { $ne: new ObjectId(currentId) } } : {}) }, { projection: { _id: 1 } });
    if (!row) return slug;
    slug = `${base}-${n++}`;
  }
}
function publicArticle(row) {
  if (!row) return row;
  const { _id, ...rest } = row;
  return { ...rest, id: String(_id) };
}
function errorHandler(err, _req, res, _next) {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: `File is too large. Limit: ${process.env.MAX_UPLOAD_MB || 20} MB.` });
  if (err) return res.status(400).json({ error: err.message || "Request failed." });
  res.status(500).json({ error: "Server error." });
}
function validId(id) { return ObjectId.isValid(id) && String(new ObjectId(id)) === String(id); }

app.get("/api/health", (_req, res) => res.json({ ok: true, database: "mongodb" }));
app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Username and password are required." });
    const admin = await admins.findOne({ username: String(username).trim() });
    if (!admin || !await bcrypt.compare(String(password), admin.password_hash)) return res.status(401).json({ error: "Invalid username or password." });
    const token = jwt.sign({ id: String(admin._id), username: admin.username }, process.env.JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, username: admin.username });
  } catch (e) { next(e); }
});

app.post("/api/track", async (req, res, next) => {
  try {
    const sessionId = String(req.body?.sessionId || "").slice(0, 100);
    const pagePath = String(req.body?.path || "/").slice(0, 300);
    const slug = String(req.body?.articleSlug || "").slice(0, 120);
    if (!sessionId || !pagePath.startsWith("/")) return res.status(400).json({ error: "Invalid analytics payload." });
    await pageViews.insertOne({ session_id: sessionId, path: pagePath, article_slug: slug, created_at: new Date() });
    res.status(202).json({ ok: true });
  } catch (e) { next(e); }
});

app.get("/api/admin/stats", requireAdmin, async (_req, res, next) => {
  try {
    const now = new Date(); const start = new Date(now); start.setHours(0, 0, 0, 0);
    const [totalViews, todayViews, todaySessions, published, drafts, popular] = await Promise.all([
      pageViews.countDocuments({}), pageViews.countDocuments({ created_at: { $gte: start } }),
      pageViews.distinct("session_id", { created_at: { $gte: start } }).then(x => x.length),
      articles.countDocuments({ status: "published" }), articles.countDocuments({ status: "draft" }),
      pageViews.aggregate([{ $match: { article_slug: { $ne: "" } } }, { $group: { _id: "$article_slug", views: { $sum: 1 } } }, { $sort: { views: -1 } }, { $limit: 5 }, { $project: { _id: 0, slug: "$_id", views: 1 } }]).toArray()
    ]);
    res.json({ totalViews, todayViews, todaySessions, published, drafts, popular });
  } catch (e) { next(e); }
});

app.get("/api/admin/breaking-news", requireAdmin, async (_req, res) => {
  try {
    const feed = await rssParser.parseURL("https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en");
    const items = (feed.items || []).slice(0, 12).map(item => ({ title: String(item.title || "").slice(0, 300), link: String(item.link || ""), publishedAt: item.isoDate || item.pubDate || null, source: String(item.creator || item.source || "News source").slice(0, 120) })).filter(item => item.title && item.link);
    res.json({ items, feedTitle: feed.title || "Google News India", fetchedAt: new Date().toISOString() });
  } catch { res.status(502).json({ error: "Could not fetch current headlines right now. Check your internet connection and try again." }); }
});

app.get("/api/articles", async (req, res, next) => {
  try {
    const category = req.query.category ? String(req.query.category) : null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const filter = { status: "published", ...(category ? { category } : {}) };
    const rows = await articles.find(filter).sort({ published_at: -1, _id: -1 }).limit(limit).toArray();
    res.json(rows.map(publicArticle));
  } catch (e) { next(e); }
});
app.get("/api/articles/slug/:slug", async (req, res, next) => {
  try {
    const row = await articles.findOne({ slug: req.params.slug, status: "published" });
    if (!row) return res.status(404).json({ error: "News article not found." });
    res.json(publicArticle(row));
  } catch (e) { next(e); }
});
app.get("/api/admin/articles", requireAdmin, async (_req, res, next) => {
  try { res.json((await articles.find({}).sort({ updated_at: -1, _id: -1 }).toArray()).map(publicArticle)); }
  catch (e) { next(e); }
});
app.post("/api/admin/upload", requireAdmin, (req, res, next) => {
  upload.single("file")(req, res, async err => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ error: "Choose an image or video file." });
    try {
      const result = await uploadToCloudinary(req.file); const isVideo = req.file.mimetype.startsWith("video/");
      res.status(201).json({ url: result.secure_url, publicId: result.public_id, mediaType: isVideo ? "video" : "image", originalName: req.file.originalname, size: req.file.size });
    } catch (e) { next(e); }
  });
});
app.post("/api/admin/articles", requireAdmin, async (req, res, next) => {
  try {
    const { title, excerpt = "", content, category = "India", author = "News Desk", mediaUrl = "", mediaType = "", sourceUrl = "", status = "draft" } = req.body || {};
    if (!String(title || "").trim() || !String(content || "").trim()) return res.status(400).json({ error: "Headline and news content are required." });
    const safeStatus = status === "published" ? "published" : "draft";
    const slug = await uniqueSlug(String(title).trim()); const now = new Date().toISOString();
    const doc = { title: String(title).trim(), slug, excerpt: String(excerpt), content: String(content).trim(), category: String(category), author: String(author), media_url: String(mediaUrl), media_type: String(mediaType), source_url: String(sourceUrl), status: safeStatus, published_at: safeStatus === "published" ? now : null, created_at: now, updated_at: now };
    const result = await articles.insertOne(doc); res.status(201).json(publicArticle({ ...doc, _id: result.insertedId }));
  } catch (e) { next(e); }
});
app.put("/api/admin/articles/:id", requireAdmin, async (req, res, next) => {
  try {
    const id = req.params.id; if (!validId(id)) return res.status(404).json({ error: "Article not found." });
    const old = await articles.findOne({ _id: new ObjectId(id) }); if (!old) return res.status(404).json({ error: "Article not found." });
    const body = req.body || {}; const title = String(body.title ?? old.title).trim(); const content = String(body.content ?? old.content).trim();
    if (!title || !content) return res.status(400).json({ error: "Headline and news content are required." });
    const status = (body.status ?? old.status) === "published" ? "published" : "draft";
    const publishedAt = status === "published" ? (old.published_at || new Date().toISOString()) : null;
    const slug = title === old.title ? old.slug : await uniqueSlug(title, id); const updatedAt = new Date().toISOString();
    const update = { title, slug, excerpt: body.excerpt ?? old.excerpt, content, category: body.category ?? old.category, author: body.author ?? old.author, media_url: body.mediaUrl ?? old.media_url, media_type: body.mediaType ?? old.media_type, source_url: body.sourceUrl ?? old.source_url, status, published_at: publishedAt, updated_at: updatedAt };
    await articles.updateOne({ _id: new ObjectId(id) }, { $set: update }); res.json(publicArticle({ ...old, ...update }));
  } catch (e) { next(e); }
});
app.delete("/api/admin/articles/:id", requireAdmin, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: "Article not found." });
    const result = await articles.deleteOne({ _id: new ObjectId(req.params.id) });
    if (!result.deletedCount) return res.status(404).json({ error: "Article not found." });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.use(errorHandler);
app.listen(PORT, () => console.log(`News API running on port ${PORT}`));
