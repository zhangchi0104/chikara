export const signUpStyles = `
:root {
  color-scheme: light;
  --ink: #172033;
  --ink-soft: #5c667a;
  --nav: #111827;
  --paper: #ffffff;
  --line: #dce1e8;
  --line-strong: #c4ccd7;
  --signal: #c9471b;
  --signal-hover: #a83a16;
  --signal-soft: #fff0e9;
  --focus: #b43f17;
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-synthesis: none;
}

* {
  box-sizing: border-box;
}

html {
  min-width: 320px;
  background: var(--nav);
}

body {
  min-width: 320px;
  min-height: 100vh;
  min-height: 100svh;
  margin: 0;
  background: var(--nav);
  color: var(--ink);
  font-size: 15px;
  line-height: 1.5;
}

button,
input {
  font: inherit;
}

button,
a {
  -webkit-tap-highlight-color: transparent;
}

a {
  color: inherit;
}

button {
  cursor: pointer;
}

.signup-shell {
  display: grid;
  min-height: 100vh;
  min-height: 100svh;
  grid-template-columns: minmax(340px, 0.92fr) minmax(520px, 1.08fr);
}

.identity-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: clamp(32px, 5vw, 72px);
  color: var(--paper);
}

.brand {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 11px;
  color: var(--paper);
  font-size: 19px;
  font-weight: 750;
  letter-spacing: -0.02em;
}

.brand-mark {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 9px;
  background: var(--signal);
  color: var(--paper);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.identity-copy {
  width: min(100%, 660px);
  margin-block: auto;
  padding-block: 48px 28px;
}

.identity-copy h1 {
  max-width: 14ch;
  margin: 0;
  color: var(--paper);
  font-size: clamp(48px, 5vw, 72px);
  font-weight: 720;
  letter-spacing: -0.04em;
  line-height: 0.98;
  text-wrap: balance;
}

.route-map {
  display: block;
  width: min(100%, 560px);
  height: auto;
  margin-top: clamp(38px, 7vh, 72px);
  overflow: visible;
}

.route-map path {
  stroke: #7f8ca2;
}

.route-map circle:first-of-type {
  fill: var(--signal);
}

.route-map circle:last-of-type {
  fill: var(--nav);
  stroke: #d7deea;
}

.assurance {
  display: grid;
  max-width: 55ch;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 3px 13px;
  padding-top: 20px;
  border-top: 1px solid #354158;
}

.assurance-icon {
  display: grid;
  width: 28px;
  height: 28px;
  grid-row: 1 / span 2;
  place-items: center;
  color: #ff8a5d;
}

.assurance-icon svg {
  width: 26px;
  height: 26px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.assurance strong {
  font-size: 14px;
}

.assurance p {
  grid-column: 2;
  margin: 1px 0 0;
  color: #bdc6d5;
}

.protocol {
  grid-column: 2;
  margin-top: 12px;
  color: #aeb8c9;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.signup-sheet {
  display: grid;
  min-width: 0;
  margin: clamp(18px, 3vw, 44px) clamp(18px, 3vw, 44px) clamp(18px, 3vw, 44px) 0;
  align-content: center;
  padding: clamp(42px, 7vw, 92px);
  border-radius: 16px;
  background: var(--paper);
  box-shadow: 0 24px 64px rgba(4, 11, 24, 0.28);
}

.sheet-inner {
  width: min(100%, 520px);
  margin-inline: auto;
}

.form-heading {
  margin-bottom: 32px;
}

.form-heading h2 {
  margin: 0;
  color: var(--ink);
  font-size: clamp(34px, 4vw, 48px);
  font-weight: 740;
  letter-spacing: -0.035em;
  line-height: 1.08;
  text-wrap: balance;
}

.form-heading p {
  max-width: 48ch;
  margin: 12px 0 0;
  color: var(--ink-soft);
  font-size: 16px;
}

.signup-form {
  display: grid;
  gap: 19px;
}

.field {
  display: grid;
  gap: 7px;
}

.field label {
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
}

.field input {
  width: 100%;
  min-height: 48px;
  padding: 11px 13px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background: var(--paper);
  color: var(--ink);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.field input::placeholder {
  color: #687386;
}

.field input:hover {
  border-color: #98a4b6;
}

.field input:focus-visible {
  border-color: var(--focus);
  outline: 3px solid rgba(180, 63, 23, 0.2);
  outline-offset: 1px;
}

.field-hint {
  margin: 0;
  color: var(--ink-soft);
  font-size: 12px;
}

.password-control {
  position: relative;
}

.password-control input {
  padding-right: 72px;
}

.password-toggle {
  position: absolute;
  top: 6px;
  right: 6px;
  min-width: 58px;
  min-height: 36px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 720;
}

.password-toggle:hover {
  background: #edf0f4;
  color: var(--ink);
}

.password-toggle:focus-visible,
.signin-link:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 3px;
}

.submit-button {
  display: inline-flex;
  width: 100%;
  min-height: 50px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 5px;
  padding: 0 18px;
  border: 0;
  border-radius: 9px;
  background: var(--signal);
  color: var(--paper);
  font-weight: 750;
  transition: background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.submit-button:hover:not(:disabled) {
  background: var(--signal-hover);
  box-shadow: 0 10px 24px rgba(168, 58, 22, 0.24);
}

.submit-button:active:not(:disabled) {
  transform: translateY(1px);
}

.submit-button:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 3px;
}

.submit-button:disabled {
  cursor: wait;
  opacity: 0.72;
}

.submit-button[data-loading="true"]::before {
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255, 255, 255, 0.42);
  border-top-color: var(--paper);
  border-radius: 50%;
  animation: spin 700ms linear infinite;
  content: "";
}

.status-message {
  margin: 0;
  padding: 12px 14px;
  border-radius: 9px;
  font-size: 13px;
}

.status-message[data-tone="error"] {
  border: 1px solid #f4c7b5;
  background: var(--signal-soft);
  color: #7c2d12;
}

.status-message[data-tone="success"] {
  border: 1px solid #acd8c7;
  background: #e8f5ef;
  color: #0e5a43;
}

.signin-note {
  margin: 24px 0 0;
  padding-top: 22px;
  border-top: 1px solid var(--line);
  color: var(--ink-soft);
  text-align: center;
}

.signin-link {
  color: var(--ink);
  font-weight: 720;
  text-underline-offset: 3px;
}

.signin-link:hover {
  color: var(--signal-hover);
}

`;
