import { DISCOVERY_CATEGORY_OPTIONS } from '../../../lib/discovery.js';
import type { CloudSearchPageModel } from '../pageTypes.js';
import { CloudResultCard } from '../../../components/ScholarshipCards.js';

export function CloudSearchPage({ model }: { model: CloudSearchPageModel }) {
  const { addLiveResult, cloudBusy, cloudMessage, cloudUser, discoveryState, discoverySummary, discoveryWarnings, exaResults, handleCloudSearch, isLiveDiscoveryCategorySupported, isOnline, items, liveResults, profile, selectedDiscoveryCategories, setSelectedDiscoveryCategories, setTab, supabaseConfigured } = model;
  return <div className="page">
        <div className="page-heading"><div><div className="eyebrow">SEARXNG LIVE WEB DISCOVERY</div><h1>Live scholarship search</h1><p>Search public scholarship pages through your laptop-hosted SearXNG service, then review leads and optionally save sponsor details to your private account.</p></div><span className="status status-likely-eligible">SearXNG discovery</span></div>
        <div className="cloud-run-row"><div><b>Live scholarship research</b><p className="muted">Public search works without signing in or creating an account. Only your state, graduation year, and selected categories are sent to the search service. Results are unverified leads until you review the official sponsor page.</p></div><button className="primary" disabled={cloudBusy || !isOnline || !supabaseConfigured || selectedDiscoveryCategories.length === 0} onClick={()=>void handleCloudSearch()}>{cloudBusy ? 'Researching…' : 'Run research'}</button></div>
        <div className="panel discovery-category-picker" role="group" aria-labelledby="research-categories-title">
          <div className="panel-heading"><div><h3 id="research-categories-title">Research categories</h3><p className="muted">Choose up to four categories per run. You can run another search with a different selection.</p></div><span className="source-tag">{selectedDiscoveryCategories.length}/4 selected</span></div>
          <div className="discovery-category-grid">{DISCOVERY_CATEGORY_OPTIONS.map((category)=><label className="discovery-category-option" key={category.id}>
            <input type="checkbox" checked={selectedDiscoveryCategories.includes(category.id)} disabled={!selectedDiscoveryCategories.includes(category.id) && (!isLiveDiscoveryCategorySupported(category.id) || selectedDiscoveryCategories.length >= 4)} onChange={(event)=>setSelectedDiscoveryCategories((current)=>event.target.checked ? (current.length < 4 && isLiveDiscoveryCategorySupported(category.id) ? [...current, category.id] : current) : current.filter((id)=>id !== category.id))}/>
            <span><b>{category.label}</b><small>{category.description}{!isLiveDiscoveryCategorySupported(category.id) ? ' Not available in the deployed search yet.' : ''}</small></span>
          </label>)}</div>
          <p className="cloud-config-note">All categories listed here are supported by the current expanded search implementation. Choose up to four per run.</p>
          {!profile.state.trim() || !profile.graduationYear.trim() ? <p className="cloud-config-note">Add your state and expected graduation year in My Profile before running live search.</p> : null}
        </div>
        <div className="panel cloud-auth">
          <div className="panel-heading"><h3>Public search — no account required</h3><span className="status status-likely-eligible">Public access</span></div>
          <p className="muted">Anyone can run live scholarship research without signing in. Search requests are rate-limited and contain only state, graduation year, and selected categories.</p>
          <button type="button" className="secondary" onClick={() => setTab('Settings')}>Optional cloud account settings</button>
        </div>
        {cloudUser && <div className="panel cloud-authenticated">
          <div className="panel-heading"><div><h3>{cloudUser.is_anonymous ? 'Anonymous cloud account' : `Connected as ${cloudUser.email || 'signed-in user'}`}</h3><p className="muted">Cloud sponsor records are private to this account and protected by row-level security.</p></div><button className="secondary" onClick={()=>setTab('Settings')}>Manage account</button></div>
        </div>}
        {cloudMessage && <p className="cloud-message" role="status" aria-live="polite">{cloudMessage}</p>}
        {discoveryState === 'loading' && <div className="cloud-loading" aria-hidden="true">Researching…</div>}
        {discoveryState === 'empty' && <div className="panel cloud-empty" role="status" aria-live="polite"><b>No scholarship matches were found for this search.</b><p>Your search completed, but no usable public leads matched the selected categories. Try different categories or run the search again. Provider warnings, if any, appear in the research summary.</p><button type="button" className="secondary" onClick={()=>void handleCloudSearch()}>Try search again</button></div>}
        {discoveryState === 'error' && <div className="panel cloud-empty" role="alert"><b>Scholarship search could not be completed.</b><p>Review the search status message above for details, then retry the search.</p><button type="button" className="secondary" disabled={cloudBusy || !isOnline || !supabaseConfigured || selectedDiscoveryCategories.length === 0} onClick={()=>void handleCloudSearch()}>Retry search</button></div>}
        {discoverySummary && <div className="panel search-metrics">
          <div className="panel-heading"><div><h3>Research run summary</h3><p className="muted">Search coverage and deduplicated lead count.</p></div><span className="source-tag">{discoverySummary.uniqueResults} unique leads</span></div>
          <div className="search-metrics-grid">
            <div><b>{discoverySummary.requestedQueries}</b><small>Search requests</small></div>
            <div><b>{discoverySummary.successfulQueries}</b><small>Successful</small></div>
            <div><b>{discoverySummary.failedQueries}</b><small>Failed</small></div>
            <div><b>{discoverySummary.pagesChecked}</b><small>Pages checked</small></div>
            <div><b>{discoverySummary.rawResultCount}</b><small>Raw results</small></div>
          </div>
          {discoveryWarnings.map((warning,index)=><p className="cloud-config-note" key={index}>{warning}</p>)}
        </div>}
        {exaResults.length>0 && <section aria-labelledby="live-search-results-title"><div className="section-head"><div><h2 id="live-search-results-title">Live SearXNG results</h2><p>Ranked and deduplicated research leads. Sponsor, award, deadline, and eligibility remain unverified until you review the official page.</p></div><span className="source-tag">{exaResults.length} leads</span></div>
          <div className="cloud-results" role="list" aria-label="Live scholarship search results">{exaResults.map((row)=><CloudResultCard key={row.id} item={row} tracked={items.some(x=>x.backendOpportunityId===row.id||x.sourceUrl===row.source_url)} onTrack={()=>addLiveResult(row)}/>)}</div>
        </section>}
        {cloudUser && !cloudBusy && liveResults.length === 0 && <div className="panel cloud-empty" role="status" aria-live="polite"><b>No saved cloud records yet.</b><p>Review a live lead and choose whether to save its sponsor details to your account.</p></div>}
        {cloudUser && liveResults.length>0 && <section aria-labelledby="saved-cloud-results-title"><div className="section-head"><div><h2 id="saved-cloud-results-title">Saved cloud records</h2><p>Sponsor details saved to your private account.</p></div><span className="source-tag">{liveResults.length} records</span></div>
          <div className="cloud-results" role="list" aria-label="Saved scholarship records">{liveResults.map((row)=><CloudResultCard key={row.id} item={row} tracked={items.some(x=>x.backendOpportunityId===row.id||x.sourceUrl===row.source_url)} onTrack={()=>addLiveResult(row)}/>)}</div>
        </section>}
      </div>;
}
