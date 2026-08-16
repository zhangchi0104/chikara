export const signUpResponsiveStyles = `
@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: no-preference) {
  .signup-sheet {
    animation: sheet-arrive 650ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  @keyframes sheet-arrive {
    from {
      clip-path: inset(0 0 2.5% 0 round 16px);
      transform: translateY(10px);
      box-shadow: 0 14px 38px rgba(4, 11, 24, 0.2);
    }
  }
}

@media (max-width: 860px) {
  .signup-shell {
    display: block;
  }

  .identity-field {
    min-height: 360px;
    padding: 28px 24px 66px;
  }

  .identity-copy {
    margin: 46px 0 0;
    padding: 0;
  }

  .identity-copy h1 {
    max-width: 11ch;
    font-size: clamp(42px, 12vw, 64px);
  }

  .route-map {
    width: min(78%, 420px);
    margin-top: 30px;
  }

  .assurance {
    margin-top: 34px;
  }

  .signup-sheet {
    min-height: 0;
    margin: -34px 12px 12px;
    padding: 42px clamp(22px, 7vw, 58px) 48px;
  }
}

@media (max-width: 440px) {
  .identity-field {
    min-height: 0;
    padding: 22px 20px 52px;
  }

  .identity-copy {
    margin-top: 28px;
  }

  .identity-copy h1 {
    font-size: 42px;
  }

  .route-map {
    width: min(70%, 300px);
    margin-top: 16px;
  }

  .assurance {
    margin-top: 18px;
    padding-top: 14px;
    font-size: 12px;
    line-height: 1.4;
  }

  .assurance p {
    margin-top: 0;
  }

  .assurance .protocol {
    display: none;
  }

  .signup-sheet {
    margin-inline: 8px;
    padding: 32px 20px 36px;
    border-radius: 14px;
  }

  .form-heading {
    margin-bottom: 24px;
  }

  .form-heading h2 {
    font-size: 32px;
  }

  .signup-form {
    gap: 16px;
  }

  .signin-note {
    margin-top: 20px;
    padding-top: 18px;
  }
}

@media (max-height: 760px) and (min-width: 861px) {
  .identity-copy h1 {
    font-size: clamp(46px, 5.6vw, 70px);
  }

  .route-map {
    width: min(82%, 470px);
    margin-top: 28px;
  }

  .signup-sheet {
    align-content: start;
    overflow-y: auto;
    padding-block: 46px;
  }
}
`;
