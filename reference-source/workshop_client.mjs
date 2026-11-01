// Browser-side connection between the Goop Editor and the two Workshop sites.
// Keep game packages on the existing package API; Workshop holds durable projects.

const HOSTS = Object.freeze({
  "prime.mikeybox.ai": "https://workshop.mikeybox.ai",
  "fab.mikeybox.ai": "https://fabshop.mikeybox.ai",
});

export function workshopOriginFor(hostname, override = "") {
  if (override) return new URL(override).origin;
  return HOSTS[String(hostname || "").toLowerCase()] || "";
}

// Prime and Fabrication are partner sites: each editor can hand workspaces to the other, copy them into the other
// site's Workshop, and (once the user links both Workshop sign-ins) list and save the other site's builds.
const SITES = Object.freeze({
  "prime.mikeybox.ai": Object.freeze({ key: "prime", name: "Prime", editorOrigin: "https://prime.mikeybox.ai",
    workshopOrigin: "https://workshop.mikeybox.ai", peer: "fab.mikeybox.ai" }),
  "fab.mikeybox.ai": Object.freeze({ key: "fab", name: "Fabrication", editorOrigin: "https://fab.mikeybox.ai",
    workshopOrigin: "https://fabshop.mikeybox.ai", peer: "prime.mikeybox.ai" }),
});

// This editor's site and its partner. overrides (local/preview builds and tests) may name the site key ("prime" or
// "fab") and replace any origin: { site, workshopOrigin, peerWorkshopOrigin, peerEditorOrigin }.
export function crossSiteFor(hostname, overrides = {}) {
  const byKey = Object.values(SITES).find((site) => site.key === overrides.site);
  const self = byKey || SITES[String(hostname || "").toLowerCase()];
  if (!self) return null;
  const peer = SITES[self.peer];
  const origin = (value, fallback) => (value ? new URL(value).origin : fallback);
  return {
    self: { key: self.key, name: self.name, workshopOrigin: origin(overrides.workshopOrigin, self.workshopOrigin) },
    peer: { key: peer.key, name: peer.name, editorOrigin: origin(overrides.peerEditorOrigin, peer.editorOrigin),
      workshopOrigin: origin(overrides.peerWorkshopOrigin, peer.workshopOrigin) },
  };
}

// Direct send between the two editors: the sender opens the partner editor with ?receiveWorkspace=<nonce>&from=<key>;
// the receiver posts READY to its opener, the sender answers with TRANSFER, and the receiver acknowledges with
// RECEIVED once the user accepted or declined. Every message must come from the exact partner origin and window and
// carry the same one-time nonce.
export const TRANSFER_MESSAGES = Object.freeze({
  ready: "mikeybox-workspace-ready", transfer: "mikeybox-workspace-transfer", received: "mikeybox-workspace-received",
});

export function newTransferNonce(randomValues = (bytes) => globalThis.crypto.getRandomValues(bytes)) {
  return [...randomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isTransferNonce(value) { return /^[0-9a-f]{32}$/.test(String(value || "")); }

export function acceptTransferMessage(event, { origin, source, type, nonce }) {
  const data = event?.data;
  return !!data && typeof data === "object" && event.origin === origin && (!source || event.source === source) &&
    data.type === type && isTransferNonce(nonce) && data.nonce === nonce;
}

export function transferReceiveLink(peerEditorOrigin, nonce, fromKey) {
  if (!isTransferNonce(nonce)) throw new Error("Invalid transfer code.");
  const url = new URL(peerEditorOrigin);
  url.searchParams.set("receiveWorkspace", nonce);
  url.searchParams.set("from", String(fromKey || ""));
  return url.toString();
}

// Linking is a per-browser opt-in that only holds while both Workshop sign-ins are the same Discord account.
export function sameWorkshopAccount(a, b) {
  return !!a && !!b && a.provider === b.provider && !!a.providerUserId && a.providerUserId === b.providerUserId;
}

export function workshopEditorLink(editorOrigin, projectId) {
  const url = new URL(editorOrigin);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(String(projectId))) throw new Error("Invalid Workshop project ID.");
  url.searchParams.set("workshopProject", projectId);
  return url.toString();
}

export class WorkshopApi {
  constructor(origin, { fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
    this.origin = new URL(origin).origin;
    this.fetchImpl = fetchImpl;
    this.csrfToken = "";
  }

  async request(path, { method = "GET", body, signal } = {}) {
    const url = new URL(path, this.origin);
    if (url.origin !== this.origin) throw new Error("Workshop URL escaped its origin.");
    const headers = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (method !== "GET" && method !== "HEAD" && this.csrfToken) headers["x-csrf-token"] = this.csrfToken;
    const response = await this.fetchImpl(url.toString(), {
      method, headers, credentials: "include", signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let value;
    try { value = await response.json(); }
    catch { throw new Error(`Workshop returned HTTP ${response.status} without JSON.`); }
    if (!response.ok) throw new Error(value?.error?.message || value?.error || `Workshop HTTP ${response.status}`);
    return value?.data;
  }

  // Owner 2026-10-17: a Discord-verified moderator's short-lived pass for 5x the Prime/Fab package-send limits. Owner 2026-10-25:
  // with the Discord gate on, every Verified member's pass, which the package Workers require on every delivery and pickup.
  sendPass() { return this.request("/api/prime-send-pass"); }

  async me() {
    const data = await this.request("/api/me");
    this.csrfToken = typeof data?.csrfToken === "string" ? data.csrfToken : "";
    return data;
  }

  list({ scope = "mine", search = "", sort = "recent", cursor = "" } = {}) {
    const query = new URLSearchParams({ scope, sort });
    if (search) query.set("search", search);
    if (cursor) query.set("cursor", cursor);
    return this.request(`/api/projects?${query}`);
  }

  project(id) { return this.request(`/api/projects/${encodeURIComponent(id)}`); }
  content(id) { return this.request(`/api/projects/${encodeURIComponent(id)}/content`); }
  create(body) { return this.request("/api/projects", { method: "POST", body }); }
  update(id, body) { return this.request(`/api/projects/${encodeURIComponent(id)}`, { method: "PUT", body }); }
  // Permanent: the creator (or a verified Discord moderator) only; the server enforces it.
  deleteProject(id) { return this.request(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }); }
  createInvite(id) { return this.request(`/api/projects/${encodeURIComponent(id)}/invites`, { method: "POST", body: { role: "editor" } }); }
  logout() { return this.request("/auth/logout", { method: "POST", body: {} }); }
  // Owner 2026-10-25: sign in with the one-time 8-digit code the Mikeybox Discord bot gives (#website-login or /login), for
  // browsers that cannot sign in to Discord. The Workshop sets its session cookie on this same-site credentialed request.
  redeemCode(code) { return this.request("/auth/discord/code", { method: "POST", body: { code } }); }

  loginUrl(returnTo = "/") {
    const url = new URL("/auth/discord", this.origin);
    url.searchParams.set("returnTo", returnTo);
    return url.toString();
  }

  realtimeUrl(projectId, documentId = "workspace") {
    const url = new URL(`/api/realtime/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`, this.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }
}
