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
    throw new Error(payload.message || payload.error || "Request failed");
  }
  if (payload.url) window.location.assign(payload.url);
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
    <title>${title} · Chikara</title>
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
    `<h1>Sign in to Chikara</h1>
    <form data-form>
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
    await request("/api/auth/sign-in/email", {
      email: values.get("email"),
      password: values.get("password"),
      rememberMe: true,
    });
  } catch (error) { showError(error); }
});`,
  );
}

export function signUpPage(): string {
  return page(
    "Create account",
    `<h1>Create a Chikara account</h1>
    <form data-form>
      <label>Name <input name="name" autocomplete="name" required></label>
      <label>Email <input name="email" type="email" autocomplete="email" required></label>
      <label>Password <input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
      <button type="submit">Create account</button>
      <p data-error hidden></p>
    </form>
    <p class="muted">Already registered? <a data-sign-in href="/sign-in">Sign in</a></p>`,
    `
document.querySelector("[data-sign-in]").search = window.location.search;
document.querySelector("[data-form]").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = new FormData(event.currentTarget);
  try {
    await request("/api/auth/sign-up/email", {
      name: values.get("name"),
      email: values.get("email"),
      password: values.get("password"),
    });
  } catch (error) { showError(error); }
});`,
  );
}

export function consentPage(): string {
  return page(
    "Authorize",
    `<h1>Authorize this client</h1>
    <p><strong data-client>Unknown client</strong> is requesting access.</p>
    <p class="muted">Requested scopes: <span data-scopes>none</span></p>
    <form method="post">
      <div class="actions">
        <button name="accept" value="false" type="submit">Deny</button>
        <button name="accept" value="true" type="submit">Allow</button>
      </div>
    </form>`,
    `
const clientId = query.get("client_id") || "Unknown client";
const scope = query.get("scope") || "";
document.querySelector("[data-client]").textContent = clientId;
document.querySelector("[data-scopes]").textContent = scope || "none";`,
  );
}
