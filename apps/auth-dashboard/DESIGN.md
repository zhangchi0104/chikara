---
name: Otakuma Auth Dashboard
description: A precise identity operations workbench for one trusted operator.
colors:
  ink: "#172033"
  ink-soft: "#5c667a"
  navigation: "#111827"
  navigation-soft: "#202b40"
  paper: "#ffffff"
  canvas: "#f4f6f9"
  line: "#dce1e8"
  line-strong: "#c4ccd7"
  signal-orange: "#c9471b"
  signal-orange-hover: "#a83a16"
  signal-orange-soft: "#fff0e9"
  focus: "#b43f17"
  success: "#17765a"
  danger: "#b42318"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(48px, 7vw, 88px)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(28px, 3vw, 38px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.055em"
  code:
    fontFamily: "SFMono-Regular, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "8px"
  control: "9px"
  medium: "10px"
  surface: "12px"
  feature: "14px"
  dialog: "15px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.signal-orange}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "0 15px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.signal-orange-hover}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "0 15px"
    height: "40px"
  data-surface:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 11px"
    height: "42px"
---

# Design System: Otakuma Auth Dashboard

## Overview

**Creative North Star: “The Identity Workbench”**

Otakuma Auth is a compact operations console: dependable, direct, and quiet enough
to keep attention on identity data. Auth0 supplies the familiar management
grammar while Cloudflare supplies the dense, infrastructure-oriented
workbench. Brand appears through ink navy, paper-white working surfaces, and a
rare warm-orange signal.

The system avoids a generic dashboard of decorative metric cards. APIs and
their Applications are the organizing relationship, with lists and details
kept close enough to support fast operational comparison.

Authentication uses the same visual world at a more declarative scale: a dark
identity field holds product and security context while a white credential
sheet keeps the one-way bootstrap or sign-in task focused.

Signed-in account surfaces use the same workbench vocabulary at a calmer,
personal scale. A dark account rail anchors a paper-white identity ledger so
members can verify who they are and protect their sign-in; management entry
remains an administrator-only affordance.

Account protection is expressed once through a shared state-driven panel. It
sits below the personal Profile record for every member and beside Passkeys on
the administrator Security page without changing its setup or recovery
contract.

**Key characteristics:**

- Compact tables.
- Strong information hierarchy.
- First-party system typography.
- Crisp line icons.
- Explicit destructive states.
- Responsive master-detail navigation.
- Focused personal identity records.
- Shared state-driven account security.

## Colors

The palette is a restrained navy-neutral foundation with orange reserved for
intent and selection.

### Primary

- **Signal Orange** (`#c9471b`): primary creation actions, selected object
  emphasis, and the brand mark.
- **Deep Signal Orange** (`#a83a16`): hover and pressed emphasis.
- **Signal Wash** (`#fff0e9`): selected rows and operational warnings.

### Neutral

- **Ink Navy** (`#172033`): primary text.
- **Navigation Navy** (`#111827`): persistent navigation and credential blocks.
- **Paper White** (`#ffffff`): forms and working surfaces.
- **Canvas Grey** (`#f4f6f9`): application background.
- **Rule Grey** (`#dce1e8`): borders and dividers.

**The Signal Rule.** Orange marks an action or selected object; it is never
used as broad decoration.

## Typography

**Display and body font:** Inter with native system fallbacks.  
**Code font:** SFMono-Regular with Consolas fallback.

The type system is neutral and highly legible. Tight tracking gives page and
detail headings authority while uppercase micro-labels support scanning.

- **Display** (700, `clamp(48px, 7vw, 88px)`, 0.98): authentication context
  and security orientation.
- **Headline** (700, `clamp(28px, 3vw, 38px)`, 1.12): page titles.
- **Title** (700, `21–25px`): details, dialogs, and empty states.
- **Body** (400, `15px`, 1.5): operational content, capped near 65 characters
  where prose appears.
- **Label** (700, `11–13px`): table headers, navigation groups, and field names.

## Layout

Desktop uses a sticky 240px navigation rail and a fluid workspace with
`24–64px` horizontal padding. APIs and Applications use a 38/62 master-detail
split; Users use a full-width table. At 820px the rail becomes a fixed bottom
navigation and details become drill-in views. At 520px multi-column forms stack
and create actions collapse to their icons.

Bootstrap and sign-in use a two-part desktop shell: a fluid dark context field
beside a 440–620px white form sheet. At 820px the shell stacks, shortens the
context field, and removes supporting copy before the form.

Personal profile surfaces use a persistent 240px account rail and a centered
identity workspace. The rail contains only Profile, an administrator-only path
back to management, and the account menu; it never exposes management
navigation to a member. At 820px it collapses into a compact dark product bar.
At compact widths, definition rows stack labels over values and visible labels
may collapse to icons, but accessible names and full hit targets remain.

The shared two-factor panel spans the Profile workspace below identity content
and occupies one column beside Passkeys in the administrator Security grid. The
Security grid becomes one column below 980px. At 520px, setup controls stack,
small actions retain a 44px minimum height, and recovery codes collapse from
two columns to one.

