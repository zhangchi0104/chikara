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

async function get(path) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Request failed");
  return payload;
}

function twoFactorURL(payload) {
  const url = new URL("/two-factor", window.location.origin);
  if (oauthQuery) url.search = oauthQuery;
  if (payload && Array.isArray(payload.twoFactorMethods)) {
    for (const method of payload.twoFactorMethods) {
      if (method === "passkey" || method === "totp") {
        url.searchParams.append("method", method);
      }
    }
  }
  return url.toString();
}

function decodeBase64url(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function encodeBase64url(value) {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function authenticationOptions(payload) {
  if (!payload || typeof payload.challenge !== "string") {
    throw new Error("The passkey challenge was incomplete. Start again.");
  }
  return {
    ...payload,
    challenge: decodeBase64url(payload.challenge),
    ...(Array.isArray(payload.allowCredentials)
      ? { allowCredentials: payload.allowCredentials.map((credential) => ({
          ...credential,
          id: decodeBase64url(credential.id),
        })) }
      : {}),
  };
}

async function authenticateWithPasskey() {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error("Passkeys are unavailable in this browser.");
  }
  const options = authenticationOptions(
    await get("/api/auth/passkey/generate-authenticate-options"),
  );
  const credential = await navigator.credentials.get({ publicKey: options });
  if (!credential || !(credential.response instanceof AuthenticatorAssertionResponse)) {
    throw new Error("Passkey verification was cancelled or timed out.");
  }
  const response = credential.response;
  return request("/api/auth/passkey/verify-authentication", {
    response: {
      authenticatorAttachment: credential.authenticatorAttachment,
      id: credential.id,
      rawId: encodeBase64url(credential.rawId),
      response: {
        authenticatorData: encodeBase64url(response.authenticatorData),
        clientDataJSON: encodeBase64url(response.clientDataJSON),
        signature: encodeBase64url(response.signature),
        userHandle: response.userHandle ? encodeBase64url(response.userHandle) : null,
      },
      type: credential.type,
    },
  });
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
      <p class="muted">or</p>
      <button type="button" data-passkey-sign-in aria-describedby="passkey-error">Use a passkey</button>
      <p id="passkey-error" data-error role="alert" hidden></p>
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
      window.location.assign(twoFactorURL(payload));
      return;
    }
    finishAuthentication(payload);
  } catch (error) { showError(error); }
});
const passkeyButton = document.querySelector("[data-passkey-sign-in]");
const passkeyError = document.querySelector("[data-error]");
if (!window.PublicKeyCredential || !navigator.credentials) {
  passkeyButton.disabled = true;
  passkeyError.textContent = "Passkey sign-in is unavailable in this browser. Sign in with your password instead.";
  passkeyError.hidden = false;
} else {
  passkeyButton.addEventListener("click", async () => {
    const label = passkeyButton.textContent;
    passkeyButton.disabled = true;
    passkeyButton.setAttribute("aria-busy", "true");
    passkeyButton.textContent = "Waiting for your passkey…";
    try {
      finishAuthentication(await authenticateWithPasskey());
    } catch (error) {
      showError(error);
      passkeyButton.disabled = false;
      passkeyButton.removeAttribute("aria-busy");
      passkeyButton.textContent = label;
    }
  });
}`,
  );
}

export function twoFactorPage(methods: ReadonlyArray<string> = []): string {
  const filtered = methods.filter(
    (method) => method === "passkey" || method === "totp",
  );
  const passkey = filtered.includes("passkey");
  const totp = filtered.includes("totp");
  const passkeyMarkup = passkey
    ? `<p class="muted">Verify with a passkey registered to this account.</p>
    <button type="button" data-passkey-verification data-unavailable="${
      totp
        ? "Passkey verification is unavailable in this browser. Use another enrolled method."
        : "Passkey verification is unavailable in this browser. Restart sign-in on a device with passkey support."
    }" aria-describedby="verification-error">Use a passkey</button>`
    : "";
  const totpMarkup = totp
    ? `<p class="muted">Enter the six-digit code from your authenticator app.</p>
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
    </form>`
    : "";
  return page(
    "Verify your sign-in",
    `<h1>Verify your sign-in</h1>
    ${passkeyMarkup}
    ${totpMarkup}
    <p id="verification-error" data-error role="alert" hidden></p>`,
    `
const verificationButton = document.querySelector("[data-passkey-verification]");
if (verificationButton) {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    verificationButton.disabled = true;
    showError(new Error(verificationButton.dataset.unavailable || "Passkey verification is unavailable in this browser."));
  } else {
    verificationButton.addEventListener("click", async () => {
      const label = verificationButton.textContent;
      verificationButton.disabled = true;
      verificationButton.setAttribute("aria-busy", "true");
      verificationButton.textContent = "Waiting for your passkey…";
      try {
        finishAuthentication(await authenticateWithPasskey());
      } catch (error) {
        showError(error);
        verificationButton.disabled = false;
        verificationButton.removeAttribute("aria-busy");
        verificationButton.textContent = label;
      }
    });
  }
}
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
