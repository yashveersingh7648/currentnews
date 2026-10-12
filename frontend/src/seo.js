const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://currentnews.onrender.com').replace(/\/$/, '');

function upsertMeta(name, content, attr = 'name') {
  let element = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attr, name);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content || '');
}

export function setPageSEO({ title, description, path = '/', image = '', type = 'website', article = null } = {}) {
  if (typeof document === 'undefined') return;
  const safeTitle = title || 'Current News — Latest News, India and World Updates';
  const safeDescription = (description || 'Read the latest news, explainers and updates from India and around the world.').replace(/\s+/g, ' ').slice(0, 160);
  const url = `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  document.title = safeTitle;
  upsertMeta('description', safeDescription);
  upsertMeta('robots', 'index,follow,max-image-preview:large');
  upsertMeta('og:type', type, 'property');
  upsertMeta('og:site_name', 'Current News', 'property');
  upsertMeta('og:title', safeTitle, 'property');
  upsertMeta('og:description', safeDescription, 'property');
  upsertMeta('og:url', url, 'property');
  upsertMeta('og:image', image || '', 'property');
  upsertMeta('twitter:card', image ? 'summary_large_image' : 'summary');
  upsertMeta('twitter:title', safeTitle);
  upsertMeta('twitter:description', safeDescription);
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
  canonical.href = url;
  let jsonLd = document.getElementById('current-news-jsonld');
  if (!jsonLd) { jsonLd = document.createElement('script'); jsonLd.id = 'current-news-jsonld'; jsonLd.type = 'application/ld+json'; document.head.appendChild(jsonLd); }
  const data = article ? {
    '@context': 'https://schema.org', '@type': 'NewsArticle', headline: article.title,
    description: safeDescription, mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    datePublished: article.published_at || undefined, dateModified: article.updated_at || article.published_at || undefined,
    author: { '@type': 'Person', name: article.author || 'Current News Desk' },
    publisher: { '@type': 'Organization', name: 'Current News', url: SITE_URL },
    ...(image ? { image: [image] } : {})
  } : { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Current News', url: SITE_URL, description: safeDescription };
  jsonLd.textContent = JSON.stringify(data);
}