Spacing follows a practical 4/8/16/24/40px rhythm. Dense data rows retain at
least 42px control height and generous dialog padding.

## Elevation & Depth

The system is flat by default. Tonal backgrounds, one-pixel rules, and selected
row fills establish structure. Only transient overlays float: dialogs use a
deep shadow and toasts use a smaller ambient shadow.

The account menu is transient too. It opens above the dark sidebar foot or
below the compact profile bar and keeps its width inside the viewport.

## Shapes

Controls use 9px corners, persistent data surfaces use 12px, and modal dialogs
use 15px. Pills are reserved for compact status badges. Borders stay thin and
neutral; radius should soften operational geometry without turning it playful.

## Components

### Buttons

- **Primary:** orange fill, white text, 40px minimum height, 9px radius.
- **Secondary:** paper fill and a strong neutral border.
- **Danger:** restrained red text until confirmation makes the consequence
  explicit.
- **Focus:** a visible 3px warm outline with a 2px offset.

### Cards / Containers

Data surfaces use paper white, a one-pixel rule-grey border, and no resting
shadow. Master-detail surfaces keep their divider within the shared perimeter.

### Inputs / Fields

Inputs use white fill, strong neutral borders, 9px corners, and at least 42px
height. Helper text is ink-soft. Errors stay next to the action that produced
them and also surface through the live toast region.

### Navigation

Desktop navigation is dark, compact, and persistent. The active item receives
a tonal navy fill and orange icon. Mobile navigation uses the same visual roles
in a three-column bottom bar. Profile uses the same rail vocabulary with only
personal account navigation; on mobile it becomes a compact top bar rather
than a one-item bottom navigation. The account trigger carries avatar, account
name, and access label in roomy contexts; compact contexts retain the avatar
and an accessible name.

### Account Menu

The account menu is a button-controlled white popover with a 12px corner,
neutral border, and ambient shadow. Its identity block precedes Profile and Log
out; the current destination uses a tonal grey fill and an orange icon. Light
and dark trigger variants inherit their host surface instead of creating a new
navigation style.

Arrow Down opens the menu and places focus on its first item. Arrow Up and Arrow
Down wrap among items; Escape closes the menu and restores trigger focus when
focus was inside; activation outside closes it. Keep `aria-controls`,
`aria-expanded`, `aria-haspopup="menu"`, and the menu/menuitem roles in sync.

### Two-Factor Authentication

The shared two-factor panel keeps the same behavior on Profile and
administrator Security. Its header pairs an **Enabled** or **Not enabled** badge
with a live status sentence; the body exposes only actions valid for that
state. Disabled accounts offer setup. Enabled accounts offer password-confirmed
disablement and recovery-code regeneration.

Enrollment begins with current-password confirmation, then expands into two
numbered steps: add the manual setup key or open its `otpauth:` deep link, then
verify one six-digit authenticator code. The setup key uses the dark monospace
secret treatment and remains transient. Do not generate a third-party QR code
or send the setup URI outside Otakuma Auth.

Recovery codes appear once in a dark monospace dialog after verification or
explicit regeneration. Hide the close control and block Escape while the codes
are visible; only **I saved these codes** clears the transient list and permits
the flow to close. Codes use two columns when space allows and one column at
520px and below.

Use polite live regions for state and copy feedback, adjacent alerts for form
errors, disabled buttons with verb-led loading labels, and `aria-busy` while a
verification is in flight. Focus starts on the password field, moves to the
six-digit code after setup generation, and returns to the relevant trigger on
cancel or dialog close.

**The Local Setup Rule.** Expose the generated key and its `otpauth:` deep link,
but never send the setup URI to a third-party QR service.

**The Recovery Acknowledgement Rule.** Keep one-time recovery codes in a locked
dialog until the member explicitly confirms they are saved.

### Credential Dialog

The newly generated secret appears in a dark monospace block exactly once. The
dialog cannot be dismissed accidentally; the operator must copy or explicitly
acknowledge secure storage before leaving.

## Do's and Don'ts

### Do:

- **Do** preserve the API-to-Applications relationship as the primary
  information architecture.
- **Do** keep destructive consequences beside their action and require
  confirmation.
- **Do** use native controls and clear focus states for keyboard operation.
- **Do** place personal identity and access context before account actions.
- **Do** preserve accessible names and keyboard behavior when account controls
  become compact.
- **Do** reuse the same two-factor states, setup steps, and recovery behavior on
  Profile and administrator Security.
- **Do** announce asynchronous security status, copy feedback, and adjacent
  errors without moving keyboard focus unexpectedly.

### Don't:

- **Don't** call an OAuth Application a “client” in product copy.
- **Don't** turn orange into decorative surface area or add vanity metric cards.
- **Don't** persist, log, or redisplay an Application credential.
- **Don't** hide operational data behind hover-only interactions.
- **Don't** expose administrator navigation or actions to a member account.
- **Don't** send an `otpauth:` setup URI to a third-party QR generator.
- **Don't** allow one-time recovery codes to be dismissed before explicit
  acknowledgement.
