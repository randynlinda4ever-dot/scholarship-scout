import type { SettingsPageModel } from '../pageTypes.js';

export function SettingsPage({ model }: { model: SettingsPageModel }) {
  const { authCooldownSeconds, cloudBusy, cloudEmail, cloudMessage, cloudUser, compactView, handleCheckCloudSession, handleCloudSignIn, handleCloudSignOut, isOnline, setCloudEmail, setCompactView, setTheme, supabaseConfigured, theme } = model;
  return <div className="page narrow">
        <div className="page-heading"><div><div className="eyebrow">WORKSPACE PREFERENCES</div><h1>Settings</h1><p>Manage how Scholarship Scout looks and how you connect your cloud account. Your profile and tracker stay local unless you choose to save sponsor records to the cloud.</p></div></div>
        <section className="panel settings-section">
          <div className="panel-heading"><div><h3>Appearance</h3><p className="muted">Choose the theme used across your workspace.</p></div><span className="source-tag">DISPLAY</span></div>
          <div className="settings-choice-row">
            <button type="button" className="theme-toggle" onClick={() => setTheme('dark')} aria-label="Use dark mode" aria-pressed={theme === 'dark'}><span aria-hidden="true">☾</span><span>Dark mode</span></button>
            <button type="button" className="theme-toggle" onClick={() => setTheme('light')} aria-label="Use light mode" aria-pressed={theme === 'light'}><span aria-hidden="true">☀</span><span>Light mode</span></button>
          </div>
          <p className="muted settings-footnote">Your current selection is saved in this browser.</p>
        </section>
        <section className="panel settings-section">
          <div className="panel-heading"><div><h3>Layout density</h3><p className="muted">Choose how much space cards and sections use.</p></div><span className="source-tag">LAYOUT</span></div>
          <button type="button" className="compact-toggle" onClick={() => setCompactView(current => !current)} aria-label={compactView ? 'Switch to comfortable layout' : 'Switch to compact layout'} aria-pressed={compactView}>{compactView ? 'Comfortable view' : 'Compact view'}</button>
          <p className="muted settings-footnote">{compactView ? 'Compact spacing is enabled.' : 'Comfortable spacing is enabled.'}</p>
        </section>
        <section className="panel settings-section">
          <div className="panel-heading"><div><h3>Account & cloud access</h3><p className="muted">Live scholarship search is public and does not require an account. Email sign-in is only needed to save sponsor records to your cloud account. Your student profile, essays, and local tracker remain on this device.</p></div><span className={`status ${cloudUser ? 'status-eligible' : supabaseConfigured ? 'status-likely-eligible' : 'status-not-eligible'}`}>{cloudUser ? cloudUser.is_anonymous ? 'Anonymous account' : 'Signed in' : supabaseConfigured ? 'Public search configured' : 'Setup needed'}</span></div>
          {cloudUser ? <div className="settings-account-state">
            <p><b>{cloudUser.is_anonymous ? 'Anonymous browser session' : 'Connected account'}</b><span>{cloudUser.is_anonymous ? 'No email attached · private to this browser' : cloudUser.email || 'Signed-in account'}</span></p>
            {cloudUser.is_anonymous ? <p className="cloud-config-note">Keep this browser profile to retain access to cloud records in this anonymous session. Clearing browser data or changing devices can make this session unrecoverable; account linking is not enabled in this version.</p> : null}
            <div className="settings-account-actions">
              <button type="button" className="secondary" disabled={cloudBusy} onClick={() => void handleCheckCloudSession()}>Check session status</button>
              {!cloudUser.is_anonymous && <button type="button" className="secondary" disabled={cloudBusy} onClick={() => void handleCloudSignOut()}>Sign out</button>}
            </div>
          </div> : <div className="settings-account-state">
            <p><b>No account connected</b><span>Public live search works without signing in.</span></p>
            <p className="muted">Sign in only when you want to save sponsor records to your cloud account. Your student profile and essays are never uploaded by the search feature.</p>
            <form className="cloud-auth-form settings-auth-form" onSubmit={handleCloudSignIn}>
            <label className="field" htmlFor="cloud-email"><span>Email for sign-in link</span><input id="cloud-email" name="email" type="email" autoComplete="email" required value={cloudEmail} onChange={e=>setCloudEmail(e.target.value)} placeholder="you@example.com"/></label>
            <button className="primary" type="submit" disabled={!supabaseConfigured || cloudBusy || !isOnline || !cloudEmail.trim() || authCooldownSeconds > 0}>{cloudBusy ? 'Sending…' : authCooldownSeconds > 0 ? `Try again in ${authCooldownSeconds}s` : 'Send sign-in link'}</button>
            </form>
          </div>}
          {!supabaseConfigured && <p className="cloud-config-note" role="status">Cloud access is not available in this app build because the public Supabase browser configuration is missing. The hosted artifact must include its public publishable key before anonymous search or email sign-in can be used.</p>}
          {cloudMessage && <p className="cloud-message" role="status" aria-live="polite">{cloudMessage}</p>}
          <div className="cloud-steps">
            <div><b>Public live search</b><p>Search public scholarship listings without creating an account. Requests are rate-limited and contain only state, graduation year, and selected categories.</p></div>
            <div><b>Optional cloud account</b><p>Email sign-in connects an account for saving sponsor records across sessions. Your student profile, grades, activities, and essays remain local.</p><button type="button" className="secondary" disabled={cloudBusy} onClick={() => void handleCheckCloudSession()}>Check session status</button></div>
          </div>
        </section>
      </div>;
}
