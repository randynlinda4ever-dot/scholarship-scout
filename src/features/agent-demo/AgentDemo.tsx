import { useMemo, useState } from "react";
import {
  DEMO_PROFILE,
  DEMO_SCHOLARSHIPS,
  filterDemoScholarships,
} from "./agentDemoData.js";
import "./AgentDemo.css";

type DemoTab = "Overview" | "Discover" | "My tracker" | "Student profile";

const TABS: DemoTab[] = ["Overview", "Discover", "My tracker", "Student profile"];
const STATES = ["ALL", "TX", "CA", "AZ", "OK", "NM", "NY", "WA"];
const CATEGORIES = ["ALL", ...new Set(DEMO_SCHOLARSHIPS.map((item) => item.category))];

export default function AgentDemo() {
  const [tab, setTab] = useState<DemoTab>("Overview");
  const [query, setQuery] = useState("");
  const [state, setState] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [trackedIds, setTrackedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState({ ...DEMO_PROFILE });
  const [notice, setNotice] = useState("");

  const filtered = useMemo(
    () => filterDemoScholarships(DEMO_SCHOLARSHIPS, { query, state, category }),
    [query, state, category],
  );
  const tracked = useMemo(
    () => DEMO_SCHOLARSHIPS.filter((item) => trackedIds.includes(item.id)),
    [trackedIds],
  );
  const selected = selectedId
    ? DEMO_SCHOLARSHIPS.find((item) => item.id === selectedId) ?? null
    : null;

  const setTracked = (id: string) => {
    const exists = trackedIds.includes(id);
    setTrackedIds((current) =>
      exists
        ? current.filter((item) => item !== id)
        : current.includes(id) ? current : [...current, id],
    );
    setNotice(exists ? "Removed from this demo tracker." : "Added to this demo tracker.");
  };

  return (
    <main className="agent-demo">
      <div className="agent-demo-shell">
        <header className="agent-demo-header">
          <div>
            <p className="agent-demo-eyebrow">SCHOLARSHIP SCOUT · PREVIEW</p>
            <a className="agent-demo-brand" href="/agent-demo" aria-label="Agent demo home">
              <span className="agent-demo-mark" aria-hidden="true">S</span>
              <span>Scholarship Scout</span>
            </a>
          </div>
          <a className="agent-demo-exit" href="/">Exit demo</a>
        </header>

        <section className="agent-demo-warning" role="status" aria-label="Test environment notice">
          <strong>Agent test environment — synthetic data only</strong>
          <span>Synthetic test content; these are not real scholarship listings. All profiles and sample records are fictional. Changes stay in memory and disappear when this page is reloaded. This demo does not connect to accounts, the local vault, or Supabase.</span>
        </section>

        <div className="agent-demo-layout">
          <nav className="agent-demo-nav" aria-label="Demo navigation">
            <p className="agent-demo-eyebrow">TEST WORKSPACE</p>
            {TABS.map((item) => (
              <button
                type="button"
                key={item}
                className={tab === item ? "is-active" : ""}
                aria-current={tab === item ? "page" : undefined}
                onClick={() => { setTab(item); setNotice(""); }}
              >
                {item}
                {item === "My tracker" && <span className="agent-demo-count">{trackedIds.length}</span>}
              </button>
            ))}
            <div className="agent-demo-nav-note">
              <strong>Test-only controls</strong>
              <span>No user information is loaded or saved.</span>
            </div>
          </nav>

          <section className="agent-demo-content" aria-live="polite">
            {notice && <p className="agent-demo-toast" role="status">{notice}</p>}

            {tab === "Overview" && (
              <>
                <div className="agent-demo-page-heading">
                  <div>
                    <p className="agent-demo-eyebrow">SAMPLE WORKSPACE</p>
                    <h1>Welcome, {profile.name.split(" ")[0]}.</h1>
                    <p>Use this fictional workspace to exercise the main browsing and tracking interactions.</p>
                  </div>
                  <button type="button" className="agent-demo-primary" onClick={() => setTab("Discover")}>Find scholarships</button>
                </div>
                <div className="agent-demo-stat-grid">
                  <article><span>Sample opportunities</span><strong>{DEMO_SCHOLARSHIPS.length}</strong></article>
                  <article><span>Tracked in this session</span><strong>{trackedIds.length}</strong></article>
                  <article><span>Profile state</span><strong>{profile.state}</strong></article>
                </div>
                <div className="agent-demo-panel">
                  <div className="agent-demo-panel-heading">
                    <div><h2>Suggested test records</h2><p>Fictional listings for navigation and detail-view testing.</p></div>
                    <button type="button" className="agent-demo-text-button" onClick={() => setTab("Discover")}>View all</button>
                  </div>
                  <div className="agent-demo-card-grid">
                    {DEMO_SCHOLARSHIPS.slice(0, 3).map((item) => (
                      <ScholarshipCard key={item.id} item={item} tracked={trackedIds.includes(item.id)} onTrack={() => setTracked(item.id)} onView={() => setSelectedId(item.id)} />
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === "Discover" && (
              <>
                <div className="agent-demo-page-heading">
                  <div><p className="agent-demo-eyebrow">DISCOVERY TESTS</p><h1>Find scholarships</h1><p>Exercise text search, region filters, categories, and detail views.</p></div>
                </div>
                <div className="agent-demo-filters">
                  <label>Search sample records<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, sponsor, or category" /></label>
                  <label>Eligible state<select value={state} onChange={(event) => setState(event.target.value)}>{STATES.map((item) => <option key={item} value={item}>{item === "ALL" ? "All states" : item}</option>)}</select></label>
                  <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORIES.map((item) => <option key={item} value={item}>{item === "ALL" ? "All categories" : item}</option>)}</select></label>
                  <button type="button" className="agent-demo-secondary" onClick={() => { setQuery(""); setState("ALL"); setCategory("ALL"); }}>Clear filters</button>
                </div>
                <p className="agent-demo-result-count" role="status">{filtered.length} of {DEMO_SCHOLARSHIPS.length} synthetic records</p>
                {filtered.length ? (
                  <div className="agent-demo-card-grid">
                    {filtered.map((item) => <ScholarshipCard key={item.id} item={item} tracked={trackedIds.includes(item.id)} onTrack={() => setTracked(item.id)} onView={() => setSelectedId(item.id)} />)}
                  </div>
                ) : <div className="agent-demo-empty"><strong>No sample records match.</strong><p>Change the search or clear the filters to continue testing.</p></div>}
              </>
            )}

            {tab === "My tracker" && (
              <>
                <div className="agent-demo-page-heading"><div><p className="agent-demo-eyebrow">SESSION-ONLY TRACKER</p><h1>My tracker</h1><p>Adding and removing records only changes this page's temporary in-memory state.</p></div></div>
                {tracked.length ? (
                  <div className="agent-demo-card-grid">
                    {tracked.map((item) => <ScholarshipCard key={item.id} item={item} tracked onTrack={() => setTracked(item.id)} onView={() => setSelectedId(item.id)} />)}
                  </div>
                ) : <div className="agent-demo-empty"><strong>No tracked sample records yet.</strong><p>Open Discover and add a fictional scholarship to exercise the tracker.</p><button type="button" className="agent-demo-primary" onClick={() => setTab("Discover")}>Browse sample records</button></div>}
              </>
            )}

            {tab === "Student profile" && (
              <>
                <div className="agent-demo-page-heading"><div><p className="agent-demo-eyebrow">FICTIONAL PROFILE</p><h1>Student profile</h1><p>Edit these example fields to test profile controls. Nothing is persisted.</p></div></div>
                <div className="agent-demo-profile-panel">
                  <label>Sample name<input value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label>Grade<select value={profile.grade} onChange={(event) => setProfile((current) => ({ ...current, grade: event.target.value }))}><option value="9">9th grade</option><option value="10">10th grade</option><option value="11">11th grade</option><option value="12">12th grade</option></select></label>
                  <label>Graduation year<input inputMode="numeric" value={profile.graduationYear} onChange={(event) => setProfile((current) => ({ ...current, graduationYear: event.target.value }))} /></label>
                  <label>State<select value={profile.state} onChange={(event) => setProfile((current) => ({ ...current, state: event.target.value }))}>{STATES.filter((item) => item !== "ALL").map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                  <label className="agent-demo-full-field">Interests<textarea rows={3} value={profile.interests} onChange={(event) => setProfile((current) => ({ ...current, interests: event.target.value }))} /></label>
                  <div className="agent-demo-profile-actions"><button type="button" className="agent-demo-secondary" onClick={() => { setProfile({ ...DEMO_PROFILE }); setNotice("Sample profile reset."); }}>Reset sample profile</button><span>Temporary state only · no save action</span></div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {selected && (
        <div className="agent-demo-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
          <section className="agent-demo-modal" role="dialog" aria-modal="true" aria-labelledby="agent-demo-detail-title">
            <div className="agent-demo-panel-heading">
              <div><p className="agent-demo-eyebrow">SYNTHETIC DETAIL</p><h2 id="agent-demo-detail-title">{selected.name}</h2><p>{selected.provider}</p></div>
              <button type="button" className="agent-demo-icon-button" aria-label="Close details" onClick={() => setSelectedId(null)}>×</button>
            </div>
            <dl className="agent-demo-detail-list">
              <div><dt>Example award</dt><dd>{selected.award}</dd></div>
              <div><dt>Example deadline</dt><dd>{selected.deadline}</dd></div>
              <div><dt>Category</dt><dd>{selected.category}</dd></div>
              <div><dt>Eligible states</dt><dd>{selected.stateEligibility.join(", ")}</dd></div>
            </dl>
            <p>{selected.summary}</p>
            <h3>Sample requirements</h3>
            <ul>{selected.requirements.map((item) => <li key={item}>{item}</li>)}</ul>
            <p className="agent-demo-disclaimer">Fictional example only. This is not a real scholarship or sponsor offer.</p>
            <button type="button" className="agent-demo-primary" onClick={() => setTracked(selected.id)}>{trackedIds.includes(selected.id) ? "Remove from tracker" : "Add to tracker"}</button>
          </section>
        </div>
      )}
    </main>
  );
}

function ScholarshipCard({
  item,
  tracked,
  onTrack,
  onView,
}: {
  item: (typeof DEMO_SCHOLARSHIPS)[number];
  tracked: boolean;
  onTrack: () => void;
  onView: () => void;
}) {
  return (
    <article className="agent-demo-scholarship-card">
      <div className="agent-demo-card-top"><span>{item.category}</span><span>Sample record</span></div>
      <h2>{item.name}</h2>
      <p className="agent-demo-sponsor">{item.provider}</p>
      <div className="agent-demo-card-meta"><span>{item.award}</span><span>Deadline: {item.deadline}</span></div>
      <p>{item.summary}</p>
      <div className="agent-demo-card-actions">
        <button type="button" className="agent-demo-text-button" onClick={onView}>View details</button>
        <button type="button" className={tracked ? "agent-demo-secondary" : "agent-demo-primary"} onClick={onTrack}>{tracked ? "Remove from tracker" : "Track sample"}</button>
      </div>
    </article>
  );
}
