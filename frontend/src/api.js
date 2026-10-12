export const API = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
export function mediaUrl(url) {
  if (!url) return "";
  return url.startsWith("http") ? url : `${API}${url}`;
}
export async function request(path, options = {}, token = "") {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
