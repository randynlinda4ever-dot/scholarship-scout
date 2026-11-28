import type { FormEvent } from "react";
import { BrandMark } from "../../components/BrandMark";
import "./StartHomePage.css";

type StartHomePageProps = {
  email: string;
  onEmailChange: (value: string) => void;
  onEmailSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onGoogleSignIn: () => void;
  onContinueGuest: () => void;
  onReviewLegal: () => void;
  message: string;
  busy: boolean;
  online: boolean;
  configured: boolean;
  authReady: boolean;
  isAnonymous: boolean;
  cooldownSeconds: number;
};

export function StartHomePage({
  email,
  onEmailChange,
  onEmailSubmit,
  onGoogleSignIn,
  onContinueGuest,
  onReviewLegal,
  message,
  busy,
  online,
  configured,
  authReady,
  isAnonymous,
  cooldownSeconds,
}: StartHomePageProps) {
  return (
    <main className="start-home">
      <header className="start-home-header">
        <a className="start-home-brand" href="/" aria-label="Scholarship Scout home">
          <BrandMark className="start-home-brand-mark" />
          <span>
            <b>Scholarship Scout</b>
            <small>STUDENT SCHOLARSHIP WORKSPACE</small>
          </span>
        </a>
        <button className="start-home-legal-link" type="button" onClick={onReviewLegal}>
          Terms &amp; privacy
        </button>
      </header>

      <section className="start-home-hero" aria-labelledby="start-home-title">
        <div className="start-home-hero-copy">
          <p className="start-home-eyebrow">Scholarship planning, in one place.</p>
          <h1 id="start-home-title">Find scholarships. Stay on top of applications.</h1>
          <p className="start-home-lead">
            Find public scholarships, track deadlines, and organize applications in one place.
          </p>
          <div className="start-home-feature-list">
            <div><span aria-hidden="true">01</span><p><b>Discover scholarships</b><small>Find public awards, then confirm details with the sponsor.</small></p></div>
            <div><span aria-hidden="true">02</span><p><b>Stay organized</b><small>Track deadlines, essays, documents, and progress.</small></p></div>
            <div><span aria-hidden="true">03</span><p><b>Use practical resources</b><small>Use checklists, cost comparisons, and scam guidance.</small></p></div>
          </div>
        </div>

        <section className="start-home-auth" aria-labelledby="start-home-signin-title">
          <div className="start-home-auth-heading">
            <span className="start-home-auth-icon" aria-hidden="true">S</span>
            <div>
              <p className="start-home-eyebrow">YOUR ACCOUNT</p>
              <h2 id="start-home-signin-title">{isAnonymous ? "Connect your account" : "Sign in to get started"}</h2>
            </div>
          </div>
          <p className="start-home-auth-copy">
            {isAnonymous
              ? "This temporary browser account has saved sponsor records. Connect Google to keep access to them."
              : "Sign in with email or Google. Your workspace stays encrypted in this browser."}
          </p>

          {!authReady ? <p className="start-home-session-status" role="status">Checking for an existing account session…</p> : null}

          {isAnonymous ? null : (
            <>
              <form className="start-home-email-form" onSubmit={onEmailSubmit}>
                <label htmlFor="start-home-email">Email address</label>
                <input
                  id="start-home-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="you@example.com"
                />
                <button
                  className="start-home-primary"
                  type="submit"
                  disabled={!configured || busy || !online || !email.trim() || cooldownSeconds > 0}
                >
                  {busy ? "Sending sign-in link…" : cooldownSeconds > 0 ? `Try again in ${cooldownSeconds}s` : "Continue with email"}
                </button>
              </form>
              <div className="start-home-auth-divider"><span>or</span></div>
            </>
          )}

          <button
            type="button"
            className="start-home-google"
            disabled={!configured || busy || !online}
            onClick={onGoogleSignIn}
          >
            <span className="start-home-google-mark" aria-hidden="true">G</span>
            {isAnonymous ? "Connect Google account" : "Continue with Google"}
          </button>

          {!configured ? <p className="start-home-message" role="status">Account sign-in is not configured in this deployment. The workspace remains unavailable until cloud authentication is configured.</p> : null}
          {!online ? <p className="start-home-message" role="status">You are offline. Connect to the internet to sign in or create an account.</p> : null}
          {message ? <p className="start-home-message" role="status" aria-live="polite">{message}</p> : null}
          {!isAnonymous ? <p className="start-home-signup-note">New to Scholarship Scout? Continuing with email or Google can create your account.</p> : null}
          <p className="start-home-auth-footnote">Set a local vault passphrase once on this browser. Keep it safe: you’ll need it to recover your workspace on a new device or after clearing browser data.</p>
          <div className="start-home-guest-divider"><span>or</span></div>
          <button type="button" className="start-home-guest" onClick={onContinueGuest}>Continue without an account</button>
          <p className="start-home-guest-warning">Guest mode stores work only in this browser. Enter your vault passphrase to reopen it. Browser cleanup, private browsing, or device loss can erase access. Guest mode has no account recovery.</p>
        </section>
      </section>

      <section className="start-home-info" aria-label="How Scholarship Scout works">
        <article>
          <span>01 / DISCOVERY</span>
          <h2>Research, then verify</h2>
          <p>Search results are research leads, not verified awards. Always confirm eligibility, deadlines, and application instructions on the sponsor's official website.</p>
        </article>
        <article>
          <span>02 / PRIVATE WORKSPACE</span>
          <h2>Your student records stay local</h2>
          <p>Your profile, tracker, drafts, and worksheets stay encrypted in this browser. Public search sends only state, expected graduation year, and selected category IDs.</p>
        </article>
        <article>
          <span>03 / ACCOUNT</span>
          <h2>Sign in once on this device</h2>
          <p>Sign in to access your account. A separate browser key can unlock this device without sending your vault passphrase to the account provider.</p>
        </article>
      </section>

      <footer className="start-home-footer">
        <span>Scholarship Scout</span>
        <span>Student-first scholarship research and planning</span>
        <button type="button" onClick={onReviewLegal}>Review Terms of Service &amp; Privacy Notice</button>
      </footer>
    </main>
  );
}
