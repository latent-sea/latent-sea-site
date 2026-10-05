// Sign in with Google, for a page: Google's own button drawn into an element,
// and its answer handed on, for Backend.signInWithGoogleToken. The page
// signs in with Google itself and hands the platform Google's ID token, so
// the platform needs no Google secret (platform/README.md, "Sign in with
// Google"). The page's address must be an authorised JavaScript origin of
// the Google client, in the Google Cloud console.
//
//     import { drawGoogleButton } from "./backend/google.js?v=5acfd9881574";
//     await drawGoogleButton(element, CLIENT_ID, (credential, nonce) => backend.signInWithGoogleToken(credential, nonce));

/**
 * Google's button, drawn into this element: pressed, signedIn(credential,
 * nonce) hears Google's answer. Google is given the nonce's hash and puts it
 * in its token; the platform is given the nonce, and checks the two agree.
 */
export async function drawGoogleButton(element, clientId, signedIn, look = {}) {
  await loadGoogle();
  const nonce = randomWords();
  google.accounts.id.initialize({ client_id: clientId, nonce: await sha256(nonce), callback: (made) => signedIn(made.credential, nonce) });
  google.accounts.id.renderButton(element, { theme: "outline", size: "large", text: "signin_with", shape: "pill", ...look });
}

// ON A PHONE, Google's button opens its sign-in in a new tab, and iPhones
// leave that tab white when it is done: the reader is stranded. There,
// drawGoogleButton draws a plain button instead that goes to Google in the
// same tab and comes back to the page (Google's own redirect, for an ID
// token: still no secret). The page's address must then also be an
// authorised redirect URI of the Google client. As the page opens,
// takeGoogleRedirect() takes Google's answer from the address.

const KEPT = "google-sign-in";
const PHONE = () => globalThis.matchMedia?.("(pointer: coarse)").matches ?? false;

/** Google's button, or on a phone a button that goes to Google and back: pressed and signed in, signedIn(credential, nonce) as Google answers - on a phone, as the page opens again (takeGoogleRedirect). */
export async function drawSignIn(element, clientId, signedIn, look = {}, words = "Sign in with Google") {
  if (!PHONE()) return drawGoogleButton(element, clientId, signedIn, look);
  element.replaceChildren();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "google-redirect";
  button.textContent = words;
  button.addEventListener("click", () => goToGoogle(clientId));
  element.append(button);
}

/** To Google in this tab, to come back to this page as it is now, signed in. */
export async function goToGoogle(clientId, back = location.hash) {
  const nonce = randomWords();
  const state = randomWords();
  try { sessionStorage.setItem(KEPT, JSON.stringify({ nonce, state, back })); } catch { /* without it the answer can't be checked, and is refused */ }
  const asked = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  const said = { client_id: clientId, redirect_uri: location.origin + location.pathname, response_type: "id_token", scope: "openid email profile", nonce: await sha256(nonce), state, prompt: "select_account" };
  for (const [name, value] of Object.entries(said)) asked.searchParams.set(name, value);
  location.assign(asked.href);
}

/**
 * Google's answer, if the page has just come back from it: { credential, nonce },
 * or { error } when it came back without one or not as sent; null when it
 * didn't come from Google. The address is put back as it was before.
 */
export function takeGoogleRedirect() {
  const said = new URLSearchParams(location.hash.slice(1));
  if (!said.has("id_token") && !(said.has("error") && said.has("state"))) return null;
  let kept = null;
  try { kept = JSON.parse(sessionStorage.getItem(KEPT) ?? "null"); sessionStorage.removeItem(KEPT); } catch { kept = null; }
  history.replaceState(history.state, "", location.pathname + location.search + (kept?.back ?? ""));
  if (said.get("error")) return { error: said.get("error") === "access_denied" ? "Sign-in was cancelled." : "Google couldn't sign you in. Please try again." };
  if (!kept || said.get("state") !== kept.state) return { error: "The sign-in didn't come back as sent. Please try again." };
  return { credential: said.get("id_token"), nonce: kept.nonce };
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
