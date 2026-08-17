interface ProfileMenuElements {
  readonly menu: HTMLElement;
  readonly popover: HTMLElement;
  readonly trigger: HTMLButtonElement;
}

function menuElements(menu: HTMLElement): ProfileMenuElements | undefined {
  const trigger = menu.querySelector("[data-profile-menu-trigger]");
  const popover = menu.querySelector("[data-profile-menu-popover]");
  return trigger instanceof HTMLButtonElement && popover instanceof HTMLElement
    ? { menu, popover, trigger }
    : undefined;
}

const menus = Array.from(
  document.querySelectorAll<HTMLElement>("[data-profile-menu]"),
)
  .map(menuElements)
  .filter((menu): menu is ProfileMenuElements => menu !== undefined);

function menuItems(popover: HTMLElement): ReadonlyArray<HTMLElement> {
  return Array.from(popover.querySelectorAll<HTMLElement>('[role="menuitem"]'));
}

function closeMenu(elements: ProfileMenuElements, restoreFocus = false): void {
  elements.popover.hidden = true;
  elements.trigger.setAttribute("aria-expanded", "false");
  if (restoreFocus) elements.trigger.focus();
}

function openMenu(elements: ProfileMenuElements, focusFirst = false): void {
  for (const menu of menus) {
    if (menu !== elements) closeMenu(menu);
  }
  elements.popover.hidden = false;
  elements.trigger.setAttribute("aria-expanded", "true");
  if (focusFirst) menuItems(elements.popover)[0]?.focus();
}

for (const elements of menus) {
  elements.trigger.addEventListener("click", () => {
    if (elements.popover.hidden) openMenu(elements);
    else closeMenu(elements);
  });

  elements.trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    openMenu(elements, true);
  });

  elements.popover.addEventListener("keydown", (event) => {
    const items = menuItems(elements.popover);
    const active = document.activeElement;
    const activeIndex =
      active instanceof HTMLElement ? items.indexOf(active) : -1;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (activeIndex + direction + items.length) % items.length;
    items[nextIndex]?.focus();
  });
}

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Node)) return;
  for (const elements of menus) {
    if (!elements.menu.contains(event.target)) closeMenu(elements);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  for (const elements of menus) {
    if (elements.popover.hidden) continue;
    event.preventDefault();
    closeMenu(elements, elements.menu.contains(document.activeElement));
  }
});
