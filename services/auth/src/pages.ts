export { signUpPage } from "./sign-up-page.js";

const requestScript = `
const query = new URLSearchParams(window.location.search);
const signedParameterNames = new Set(query.getAll("ba_param"));
const signedQuery = new URLSearchParams();
if (query.has("sig") && signedParameterNames.size > 0) {
  for (const [key, value] of query.entries()) {
    if (key === "sig" || key === "ba_param" || signedParameterNames.has(key)) {
      signedQuery.append(key, value);
    }
  }
}
const oauthQuery = signedQuery.size > 0 ? signedQuery.toString() : undefined;

async function request(path, body) {
  if (oauthQuery) body.oauth_query = oauthQuery;
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && typeof payload === "object"
      ? payload.message || payload.error
      : undefined;
    throw new Error(message || "Request failed");
  }
  return payload;
}

function twoFactorURL() {
  const url = new URL("/two-factor", window.location.origin);
  if (oauthQuery) url.search = oauthQuery;
  return url.toString();
}

function finishAuthentication(payload) {
  if (payload && typeof payload.url === "string") {
    window.location.assign(payload.url);
    return;
  }
  window.location.assign("/");
}

function showError(error) {
  const output = document.querySelector("[data-error]");
  output.textContent = error instanceof Error ? error.message : "Request failed";
  output.hidden = false;
}
`;

function page(title: string, body: string, script: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} · Otakuma Auth</title>
    <style>
      :root { color-scheme: light dark; font: 16px/1.5 system-ui, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: Canvas; color: CanvasText; }
      main { width: min(28rem, calc(100% - 2rem)); padding: 2rem; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 1rem; }
      h1 { margin-top: 0; }
      form { display: grid; gap: 1rem; }
      label { display: grid; gap: 0.35rem; }
      input, button { box-sizing: border-box; width: 100%; min-height: 2.75rem; padding: 0.65rem 0.8rem; font: inherit; border-radius: 0.55rem; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); }
      button { cursor: pointer; font-weight: 650; }
      .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
      [data-error] { color: #c62828; }
      .muted { opacity: 0.72; }
    </style>
  </head>
  <body>
    <main>${body}</main>
    <script>${requestScript}${script}</script>
  </body>
</html>`;
}

export function signInPage(): string {
  return page(
    "Sign in",
    `<h1>Sign in to Otakuma Auth</h1>
    <form method="post" data-form>
      <label>Email <input name="email" type="email" autocomplete="email" required></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">Sign in</button>
      <p data-error hidden></p>
    </form>
    <p class="muted">Need an account? <a data-sign-up href="/sign-up">Create one</a></p>`,
    `
document.querySelector("[data-sign-up]").search = window.location.search;
document.querySelector("[data-form]").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = new FormData(event.currentTarget);
  try {
    const payload = await request("/api/auth/sign-in/email", {
      email: values.get("email"),
      password: values.get("password"),
      rememberMe: true,
    });
    if (payload && payload.twoFactorRedirect === true) {
      window.location.assign(twoFactorURL());
      return;
    }
    finishAuthentication(payload);
  } catch (error) { showError(error); }
});`,
  );
}

export function twoFactorPage(): string {
  return page(
    "Verify your sign-in",
    `<h1>Verify your sign-in</h1>
    <p class="muted">Enter the six-digit code from your authenticator app.</p>
    <form method="post" data-two-factor-form data-endpoint="/api/auth/two-factor/verify-totp">
      <input name="factor" type="hidden" value="totp">
      <label>Authenticator code <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required autofocus></label>
      <button type="submit">Verify and continue</button>
    </form>
    <p class="muted">Or use one of your recovery codes.</p>
    <form method="post" data-two-factor-form data-endpoint="/api/auth/two-factor/verify-backup-code">
      <input name="factor" type="hidden" value="recovery">
      <label>Recovery code <input name="code" autocomplete="off" spellcheck="false" required></label>
      <button type="submit">Use recovery code</button>
    </form>
    <p data-error hidden></p>`,
    `
for (const form of document.querySelectorAll("[data-two-factor-form]")) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    const endpoint = form.dataset.endpoint;
    if (!endpoint) return;
    if (button) button.disabled = true;
    try {
      const payload = await request(endpoint, { code: values.get("code") });
      finishAuthentication(payload);
    } catch (error) {
      showError(error);
      if (button) button.disabled = false;
    }
  });
}`,
  );
}

export function consentPage(): string {
  return page(
    "Authorize",
    `<h1>Authorize this Application</h1>
    <p><strong data-application>This Application</strong> is requesting access.</p>
    <p class="muted">Requested scopes: <span data-scopes>none</span></p>
    <form method="post">
      <div class="actions">
        <button name="accept" value="false" type="submit">Deny</button>
        <button name="accept" value="true" type="submit">Allow</button>
      </div>
    </form>`,
    `
const clientId = query.get("client_id");
const scope = query.get("scope") || "";
document.querySelector("[data-scopes]").textContent = scope || "none";
if (clientId && oauthQuery) {
  request("/api/auth/oauth2/public-client-prelogin", { client_id: clientId })
    .then((payload) => {
      if (payload && typeof payload.client_name === "string") {
        document.querySelector("[data-application]").textContent = payload.client_name;
      }
    })
    .catch(() => {});
}`,
  );
}
