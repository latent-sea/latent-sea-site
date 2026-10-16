// Written into every exported site by tooling/export_web.py. The page was
// built as one version (its <meta name="build">); version.json, never
// cached, names the version published now. When they differ, a newer site
// is out: a tab out of sight, with nothing playing and never touched since
// it opened, is reloaded on to it; otherwise a bar offers the reload, and
// may be put away until the next version. A page someone has done anything
// on - typed, tapped, clicked, pressed a key - is never reloaded by itself:
// what they were in the middle of (a form half filled) is theirs. Asked as
// the page opens, whenever it comes back into sight, and every five minutes.

const BUILT = document.querySelector('meta[name="build"]')?.content ?? "";
const PARAMETER = "build";
let touched = false;
let offered = "";

// a reload asks for the page by a new address, past any cached copy; that address is then tidied away
const here = new URL(location.href);
if (here.searchParams.has(PARAMETER)) {
  here.searchParams.delete(PARAMETER);
  history.replaceState(history.state, "", here.href);
}

// anything done on the page makes it theirs: a choice made by a tap is as much a half-filled form as typing
for (const event of ["input", "change", "keydown", "pointerdown"]) addEventListener(event, () => { touched = true; }, true);

const playing = () => document.documentElement.dataset.playing === "yes";

function reload(version) {
  const next = new URL(location.href);
  next.searchParams.set(PARAMETER, version);
  location.replace(next.href);
}

async function published() {
  try {
    const answer = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    return answer.ok ? (await answer.json()).version ?? null : null;
  } catch {
    return null;
  }
}

function offer(version) {
  if (offered === version) return;
  offered = version;
  document.getElementById("fresh-bar")?.remove();
  const bar = document.createElement("div");
  bar.id = "fresh-bar";
  bar.setAttribute("role", "status");
  bar.style.cssText = "position:fixed;left:50%;top:0.75rem;transform:translateX(-50%);z-index:2147483647;display:flex;gap:0.75rem;align-items:center;"
    + "padding:0.5rem 0.6rem 0.5rem 1rem;border-radius:999px;background:#111;color:#fff;border:1px solid #444;font:600 0.9rem/1.2 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.5)";
  const words = document.createElement("span");
  words.textContent = "This site has been updated.";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Reload";
  button.style.cssText = "font:inherit;padding:0.35rem 0.9rem;border-radius:999px;border:0;background:#fff;color:#000;cursor:pointer";
  button.addEventListener("click", () => reload(version));
  // put away until a newer version still: what is on the page stays as it is
  const later = document.createElement("button");
  later.type = "button";
  later.textContent = "Later";
  later.style.cssText = "font:inherit;padding:0.35rem 0.7rem;border-radius:999px;border:1px solid #666;background:transparent;color:#fff;cursor:pointer";
  later.addEventListener("click", () => bar.remove());
  bar.append(words, button, later);
  document.body.append(bar);
}

async function check() {
  if (!BUILT) return;
  const version = await published();
  if (!version || version === BUILT) return;
  if (document.hidden && !playing() && !touched) reload(version);
  else offer(version);
}

setTimeout(check, 3000);
document.addEventListener("visibilitychange", () => check());
setInterval(check, 5 * 60 * 1000);
