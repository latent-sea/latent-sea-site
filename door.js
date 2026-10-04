// The way in: signing in on the platform (A1, A2) - as a guest, with Google,
// or with a code emailed to the seeker - through the platform's client
// (backend/), and where the world comes from: the platform's host and
// storage, or, opened with ?dev, the developer's machine (world/dev/serve.mjs).
// Every answer is { ok, error }.

import { Backend } from "./backend/backend.js?v=16bf1c83d35f";
import { devFiles, devHost, platformFiles, platformHost } from "./world/world.js?v=16bf1c83d35f";

// public: the platform's address, its publishable key, and the Google client the platform accepts
const PLATFORM = "https://api.latent-sea.com";
const KEY = "sb_publishable_BqVtSYE4ysOb2sHMuFSwMk_HrTAUgLx";
const GOOGLE_CLIENT = "400837578052-jqnhh565es3a92k58u5r2oggdcf7mrkr.apps.googleusercontent.com";

const answer = (reply) => ({ ok: reply.ok, error: reply.ok ? "" : reply.status === 0 ? "The platform can't be reached. Check your connection and try again." : reply.error });

export class Door {
  constructor(backend = new Backend(PLATFORM, KEY, { keptIn: "latent_sea_session" })) {
    this.backend = backend;
  }

  restore() { return this.backend.restore(); }

  async enterAsGuest() { return answer(await this.backend.signInAnonymously()); }

  async requestCode(email) { return answer(await this.backend.requestCode(email)); }

  async enterWithCode(email, code) { return answer(await this.backend.verifyCode(email, code)); }

  /** Google's sign-in button, drawn into this element: pressed, `signedIn` hears Google's answer. */
  async drawGoogleButton(element, signedIn) {
    await loadGoogle();
    // Google is given the nonce's hash and puts it in its token; the platform is given the nonce, and checks the two agree
    const nonce = randomWords();
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT, nonce: await sha256(nonce), callback: (made) => signedIn(made.credential, nonce) });
    google.accounts.id.renderButton(element, { theme: "filled_black", size: "large", text: "continue_with", shape: "pill" });
  }

  async enterWithGoogle(credential, nonce) { return answer(await this.backend.signInWithGoogleToken(credential, nonce)); }

  signOut() { return this.backend.signOut(); }

  /** The seeker's settings, as saved on the platform (backend.sql), or the defaults: { ok, settings, error }. */
  async loadSettings() {
    const reply = await this.backend.select("latent_sea_settings", "select=invert_y");
    if (!reply.ok) return { ...answer(reply), settings: { ...DEFAULTS } };
    return { ok: true, error: "", settings: { ...DEFAULTS, ...(reply.data[0] ?? {}) } };
  }

  /** The seeker's settings saved: their row made the first time, changed after. */
  async saveSettings(settings) {
    const changes = { invert_y: !!settings.invert_y, updated_at: new Date().toISOString() };
    const changed = await this.backend.update("latent_sea_settings", `seeker=eq.${encodeURIComponent(this.backend.playerId())}`, changes);
    if (changed.ok && Array.isArray(changed.data) && changed.data.length) return answer(changed);
    if (!changed.ok) return answer(changed);
    return answer(await this.backend.insert("latent_sea_settings", changes));
  }

  /** Where the world comes from: the platform, as the signed-in seeker. */
  host() { return platformHost(this.backend); }
  files() { return platformFiles(this.backend); }
}

/** What a seeker's settings are until they change them. */
export const DEFAULTS = { invert_y: false };

/** Dev mode: no one signs in; the world comes from the dev server, every module granted; settings kept for the visit. */
export class DevDoor {
  constructor(base = `${location.origin}/dev`) { this.base = base; this.settings = { ...DEFAULTS }; }
  async restore() { return true; }
  async signOut() {}
  async loadSettings() { return { ok: true, error: "", settings: { ...this.settings } }; }
  async saveSettings(settings) { this.settings = { ...this.settings, ...settings }; return { ok: true, error: "" }; }
  host() { return devHost(this.base); }
  files() { return devFiles(this.base); }
}

let loading = null;
function loadGoogle() {
  loading ??= new Promise((done, failed) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = done;
    script.onerror = () => { loading = null; failed(new Error("Google's sign-in didn't load")); };
    document.head.appendChild(script);
  });
  return loading;
}

function randomWords() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(words) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(words));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
