import { signUpResponsiveStyles } from "./sign-up-page.responsive-styles.js";
import { signUpStyles } from "./sign-up-page.styles.js";

const signUpScript = `
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
const form = document.querySelector("[data-form]");
const signInLink = document.querySelector("[data-sign-in]");
const password = document.querySelector("[data-password]");
const passwordToggle = document.querySelector("[data-password-toggle]");
const submitButton = document.querySelector("[data-submit]");
const submitLabel = document.querySelector("[data-submit-label]");
const statusMessage = document.querySelector("[data-status]");

signInLink.search = window.location.search;

passwordToggle.addEventListener("click", () => {
  const isVisible = password.type === "text";
  password.type = isVisible ? "password" : "text";
  passwordToggle.textContent = isVisible ? "Show" : "Hide";
  passwordToggle.setAttribute("aria-pressed", String(!isVisible));
  passwordToggle.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
  password.focus();
});

function showStatus(message, tone) {
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
  statusMessage.setAttribute("role", tone === "error" ? "alert" : "status");
  statusMessage.hidden = false;
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.dataset.loading = String(isLoading);
  submitButton.setAttribute("aria-busy", String(isLoading));
  submitLabel.textContent = isLoading ? "Creating account…" : "Create account";
}

function setComplete() {
  submitButton.disabled = true;
  submitButton.dataset.loading = "false";
  submitButton.setAttribute("aria-busy", "false");
  submitLabel.textContent = "Account created";
}

async function createAccount(body) {
  if (oauthQuery) body.oauth_query = oauthQuery;
  const response = await fetch("/api/auth/sign-up/email", {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    let responseMessage = "We could not create your account. Check your details and try again.";
    if (typeof payload.message === "string") {
      responseMessage = payload.message;
    } else if (typeof payload.error === "string") {
      responseMessage = payload.error;
    }
    throw new Error(responseMessage);
  }
  if (payload.url) {
    window.location.assign(payload.url);
    return true;
  }
  return false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusMessage.hidden = true;
  setLoading(true);
  const values = new FormData(form);
  try {
    const redirected = await createAccount({
      name: values.get("name"),
      email: values.get("email"),
      password: values.get("password"),
    });
    if (!redirected) {
      showStatus("Your account is ready. You can continue by signing in.", "success");
      setComplete();
      signInLink.focus();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "We could not create your account. Try again.";
    showStatus(message, "error");
    setLoading(false);
  }
});
`;

export function signUpPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#111827">
    <title>Create account · Otakuma Auth</title>
    <style>${signUpStyles}${signUpResponsiveStyles}</style>
  </head>
  <body>
    <!--
    THESIS: Account creation is a protected route back to the requesting app, refusing the generic centered login card.
    OWN-WORLD: Full ink-navy canvas, one inset paper sheet, signal-orange action, precise rules, and compact controls.
    STORY: The visitor creates one identity, understands the protected handoff, and continues the signed request.
    FIRST VIEWPORT: Identity and route geometry hold the left field; the complete form sits on one large right-hand sheet.
    FORM: Split assurance, fourth grounded structure; seed key 3e51f2d0; approved comp sign-up-inset-sheet.png.
    FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
    -->
    <main class="signup-shell">
      <section class="identity-field" aria-labelledby="identity-title">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">OA</span>
          <span>Otakuma Auth</span>
        </div>
        <div class="identity-copy">
          <h1 id="identity-title">One identity. A direct route back.</h1>
          <svg class="route-map" viewBox="0 0 560 150" aria-hidden="true">
            <path d="M10 118 H226 L348 24 H550" fill="none" stroke-width="2" vector-effect="non-scaling-stroke" />
            <circle cx="10" cy="118" r="7" />
            <circle cx="550" cy="24" r="9" stroke-width="2" />
          </svg>
        </div>
        <div class="assurance">
          <span class="assurance-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 3 19 6v5c0 4.7-2.9 8.1-7 10-4.1-1.9-7-5.3-7-10V6l7-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </span>
          <strong>Protected handoff</strong>
          <p>When an app sends you here, Otakuma Auth preserves its signed request while you create your account.</p>
          <span class="protocol">OAuth 2.1 · PKCE S256</span>
        </div>
      </section>

      <section class="signup-sheet" aria-labelledby="form-title">
        <div class="sheet-inner">
          <header class="form-heading">
            <h2 id="form-title">Create your account</h2>
            <p>Use one identity to continue with Otakuma Auth.</p>
          </header>

          <form class="signup-form" data-form>
            <div class="field">
              <label for="name">Full name</label>
              <input id="name" name="name" autocomplete="name" placeholder="Your full name" required>
            </div>

            <div class="field">
              <label for="email">Email address</label>
              <input id="email" name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="you@example.com" required>
            </div>

            <div class="field">
              <label for="password">Password</label>
              <div class="password-control">
                <input id="password" data-password name="password" type="password" autocomplete="new-password" minlength="8" aria-describedby="password-hint" required>
                <button class="password-toggle" data-password-toggle type="button" aria-controls="password" aria-label="Show password" aria-pressed="false">Show</button>
              </div>
              <p class="field-hint" id="password-hint">Use at least 8 characters.</p>
            </div>

            <p class="status-message" data-status role="status" aria-live="polite" hidden></p>

            <button class="submit-button" data-submit type="submit" aria-busy="false">
              <span data-submit-label>Create account</span>
            </button>
          </form>

          <p class="signin-note">Already registered? <a class="signin-link" data-sign-in href="/sign-in">Sign in</a></p>
        </div>
      </section>
    </main>
    <script>${signUpScript}</script>
  </body>
</html>`;
}
