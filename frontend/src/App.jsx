import React, { useEffect, useRef, useState } from "react";
import { Link, Route, Routes, useParams } from "react-router-dom";
import { API, mediaUrl, request } from "./api.js";

const categories = ["All", "India", "World", "Technology", "Education", "Business", "Sports"];
const fmtDate = (value) => value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Latest update";

function Header() {
  return <><div className="top-strip"><div className="wrap top-strip-inner"><span><i className="ticker-live"/> LIVE NEWSROOM</span><span>Clear facts. Useful context. Updated daily.</span></div></div><header className="site-header"><div className="wrap header-inner">
    <Link to="/" className="brand"><span className="brand-mark">D</span><span>DAILY CURRENT<small>NEWS • EXPLAINERS • UPDATES</small></span></Link>
    <nav><Link to="/">Latest News</Link><Link to="/admin">Admin</Link></nav>
  </div></header></>;
}
function Media({ article, large = false }) {
  if (!article?.media_url) return <div className={`media-placeholder ${large ? "large" : ""}`}><span>DAILY CURRENT</span></div>;
  const src = mediaUrl(article.media_url);
  return article.media_type === "video"
    ? <video className={`article-media ${large ? "large" : ""}`} src={src} controls preload="metadata" />
    : <img className={`article-media ${large ? "large" : ""}`} src={src} alt={article.title} loading="lazy" />;
}
function Home() {
  const tracked = useRef(false);
  const [articles, setArticles] = useState([]);
  const [category, setCategory] = useState("All");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!tracked.current) {
      tracked.current = true;
      let sessionId = sessionStorage.getItem("news_analytics_session");
      if (!sessionId) { sessionId = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`); sessionStorage.setItem("news_analytics_session", sessionId); }
      request("/api/track", { method:"POST", body:JSON.stringify({ sessionId, path:"/", articleSlug:"" }) }).catch(() => {});
    }
    request(`/api/articles${category === "All" ? "" : `?category=${encodeURIComponent(category)}`}`)
      .then(setArticles).catch(e => setError(e.message));
  }, [category]);
  return <><Header/><main className="wrap">
    <section className="hero"><div><span className="eyebrow">STAY INFORMED</span><h1>News that matters.<br/><em>Facts that count.</em></h1><p>Latest headlines, useful context and updates from India and around the world.</p></div><div className="hero-badge"><span>DC</span><small>YOUR DAILY BRIEFING</small></div></section>
    <div className="section-heading"><div><span className="eyebrow">THE NEWSROOM</span><h2>Latest stories</h2></div><span className="live-dot">Updated stories</span></div>
    <div className="category-bar">{categories.map(c => <button key={c} className={category===c?"active":""} onClick={() => setCategory(c)}>{c}</button>)}</div>
    {error && <div className="notice error">{error}. Check that the backend is running.</div>}
    {!error && articles.length === 0 && <div className="empty"><div className="empty-icon">✦</div><h3>Your newsroom starts here</h3><p>No published stories yet. Log in to the admin dashboard to create your first article.</p><Link className="button" to="/admin">Open Admin Dashboard</Link></div>}
    <div className="news-grid">{articles.map((a, i) => <article className={`news-card ${i===0?"featured":""}`} key={a.id}>
      <Link to={`/news/${a.slug}`} className="card-media"><Media article={a}/></Link><div className="card-copy"><div className="meta"><span>{a.category}</span><span>{fmtDate(a.published_at)}</span></div><h3><Link to={`/news/${a.slug}`}>{a.title}</Link></h3><p>{a.excerpt || a.content.slice(0, 150)}</p><Link className="read-more" to={`/news/${a.slug}`}>Read story ↗</Link></div>
    </article>)}</div>
  </main><Footer/></>;
}
function ArticlePage() {
  const { slug } = useParams();
  const trackedSlug = useRef("");
  const [article, setArticle] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    request(`/api/articles/slug/${encodeURIComponent(slug)}`).then(setArticle).catch(e => setError(e.message));
    if (trackedSlug.current !== slug) {
      trackedSlug.current = slug;
      let sessionId = sessionStorage.getItem("news_analytics_session");
      if (!sessionId) { sessionId = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`); sessionStorage.setItem("news_analytics_session", sessionId); }
      request("/api/track", { method:"POST", body:JSON.stringify({ sessionId, path:`/news/${slug}`, articleSlug:slug }) }).catch(() => {});
    }
  }, [slug]);
  if (error) return <><Header/><main className="wrap empty"><h2>Story not found</h2><p>{error}</p><Link to="/">Back to latest news</Link></main></>;
  if (!article) return <><Header/><main className="wrap loading">Loading story…</main></>;
  return <><Header/><main className="wrap article-layout"><article className="article-page"><Link to="/" className="back-link">← All news</Link><div className="meta"><span>{article.category}</span><span>{fmtDate(article.published_at)}</span></div><h1>{article.title}</h1><p className="article-deck">{article.excerpt}</p><div className="byline">By <strong>{article.author}</strong> · Updated {fmtDate(article.updated_at)}</div><Media article={article} large/><div className="article-content">{article.content.split(/\n{2,}/).map((p,i)=><p key={i}>{p}</p>)}</div>{article.source_url && <p className="source">Source: <a href={article.source_url} target="_blank" rel="noreferrer">View original source ↗</a></p>}<div className="editorial-note">Our newsroom aims to publish accurate information. Please contact the editor to report a correction.</div></article><aside><span className="eyebrow">DAILY CURRENT</span><h3>Stay informed.</h3><p>Read the latest stories from our newsroom.</p><Link to="/" className="button button-light">More stories</Link></aside></main><Footer/></>;
}
function Admin() {
  const [token, setToken] = useState(() => sessionStorage.getItem("news_token") || "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [articles, setArticles] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title:"", excerpt:"", content:"", category:"India", author:"News Desk", mediaUrl:"", mediaType:"", sourceUrl:"", status:"draft" });
  const [file, setFile] = useState(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [breaking, setBreaking] = useState([]);
  const [feedError, setFeedError] = useState("");
  const [feedLoading, setFeedLoading] = useState(false);
  const setField = (key, value) => setForm(prev => ({...prev, [key]:value}));
  async function loadDashboard(t = token) {
    const [articleData, statData] = await Promise.all([request("/api/admin/articles", {}, t), request("/api/admin/stats", {}, t)]);
    setArticles(articleData); setStats(statData);
    try { setFeedLoading(true); setFeedError(""); const feed = await request("/api/admin/breaking-news", {}, t); setBreaking(feed.items || []); }
    catch (e) { setFeedError(e.message); }
    finally { setFeedLoading(false); }
  }
  function useHeadline(item) {
    setEditingId(null);
    setForm({ title:item.title, excerpt:"", content:"", category:"India", author:"News Desk", mediaUrl:"", mediaType:"", sourceUrl:item.link, status:"draft" });
    setFile(null); setRightsConfirmed(false); setMessage("Headline added to your draft form. Write original copy and verify the facts before publishing.");
    window.scrollTo({ top:0, behavior:"smooth" });
  }
  useEffect(() => { if (token) loadDashboard().catch(e => { setError(e.message); setToken(""); sessionStorage.removeItem("news_token"); }); }, []);
  async function login(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const data = await request("/api/auth/login", { method:"POST", body:JSON.stringify({username,password}) });
      sessionStorage.setItem("news_token", data.token); setToken(data.token); setMessage("Logged in successfully."); await loadDashboard(data.token);
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  function resetForm() { setEditingId(null); setForm({title:"",excerpt:"",content:"",category:"India",author:"News Desk",mediaUrl:"",mediaType:"",sourceUrl:"",status:"draft"}); setFile(null); setRightsConfirmed(false); setMessage(""); }
  function editArticle(a) {
    setEditingId(a.id); setForm({title:a.title,excerpt:a.excerpt,content:a.content,category:a.category,author:a.author,mediaUrl:a.media_url,mediaType:a.media_type,sourceUrl:a.source_url,status:a.status}); setFile(null); setRightsConfirmed(false); window.scrollTo({top:0,behavior:"smooth"});
  }
  async function save(e) {
    e.preventDefault();
    if (file && !rightsConfirmed) { setError("Please confirm you own or are licensed to use the selected media before uploading it."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      let mediaUrlValue = form.mediaUrl, mediaTypeValue = form.mediaType;
      if (file) {
        const fd = new FormData(); fd.append("file", file);
        const uploaded = await request("/api/admin/upload", {method:"POST", body:fd}, token);
        mediaUrlValue = uploaded.url; mediaTypeValue = uploaded.mediaType;
      }
      const payload = {...form, mediaUrl:mediaUrlValue, mediaType:mediaTypeValue};
      const saved = await request(editingId ? `/api/admin/articles/${editingId}` : "/api/admin/articles",
        {method:editingId?"PUT":"POST",body:JSON.stringify(payload)},token);
      setMessage(`Story ${saved.status === "published" ? "published" : "saved as draft"} successfully.`);
      resetForm(); await loadDashboard();
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  async function remove(id) {
    if (!window.confirm("Delete this story? This cannot be undone.")) return;
    try { await request(`/api/admin/articles/${id}`, {method:"DELETE"}, token); setMessage("Story deleted."); await loadDashboard(); }
    catch(e) { setError(e.message); }
  }
  function logout() { sessionStorage.removeItem("news_token"); setToken(""); setArticles([]); setStats(null); setBreaking([]); resetForm(); }
  if (!token) return <><Header/><main className="wrap admin-login"><div className="login-panel"><span className="eyebrow">NEWSROOM ACCESS</span><h1>Admin login</h1><p>Sign in to write, upload and manage news stories.</p>{error && <div className="notice error">{error}</div>}<form onSubmit={login} className="form-stack"><label>Username<input value={username} onChange={e=>setUsername(e.target.value)} required autoComplete="username"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label><button className="button" disabled={busy}>{busy?"Signing in…":"Sign in securely"}</button></form><p className="hint">Admin credentials are set in backend/.env. Do not use a weak password.</p></div></main><Footer/></>;
  return <><Header/><main className="wrap admin-wrap"><div className="admin-top"><div><span className="eyebrow">CONTENT MANAGEMENT</span><h1>Newsroom dashboard</h1><p>Create stories, upload media and manage publication status.</p></div><button className="button button-outline" onClick={logout}>Log out</button></div>
    {message && <div className="notice success">{message}</div>}{error && <div className="notice error">{error}</div>}
    <section className="stats-grid">
      <div className="stat-card"><span>Total page views</span><strong>{stats?.totalViews ?? "—"}</strong><small>Tracked across this site</small></div>
      <div className="stat-card"><span>Views today</span><strong>{stats?.todayViews ?? "—"}</strong><small>Local server date</small></div>
      <div className="stat-card"><span>Sessions today</span><strong>{stats?.todaySessions ?? "—"}</strong><small>Approximate, session-based</small></div>
      <div className="stat-card"><span>Published / drafts</span><strong>{stats ? `${stats.published} / ${stats.drafts}` : "—"}</strong><small>Content status</small></div>
    </section>
    <section className="panel popular-panel"><div className="panel-heading"><div><span className="eyebrow">AUDIENCE INSIGHTS</span><h2>Most-read articles</h2></div><span className="hint">Based on tracked article page views</span></div>
      {!stats?.popular?.length ? <p className="hint">Article view data will appear here as readers open published stories.</p> : <div className="popular-list">{stats.popular.map((item,index)=><div className="popular-row" key={item.slug}><span className="popular-rank">{String(index+1).padStart(2,"0")}</span><span className="popular-title">{articles.find(a=>a.slug===item.slug)?.title || item.slug}</span><strong>{item.views} views</strong></div>)}</div>}
    </section>
    <section className="panel breaking-panel"><div className="panel-heading"><div><span className="eyebrow">EDITOR'S BRIEFING</span><h2>Current headlines</h2></div><button className="button button-outline" onClick={()=>loadDashboard().catch(e=>setFeedError(e.message))} disabled={feedLoading}>{feedLoading?"Refreshing…":"Refresh feed"}</button></div>
      <p className="hint">Headlines are discovery leads from a public RSS feed, not verified reporting. Open the source, confirm details, and write your own article before publishing.</p>
      {feedError && <div className="notice error">{feedError}</div>}
      {feedLoading && breaking.length===0 && <p className="hint">Loading current headlines…</p>}
      {!feedLoading && !feedError && breaking.length===0 && <p className="hint">No feed items loaded yet. Use Refresh feed.</p>}
      <div className="breaking-list">{breaking.map((item,i)=><div className="breaking-item" key={`${item.link}-${i}`}><div><strong>{item.title}</strong><small>{item.source} · {item.publishedAt ? fmtDate(item.publishedAt) : "Latest"}</small><a href={item.link} target="_blank" rel="noreferrer">Open source ↗</a></div><button className="text-button" onClick={()=>useHeadline(item)}>Use headline</button></div>)}</div>
    </section>
    <div className="admin-columns"><section className="panel"><div className="panel-heading"><h2>{editingId?"Edit story":"Write a story"}</h2>{editingId&&<button className="text-button" onClick={resetForm}>Cancel edit</button>}</div>
      <form className="form-stack" onSubmit={save}>
        <label>Headline *<input value={form.title} onChange={e=>setField("title",e.target.value)} required maxLength="180" placeholder="Write a clear, accurate headline"/></label>
        <label>Short summary<textarea value={form.excerpt} onChange={e=>setField("excerpt",e.target.value)} rows="2" maxLength="300" placeholder="A short summary for the homepage"/></label>
        <label>News content *<textarea value={form.content} onChange={e=>setField("content",e.target.value)} required rows="8" placeholder="Write the full story. Separate paragraphs with a blank line."/></label>
        <div className="two-fields"><label>Category<select value={form.category} onChange={e=>setField("category",e.target.value)}>{categories.filter(c=>c!=="All").map(c=><option key={c}>{c}</option>)}</select></label><label>Author<input value={form.author} onChange={e=>setField("author",e.target.value)} required/></label></div>
        <label>Upload image or video<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={e=>{setFile(e.target.files?.[0]||null);setRightsConfirmed(false);}}/><small>Supported: JPG, PNG, WEBP, GIF, MP4, WEBM, MOV. Only upload media you created or have permission/licensing to use.</small></label>{file && <label className="rights-check"><input type="checkbox" checked={rightsConfirmed} onChange={e=>setRightsConfirmed(e.target.checked)}/><span>I own this media or have permission/licensing for this use. I have checked any attribution terms.</span></label>}
        {form.mediaUrl && !file && <p className="hint">Current media: <a href={mediaUrl(form.mediaUrl)} target="_blank" rel="noreferrer">Open uploaded file</a></p>}
        <label>Source URL (optional)<input type="url" value={form.sourceUrl} onChange={e=>setField("sourceUrl",e.target.value)} placeholder="https://reliable-source.example/news"/><small>Use this for attribution and verification. A source link alone does not grant permission to reuse their media.</small></label>
        <label>Publication status<select value={form.status} onChange={e=>setField("status",e.target.value)}><option value="draft">Save as draft</option><option value="published">Publish now</option></select></label>
        <button className="button" disabled={busy}>{busy?"Saving…":editingId?"Save changes":"Save story"}</button>
      </form>
    </section><section className="panel stories-panel"><div className="panel-heading"><h2>Stories ({articles.length})</h2><button className="text-button" onClick={()=>loadDashboard().catch(e=>setError(e.message))}>Refresh</button></div>
      {articles.length===0&&<p className="hint">No stories yet. Create your first story on the left.</p>}
      <div className="admin-list">{articles.map(a=><div className="admin-story" key={a.id}><div className="admin-story-copy"><span className={`status ${a.status}`}>{a.status}</span><strong>{a.title}</strong><small>{a.category} · {fmtDate(a.updated_at)}</small>{a.status==="published"&&<Link to={`/news/${a.slug}`} target="_blank">View live story ↗</Link>}</div><div className="story-actions"><button onClick={()=>editArticle(a)}>Edit</button><button className="danger-button" onClick={()=>remove(a.id)}>Delete</button></div></div>)}</div>
    </section></div></main><Footer/></>;
}
function Footer() { return <footer className="site-footer"><div className="wrap footer-main"><div><Link to="/" className="brand footer-brand"><span className="brand-mark">D</span><span>DAILY CURRENT<small>NEWS • EXPLAINERS • UPDATES</small></span></Link><p>Clear facts. Useful context. A smarter daily briefing.</p></div><div className="footer-links"><strong>Explore</strong><Link to="/">Latest news</Link><Link to="/admin">Newsroom login</Link></div><div className="footer-links"><strong>Editorial</strong><span>Verify before publishing</span><span>Credit and rights matter</span></div></div><div className="wrap footer-bottom"><span>© {new Date().getFullYear()} Daily Current. All rights reserved.</span><span>Reporting responsibly starts with us.</span></div></footer>; }
export default function App() {
  return <Routes><Route path="/" element={<Home/>}/><Route path="/news/:slug" element={<ArticlePage/>}/><Route path="/admin" element={<Admin/>}/><Route path="*" element={<><Header/><main className="wrap empty"><h2>Page not found</h2><Link to="/">Return home</Link></main></>}/></Routes>;
}
