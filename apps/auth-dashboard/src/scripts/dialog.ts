const openers = new WeakMap<HTMLDialogElement, HTMLElement>();

export function showDialog(
  dialog: HTMLDialogElement,
  opener?: HTMLElement,
): void {
  if (opener) openers.set(dialog, opener);
  if (!dialog.open) dialog.showModal();
}

export function hideDialog(dialog: HTMLDialogElement): void {
  if (!dialog.dataset.locked && dialog.open) dialog.close();
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const opener = target.closest<HTMLElement>("[data-open-dialog]");
  if (opener?.dataset.openDialog) {
    const dialog = document.getElementById(opener.dataset.openDialog);
    if (dialog instanceof HTMLDialogElement) showDialog(dialog, opener);
  }

  const closer = target.closest("[data-close-dialog]");
  const dialog = closer?.closest("dialog");
  if (dialog instanceof HTMLDialogElement) hideDialog(dialog);
});

for (const dialog of document.querySelectorAll<HTMLDialogElement>("dialog")) {
  dialog.addEventListener("cancel", (event) => {
    if (dialog.dataset.locked) event.preventDefault();
  });
  dialog.addEventListener("close", () => {
    const opener = openers.get(dialog);
    openers.delete(dialog);
    if (opener?.isConnected) opener.focus();
  });
}
