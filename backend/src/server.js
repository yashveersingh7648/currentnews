import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import slugify from "slugify";
import Parser from "rss-parser";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import db from "./db.js";
import { requireAdmin } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const rssParser = new Parser({ timeout: 8000 });
const PORT = Number(process.env.PORT || 5000);
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.resolve(__dirname, "../uploads"));
fs.mkdirSync(uploadsDir, { recursive: true });

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing. Set it in backend/.env");
  process.exit(1);
}
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map(origin => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    // Requests without an Origin header (for example health checks) are allowed.
    if (!origin || allowedOrigins.includes(origin.replace(/\/+$/, ""))) {
      return callback(null, true);
    }
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

const maxUploadBytes = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 100)) * 1024 * 1024;
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 12);
    const safeBase = slugify(path.basename(file.originalname, ext), { lower: true, strict: true }).slice(0, 60) || "media";
    cb(null, `${Date.now()}-${safeBase}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))$/i.test(file.mimetype);
    cb(allowed ? null : new Error("Only JPG, PNG, WEBP, GIF images and MP4, WEBM, MOV videos are allowed."), allowed);
  }
});

function makeSlug(title) {
  return slugify(title, { lower: true, strict: true, trim: true }).slice(0, 90) || `news-${Date.now()}`;
}
function uniqueSlug(title, currentId = null) {
  const base = makeSlug(title);
  let slug = base, n = 2;
  while (true) {
    const row = db.prepare("SELECT id FROM articles WHERE slug = ?").get(slug);
    if (!row || row.id === currentId) return slug;
    slug = `${base}-${n++}`;
  }
}
function publicArticle(row) {
  if (!row) return row;
  const { ...article } = row;
  return article;
}
function errorHandler(err, _req, res, _next) {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: `File is too large. Limit: ${process.env.MAX_UPLOAD_MB || 100} MB.` });
  }
  if (err) return res.status(400).json({ error: err.message || "Request failed." });
  res.status(500).json({ error: "Server error." });
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password are required." });
  const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get(String(username).trim());
  if (!admin || !bcrypt.compareSync(String(password), admin.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password." });
  }
  const token = jwt.sign({ id: admin.id, username: admin.username }, process.env.JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, username: admin.username });
});


// Privacy-conscious, lightweight page-view analytics. The frontend sends a random
// session identifier; do not send names, emails, or other directly identifying data.
app.post("/api/track", (req, res) => {
  const sessionId = String(req.body?.sessionId || "").slice(0, 100);
  const pagePath = String(req.body?.path || "/").slice(0, 300);
  const slug = String(req.body?.articleSlug || "").slice(0, 120);
  if (!sessionId || !pagePath.startsWith("/")) return res.status(400).json({ error: "Invalid analytics payload." });
  db.prepare("INSERT INTO page_views (session_id, path, article_slug) VALUES (?, ?, ?)").run(sessionId, pagePath, slug);
  res.status(202).json({ ok: true });
});

app.get("/api/admin/stats", requireAdmin, (_req, res) => {
  const totalViews = db.prepare("SELECT COUNT(*) AS count FROM page_views").get().count;
  const todayViews = db.prepare("SELECT COUNT(*) AS count FROM page_views WHERE date(created_at, 'localtime') = date('now', 'localtime')").get().count;
  const todaySessions = db.prepare("SELECT COUNT(DISTINCT session_id) AS count FROM page_views WHERE date(created_at, 'localtime') = date('now', 'localtime')").get().count;
  const published = db.prepare("SELECT COUNT(*) AS count FROM articles WHERE status='published'").get().count;
  const drafts = db.prepare("SELECT COUNT(*) AS count FROM articles WHERE status='draft'").get().count;
  const popular = db.prepare(`SELECT article_slug AS slug, COUNT(*) AS views FROM page_views WHERE article_slug <> '' GROUP BY article_slug ORDER BY views DESC LIMIT 5`).all();
  res.json({ totalViews, todayViews, todaySessions, published, drafts, popular });
});

// Headline discovery only: the feed is not republished automatically. Editors should
// verify the story and write original copy before publishing.
app.get("/api/admin/breaking-news", requireAdmin, async (_req, res) => {
  try {
    const feed = await rssParser.parseURL("https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en");
    const items = (feed.items || []).slice(0, 12).map(item => ({
      title: String(item.title || "").slice(0, 300),
      link: String(item.link || ""),
      publishedAt: item.isoDate || item.pubDate || null,
      source: String(item.creator || item.source || "News source").slice(0, 120)
    })).filter(item => item.title && item.link);
    res.json({ items, feedTitle: feed.title || "Google News India", fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ error: "Could not fetch current headlines right now. Check your internet connection and try again." });
  }
});

app.get("/api/articles", (req, res) => {
  const category = req.query.category ? String(req.query.category) : null;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
  const rows = category
    ? db.prepare("SELECT * FROM articles WHERE status='published' AND category=? ORDER BY published_at DESC, id DESC LIMIT ?").all(category, limit)
    : db.prepare("SELECT * FROM articles WHERE status='published' ORDER BY published_at DESC, id DESC LIMIT ?").all(limit);
  res.json(rows.map(publicArticle));
});
app.get("/api/articles/slug/:slug", (req, res) => {
  const row = db.prepare("SELECT * FROM articles WHERE slug=? AND status='published'").get(req.params.slug);
  if (!row) return res.status(404).json({ error: "News article not found." });
  res.json(publicArticle(row));
});

app.get("/api/admin/articles", requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM articles ORDER BY updated_at DESC, id DESC").all());
});
app.post("/api/admin/upload", requireAdmin, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ error: "Choose an image or video file." });
    const isVideo = req.file.mimetype.startsWith("video/");
    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      mediaType: isVideo ? "video" : "image",
      originalName: req.file.originalname,
      size: req.file.size
    });
  });
});

app.post("/api/admin/articles", requireAdmin, (req, res) => {
  const { title, excerpt = "", content, category = "India", author = "News Desk", mediaUrl = "", mediaType = "", sourceUrl = "", status = "draft" } = req.body || {};
  if (!String(title || "").trim() || !String(content || "").trim()) {
    return res.status(400).json({ error: "Headline and news content are required." });
  }
  const safeStatus = status === "published" ? "published" : "draft";
  const slug = uniqueSlug(String(title).trim());
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO articles (title, slug, excerpt, content, category, author, media_url, media_type, source_url, status, published_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(String(title).trim(), slug, String(excerpt), String(content).trim(), String(category), String(author), String(mediaUrl), String(mediaType), String(sourceUrl), safeStatus, safeStatus === "published" ? now : null, now);
  res.status(201).json(db.prepare("SELECT * FROM articles WHERE id=?").get(result.lastInsertRowid));
});

app.put("/api/admin/articles/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare("SELECT * FROM articles WHERE id=?").get(id);
  if (!old) return res.status(404).json({ error: "Article not found." });
  const body = req.body || {};
  const title = String(body.title ?? old.title).trim();
  const content = String(body.content ?? old.content).trim();
  if (!title || !content) return res.status(400).json({ error: "Headline and news content are required." });
  const status = (body.status ?? old.status) === "published" ? "published" : "draft";
  const publishedAt = status === "published" ? (old.published_at || new Date().toISOString()) : null;
  const slug = title === old.title ? old.slug : uniqueSlug(title, id);
  db.prepare(`
    UPDATE articles SET title=?, slug=?, excerpt=?, content=?, category=?, author=?, media_url=?, media_type=?, source_url=?, status=?, published_at=?, updated_at=?
    WHERE id=?
  `).run(title, slug, body.excerpt ?? old.excerpt, content, body.category ?? old.category, body.author ?? old.author,
    body.mediaUrl ?? old.media_url, body.mediaType ?? old.media_type, body.sourceUrl ?? old.source_url,
    status, publishedAt, new Date().toISOString(), id);
  res.json(db.prepare("SELECT * FROM articles WHERE id=?").get(id));
});

app.delete("/api/admin/articles/:id", requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM articles WHERE id=?").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Article not found." });
  res.json({ ok: true });
});

app.use(errorHandler);
app.listen(PORT, () => console.log(`News API running on http://localhost:${PORT}`));
