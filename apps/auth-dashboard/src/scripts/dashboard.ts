import { enhancedActionLocation } from "../lib/action-outcome.js";
import { createAuthorizationTestUrl } from "../lib/oauth-test.js";
import "./dialog.js";

function showToast(
  message: string,
  tone: "error" | "success" = "success",
): void {
  const toast = document.querySelector<HTMLElement>("[data-toast]");
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.hidden = false;
  window.setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

async function apiRequest(
  endpoint: string,
  method: string,
  body?: BodyInit,
): Promise<Record<string, object | string | boolean>> {
  const response = await fetch(endpoint, {
    body,
    credentials: "include",
    headers: { Accept: "application/json" },
    method,
  });
  const parsed: unknown = await response.json().catch(() => ({}));
  const data: Record<string, object | string | boolean> =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, object | string | boolean>)
      : {};
  if (!response.ok) {
    const message =
      typeof data.error === "string"
        ? data.error
        : typeof data.message === "string"
          ? data.message
          : "The request could not be completed.";
    throw new Error(message);
  }
  return data;
}

function showCredential(value: string): void {
  const dialog = document.querySelector<HTMLDialogElement>(
    "[data-credential-dialog]",
  );
  const output = dialog?.querySelector<HTMLElement>("[data-credential]");
  if (!dialog || !output) return;
  output.textContent = value;
  dialog.dataset.locked = "true";
  dialog.showModal();
}

function clearCredential(dialog: HTMLDialogElement): void {
  const output = dialog.querySelector<HTMLElement>("[data-credential]");
  if (output) output.textContent = "";
  delete dialog.dataset.locked;
}

async function copyToClipboard(button: HTMLElement): Promise<void> {
  const value =
    button.dataset.copyValue ??
    document.querySelector<HTMLElement>("[data-credential]")?.textContent;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    const label = button.querySelector<HTMLElement>("[data-copy-label]");
    if (label) {
      label.textContent = "Copied";
      button.dataset.copied = "true";
      window.setTimeout(() => {
        label.textContent = "Copy";
        delete button.dataset.copied;
      }, 1800);
    }
    showToast(
      button.dataset.copyMessage ??
        "Credential copied. Store it somewhere safe.",
    );
  } catch {
    showToast(
      "Could not copy. Select the value and copy it manually.",
      "error",
    );
  }
}

async function startAuthTest(button: HTMLButtonElement): Promise<void> {
  const authorizationUrl = button.dataset.authorizationUrl;
  const clientId = button.dataset.clientId;
  const redirectUri = button.dataset.redirectUri;
  if (!authorizationUrl || !clientId || !redirectUri) {
    showToast("The auth test configuration is incomplete.", "error");
    return;
  }
  const testWindow = window.open("about:blank", "_blank");
  if (!testWindow) {
    showToast("Allow pop-ups to test the auth flow.", "error");
    return;
  }
  testWindow.opener = null;
  button.disabled = true;
  try {
    const url = await createAuthorizationTestUrl({
      authorizationUrl,
      clientId,
      redirectUri,
    });
    testWindow.location.replace(url);
  } catch {
    testWindow.close();
    showToast("The auth test could not be started.", "error");
  } finally {
    button.disabled = false;
  }
}

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const userEditor = target.closest<HTMLElement>("[data-edit-user]");
  if (
    userEditor?.dataset.userId &&
    userEditor.dataset.userName &&
    userEditor.dataset.userEmail
  ) {
    const form = document.querySelector<HTMLFormElement>(
      "[data-user-edit-form]",
    );
    const name = form?.elements.namedItem("name");
    const email = form?.elements.namedItem("email");
    if (
      form &&
      name instanceof HTMLInputElement &&
      email instanceof HTMLInputElement
    ) {
      form.action = `/actions/dashboard/users/${encodeURIComponent(userEditor.dataset.userId)}`;
      name.value = userEditor.dataset.userName;
      email.value = userEditor.dataset.userEmail;
    }
  }
  const copy = target.closest<HTMLElement>("[data-copy]");
  if (copy) await copyToClipboard(copy);

  const authTest = target.closest<HTMLButtonElement>("[data-test-auth]");
  if (authTest) await startAuthTest(authTest);

  const acknowledge = target.closest("[data-acknowledge]");
  if (acknowledge) {
    const dialog = acknowledge.closest<HTMLDialogElement>("dialog");
    if (dialog) {
      clearCredential(dialog);
      dialog.close();
      window.location.reload();
    }
  }

  const action = target.closest<HTMLButtonElement>("[data-endpoint]");
  if (!action?.dataset.endpoint) return;
  const confirmation = action.dataset.confirm;
  if (confirmation && !window.confirm(confirmation)) return;
  action.disabled = true;
  try {
    const data = await apiRequest(
      action.dataset.endpoint,
      action.dataset.method ?? "POST",
    );
    if (typeof data.credential === "string" && data.credential)
      showCredential(data.credential);
    else
      window.location.assign(action.dataset.next ?? window.location.pathname);
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : "Request failed.",
      "error",
    );
    action.disabled = false;
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (!form.matches("[data-enhance]")) return;
  event.preventDefault();
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const data = await apiRequest(form.action, "POST", new FormData(form));
    if (typeof data.credential === "string" && data.credential)
      showCredential(data.credential);
    else
      window.location.assign(
        enhancedActionLocation(
          data,
          form.dataset.next,
          window.location.pathname,
        ),
      );
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : "Request failed.",
      "error",
    );
    if (submit) submit.disabled = false;
  }
});

document.addEventListener("close", (event) => {
  const dialog = event.target;
  if (dialog instanceof HTMLDialogElement) clearCredential(dialog);
});

for (const input of document.querySelectorAll<HTMLInputElement>(
  "[data-table-search], [data-list-search]",
)) {
  input.addEventListener("input", () => {
    for (const item of document.querySelectorAll<HTMLElement>(
      "[data-search-value]",
    )) {
      item.hidden = !item.dataset.searchValue?.includes(
        input.value.trim().toLowerCase(),
      );
    }
  });
}
