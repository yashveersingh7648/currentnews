import fs from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve('dist');
const siteUrl = (process.env.VITE_SITE_URL || 'https://currentnews.onrender.com').replace(/\/$/, '');
const apiUrl = (process.env.VITE_API_URL || 'https://currentnews-back.onrender.com').replace(/\/$/, '');
const esc = (v = '') => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const plain = (v = '') => String(v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const date = v => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString(); };
const absoluteMedia = v => !v ? '' : /^https?:\/\//i.test(v) ? v : `${apiUrl}${v.startsWith('/') ? '' : '/'}${v}`;
let articles = [];
try {
  const response = await fetch(`${apiUrl}/api/articles?limit=100`, { signal: AbortSignal.timeout(12000) });
  if (response.ok) articles = await response.json();
  else console.warn(`SEO prerender: article API returned ${response.status}; building base site only.`);
} catch (error) {
  console.warn(`SEO prerender: could not fetch published articles (${error.message}); building base site only.`);
}

const baseHtml = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
const urls = [{ loc: `${siteUrl}/`, lastmod: new Date().toISOString() }];
for (const a of articles) {
  if (!a?.slug || !a?.title || !a?.content) continue;
  const url = `${siteUrl}/news/${encodeURIComponent(a.slug)}`;
  const published = date(a.published_at || a.updated_at);
  const modified = date(a.updated_at || a.published_at);
  const title = `${plain(a.title)} | Current News`;
  const description = (plain(a.excerpt || a.content).slice(0, 155) || 'Read the latest verified news and updates on Current News.');
  const image = absoluteMedia(a.media_url);
  const paragraphs = String(a.content).split(/\n{2,}/).map(p => `<p>${esc(plain(p))}</p>`).filter(p => p !== '<p></p>').join('\n');
  const media = image && a.media_type !== 'video' ? `<figure><img src="${esc(image)}" alt="${esc(a.title)}" width="1200" height="675" fetchpriority="high"><figcaption>${esc(a.title)}</figcaption></figure>` : (image ? `<video controls preload="metadata" src="${esc(image)}" aria-label="${esc(a.title)}"></video>` : '');
  const schema = {
    '@context': 'https://schema.org', '@type': 'NewsArticle',
    headline: plain(a.title).slice(0, 110), description,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    datePublished: published, dateModified: modified,
    author: { '@type': 'Person', name: plain(a.author || 'Current News Desk') },
    publisher: { '@type': 'Organization', name: 'Current News', url: siteUrl },
    ...(image ? { image: [image] } : {})
  };
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${esc(url)}"><meta property="og:type" content="article"><meta property="og:site_name" content="Current News"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}">${image ? `<meta property="og:image" content="${esc(image)}">` : ''}<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}">${image ? `<meta name="twitter:image" content="${esc(image)}">` : ''}<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script><style>body{margin:0;font:18px/1.75 system-ui,-apple-system,Segoe UI,sans-serif;color:#18212f;background:#f7f8fa}header,main,footer{max-width:850px;margin:auto;padding:22px}header{border-bottom:1px solid #e1e5eb}a{color:#1457a6}h1{font-size:clamp(2rem,5vw,3.4rem);line-height:1.15;letter-spacing:-.03em}main{background:white;margin-top:24px;margin-bottom:24px;border-radius:16px;padding:clamp(22px,5vw,56px)}.meta{color:#5c6675;font-size:14px}figure{margin:28px 0}figure img,video{width:100%;height:auto;border-radius:12px}figcaption{font-size:13px;color:#657083}footer{font-size:14px;color:#657083}</style></head><body><header><a href="/" aria-label="Current News home"><strong>Current News</strong></a></header><main><nav aria-label="Breadcrumb"><a href="/">Home</a> / ${esc(a.category || 'News')}</nav><p class="meta">${esc(a.category || 'News')} · <time datetime="${esc(published)}">${esc(new Date(published).toLocaleDateString('en-IN',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}))}</time> · By ${esc(a.author || 'Current News Desk')}</p><article><h1>${esc(a.title)}</h1>${a.excerpt ? `<p><strong>${esc(a.excerpt)}</strong></p>` : ''}${media}<div>${paragraphs}</div>${a.source_url ? `<p class="meta">Source: <a href="${esc(a.source_url)}" rel="nofollow noopener noreferrer" target="_blank">Original source</a></p>` : ''}</article><hr><p><a href="/">← Read more news</a></p></main><footer>© ${new Date().getFullYear()} Current News. Verify important information with primary sources.</footer></body></html>`;
  const out = path.join(dist, 'news', a.slug, 'index.html');
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, html, 'utf8');
  urls.push({ loc: url, lastmod: modified });
}

const xmlEsc = v => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${xmlEsc(u.loc)}</loc><lastmod>${xmlEsc(u.lastmod)}</lastmod></url>`).join('\n')}\n</urlset>\n`;
await fs.writeFile(path.join(dist, 'sitemap.xml'), sitemap, 'utf8');
const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
const recent = articles.filter(a => a?.slug && a?.title && new Date(a.published_at || 0).getTime() >= cutoff);
const newsXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${recent.map(a => `  <url><loc>${xmlEsc(`${siteUrl}/news/${encodeURIComponent(a.slug)}`)}</loc><news:news><news:publication><news:name>Current News</news:name><news:language>en</news:language></news:publication><news:publication_date>${xmlEsc(date(a.published_at))}</news:publication_date><news:title>${xmlEsc(plain(a.title).slice(0, 110))}</news:title></news:news></url>`).join('\n')}\n</urlset>\n`;
await fs.writeFile(path.join(dist, 'news-sitemap.xml'), newsXml, 'utf8');
console.log(`SEO prerender complete: ${articles.length} article records fetched, ${urls.length - 1} article pages rendered.`);
