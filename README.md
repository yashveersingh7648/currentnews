# Current News — Full-stack news website

React + Vite frontend, Node.js/Express API, SQLite database, admin CMS, media upload, headline discovery, lightweight analytics, and SEO-oriented static article prerendering.

## Features
- Responsive homepage and permanent `/news/:slug` article URLs
- Admin login and CMS to draft, edit, publish/unpublish, and delete stories
- Image/video uploads with a rights-confirmation step
- Dashboard metrics for tracked page views and most-read articles
- Google News RSS headlines for editor research only; never auto-publishes RSS content
- Dynamic browser metadata, canonical URLs, Open Graph/Twitter tags, and `NewsArticle` JSON-LD
- Build-time article HTML prerendering so published articles can include crawlable article text
- Automatically generated `sitemap.xml` and recent-article `news-sitemap.xml`
- `robots.txt` excludes the admin path from crawling
- Configurable persistent storage paths for SQLite and uploads

## Important SEO behavior
The frontend is a Render Static Site. A static host cannot create fresh server-rendered HTML at the exact moment an editor publishes a new article. During each frontend build, `scripts/prerender-seo.mjs` fetches the currently published articles from the backend and creates crawlable HTML pages under `dist/news/<slug>/index.html`, plus sitemaps. When you publish new stories, trigger a frontend redeploy/build so the new article pages and sitemaps are regenerated. The React app still loads articles dynamically from the API.

SEO improvements support discovery; they do not guarantee first-page or top ranking. Publish original, accurate reporting, use permanent URLs, show author and dates, link to primary sources, and avoid copying another publisher's article or media.

## Local setup
Requirements: Node.js 20+ and npm.

### Backend
```bash
cd backend
npm install
cp .env.example .env
```
Edit `backend/.env`: set a strong random `JWT_SECRET`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD`. Do not commit `.env`.

```bash
npm run seed-admin
npm run dev
```
API: `http://localhost:5000`.

### Frontend
In another terminal:
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```
Open the Vite URL shown in the terminal (usually `http://localhost:5173`).

## Render deployment (existing services)

### 1. Backend web service
Repository: your GitHub repository; branch: `main`.
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`

Set these Environment Variables in Render (never put secrets in frontend variables):
- `JWT_SECRET`: long random secret generated privately
- `ADMIN_USERNAME`: your admin login email/username
- `ADMIN_PASSWORD`: a strong, unique password
- `FRONTEND_ORIGIN`: `https://currentnews.onrender.com`
- `DATA_DIR`: `/var/data`
- `UPLOADS_DIR`: `/var/data/uploads`
- `MAX_UPLOAD_MB`: `20` (adjust only if needed)

Attach a Render Persistent Disk to the backend service mounted at `/var/data`. Without persistent storage, SQLite data and uploaded media may disappear on redeploy/restart. Ensure the disk plan is available for your Render service. After setting variables, deploy the backend. Check `https://currentnews-back.onrender.com/api/health`; it should return `{"ok":true}`.

To create/reset the production admin, use Render Shell (or a one-off command with the same environment) in the backend service:
```bash
npm run seed-admin
```
Local seeding does not create an admin in the hosted database.

### 2. Frontend Static Site
- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`

Set these frontend build Environment Variables:
- `VITE_API_URL`: `https://currentnews-back.onrender.com`
- `VITE_SITE_URL`: `https://currentnews.onrender.com`

Then deploy the frontend. The build script attempts to fetch published articles from the backend; if the backend is unavailable during build, the base site and empty sitemaps are still created, so redeploy after the backend is healthy.

### 3. Check after deployment
- Frontend: `https://currentnews.onrender.com`
- Backend health: `https://currentnews-back.onrender.com/api/health`
- Sitemap: `https://currentnews.onrender.com/sitemap.xml`
- News sitemap: `https://currentnews.onrender.com/news-sitemap.xml`
- Robots: `https://currentnews.onrender.com/robots.txt`
- Article URL: `https://currentnews.onrender.com/news/<article-slug>`

Submit `https://currentnews.onrender.com/sitemap.xml` in Google Search Console. Use URL Inspection to check representative article URLs and request indexing. Validate structured data with Google's Rich Results Test. Crawling/indexing is not immediate or guaranteed.

## Copyright and editorial workflow
- Upload only your own media or media you have explicit permission/licensing to use. Giving credit or linking to the source does not automatically grant reuse rights.
- RSS headlines are research leads, not verified reporting. Confirm claims against reliable sources and write original reporting.
- Correct mistakes promptly and provide clear author/publication dates and contact details.

## Production cautions
This is a starter CMS, not a fully audited newsroom platform. Before significant public traffic, add backups, monitoring, rate limiting, stronger upload validation, privacy/legal pages, a content correction process, and managed database/object storage as needed. Keep all secrets out of GitHub and out of `VITE_*` variables.
