# Current News Website (React + Node.js)

A starter full-stack news website with:
- Public news homepage and article pages
- Admin login
- Create, edit, publish/unpublish, and delete articles
- Image/video upload from the admin dashboard
- Dashboard analytics for tracked page views, today's views, approximate sessions, and most-read articles
- Admin-only current-headline discovery from Google News RSS (headlines are not auto-published)
- Animated responsive UI, improved footer, and reduced-motion support
- SQLite database (created automatically)
- Local media storage in `backend/uploads`

## Requirements
- Node.js 20+ recommended
- npm

## 1. Install dependencies
Open a terminal in the project folder:

```bash
cd backend
npm install
cp .env.example .env
```

Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `JWT_SECRET` in `backend/.env`.
Use a strong password and a long random JWT secret.

Then:

```bash
npm run seed-admin
npm run dev
```

Keep this terminal running. The backend runs at `http://localhost:5000`.

Open a second terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open the Vite URL shown in the terminal (usually `http://localhost:5173`).

## 2. Use the admin dashboard
Open `/admin`, log in using the credentials from `backend/.env`, then create a post.
You can upload an image or video. For the MVP, uploads are stored locally in `backend/uploads`.

## Analytics and breaking-headline feed
- The frontend sends anonymous session-based page-view events to `/api/track`; analytics are approximate and are not a substitute for a privacy-compliant analytics platform. Add a clear privacy notice and review local privacy requirements before public launch.
- The admin headline feed requires backend network access. It provides links/headline leads only; it does not import article body text or media. Always verify stories and write original copy.

## Copyright and newsroom workflow
- Do not upload TV-channel footage, screenshots, logos, photos, or music unless you own the rights, have written permission/licence, or have checked that a specific legal exception applies. Attribution alone does not grant reuse rights.
- Safer options include your own photographs/video, properly licensed stock media, Creative Commons media whose exact licence permits your intended use, or written permission. Keep a record of licence/permission and follow attribution terms.
- Facts and events are different from another publisher's wording, photographs, graphics, and video. Write original reporting, link to sources, verify claims, and get legal advice for uncertain uses. Indian law has specific exceptions (including fair dealing for current-events reporting) but whether a particular use qualifies depends on facts; it is not a blanket permission to republish TV clips.

## Important production notes
This is a starter project, not a fully hardened newsroom CMS.
- Local uploads disappear on many ephemeral hosting platforms after redeploy/restart. Use persistent disk or cloud object storage for production.
- Do not expose the backend directly without HTTPS, a strong JWT secret, secure credentials, upload limits, and backups.
- Configure `FRONTEND_ORIGIN` to your deployed frontend URL.
- Use a managed database and cloud media storage for production traffic.
- Keep your admin password and secrets private. Never commit `.env`.
- Verify all news before publishing; use original reporting and cite sources.
