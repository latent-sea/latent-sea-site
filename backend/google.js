// Sign in with Google, for a page: Google's own button drawn into an element,
// and its answer handed on, for Backend.signInWithGoogleToken. The page
// signs in with Google itself and hands the platform Google's ID token, so
// the platform needs no Google secret (platform/README.md, "Sign in with
// Google"). The page's address must be an authorised JavaScript origin of
// the Google client, in the Google Cloud console.
//
//     import { drawGoogleButton } from "./backend/google.js?v=2780c1afa36a";
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
