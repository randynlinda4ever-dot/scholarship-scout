import type { OverviewPageModel } from '../pageTypes.js';
import { CandidateCard } from '../../../components/ScholarshipCards.js';
import { DeadlineUrgencyPill } from '../../../components/StatusPills.js';

export function OverviewPage({ model }: { model: OverviewPageModel }) {
  const { applicationCounts, assessments, candidateAssessments, deadlineOverview, deadlinesDueSoon, exportLocalBackup, formatDate, importLocalBackup, items, openAdd, overdueDeadlines, profile, profileReadiness, profileTags, setSelected, setTab, tracked } = model;
  return <div className="page">
        <div className="welcome"><div><div className="eyebrow">YOUR SCHOLARSHIP WORKSPACE</div><h1>Make your next opportunity count.</h1><p>Find scholarships that fit your story, verify the details, and keep every application organized.</p></div><button className="primary" onClick={() => setTab('Discovery')}>⌕ Find scholarships</button></div>
        <div className="notice"><span>✦</span><div><b>Profile-based scholarship discovery</b><p>Searches use the school, district, location, and interests you choose to enter. Leave anything blank for broader matches.</p></div><button onClick={() => setTab('Eligibility filters')}>Review profile →</button></div>
        <div className="panel profile-overview-readiness">
          <div className="panel-heading"><div><h3>Profile readiness</h3><p className="muted">Coverage for personalized searches, not an eligibility decision.</p></div><span className="source-tag">{profileReadiness.core.completedCount}/{profileReadiness.core.totalCount} core details</span></div>
          <div className="profile-readiness-meter"><strong>{profileReadiness.core.percent}%</strong><progress max={100} value={profileReadiness.core.percent} aria-label="Core profile completeness"/></div>
          <p className="profile-readiness-caption">{profileReadiness.core.missing.length ? `Add: ${profileReadiness.core.missing.slice(0, 2).map((field) => field.label).join(', ')}${profileReadiness.core.missing.length > 2 ? ', and more' : ''}.` : 'Core location and education details are filled in. Sponsor-specific requirements still need review.'}</p>
          <button className="text-button" onClick={() => setTab('Eligibility filters')}>Review profile details →</button>
        </div>
        <section className="quick-access" aria-labelledby="quick-access-title">
          <div className="quick-access-heading"><div><span className="eyebrow">WHERE TO GO NEXT</span><h2 id="quick-access-title">Quick access</h2><p>Choose a section to get straight to what you need.</p></div></div>
          <div className="quick-access-grid">
            <button className="quick-link-card" onClick={() => setTab('Discovery')}><span className="quick-link-icon">⌕</span><span><b>Find scholarships</b><small>Explore awards selected around your profile.</small></span><span className="quick-link-arrow">→</span></button>
            <button className="quick-link-card" onClick={() => setTab('Scholarships')}><span className="quick-link-icon">▤</span><span><b>My scholarships</b><small>Review saved opportunities and deadlines.</small></span><span className="quick-link-arrow">→</span></button>
            <button className="quick-link-card" onClick={() => setTab('Application prep')}><span className="quick-link-icon">☑</span><span><b>Application checklist</b><small>Keep track of materials and next steps.</small></span><span className="quick-link-arrow">→</span></button>
            <button className="quick-link-card" onClick={() => setTab('Eligibility filters')}><span className="quick-link-icon">♙</span><span><b>My profile</b><small>Update the details used for matching.</small></span><span className="quick-link-arrow">→</span></button>
          </div>
        </section>
        <div className="section-head"><div><h2>Your pipeline</h2><p>Eligibility is calculated from the criteria recorded for each scholarship.</p></div><div className="section-actions"><button className="secondary" onClick={exportLocalBackup}>↓ Export encrypted backup</button><label className="secondary backup-import">↑ Import backup<input type="file" accept="application/json,.json" onChange={event=>{void importLocalBackup(event.target.files?.[0]);event.currentTarget.value='';}}/></label><button className="text-button" onClick={() => setTab('Scholarships')}>View all →</button></div></div>
        <div className="stats">{[
          {label:'Tracked scholarships',value:items.filter(item=>!item.archived).length,sub:'Active records in your workspace',icon:'▤'},
          {label:'Eligible',value:[...assessments.values()].filter(x=>x.status==='Eligible').length,sub:'All recorded rules passed',icon:'✓'},
          {label:'Need information',value:[...assessments.values()].filter(x=>x.status==='Needs information').length,sub:'At least one unknown condition',icon:'◷'},
          {label:'Deadline milestones in 7 days',value:deadlinesDueSoon,sub:overdueDeadlines ? `${overdueDeadlines} past due · date-only estimates` : 'Date-only estimates; check sponsor cutoff',icon:'◷'}
        ].map(x=><div className="stat" key={x.label}><div className="stat-top"><span>{x.label}</span><b>{x.icon}</b></div><strong>{x.value}</strong><small>{x.sub}</small></div>)}</div>
        <div className="panel application-pipeline-summary">
          <div className="panel-heading"><div><h3>Application progress</h3><p className="muted">Your manual workflow separate from scholarship eligibility.</p></div><button className="text-button" onClick={()=>setTab('Scholarships')}>Manage tracker →</button></div>
          <div className="application-pipeline-grid">
            <div><b>{applicationCounts.inProgress}</b><small>Preparing</small></div>
            <div><b>{applicationCounts.ready}</b><small>Ready</small></div>
            <div><b>{applicationCounts.submitted}</b><small>Submitted</small></div>
            <div><b>{applicationCounts.awarded}</b><small>Awarded</small></div>
          </div>
        </div>
        <div className="panel deadline-watch"><div className="panel-heading"><div><h3>Deadline watch</h3><p className="muted">The nearest dates in your tracker.</p></div><span className="source-tag">{deadlineOverview.length} opening/deadline dates shown</span></div>{deadlineOverview.length ? <div className="deadline-list">{deadlineOverview.map(({item,milestone})=><button type="button" className="deadline-item" key={`${item.id}-${milestone.key}`} onClick={()=>setSelected(item)}><span><b>{item.name}</b><small>{milestone.label} · {item.provider} · {milestone.deadlineText || (milestone.deadline ? formatDate(milestone.deadline) : 'Deadline not confirmed')}</small></span><DeadlineUrgencyPill deadline={milestone.deadline} timeZone={milestone.timeZone} openDate={item.openDate} openDateTimezone={item.openDateTimezone} deadlineTime={milestone.deadlineTime}/></button>)}</div> : <p className="muted">Add confirmed calendar dates to see them here. Unpublished and unknown deadlines are not guessed.</p>}<small className="deadline-footnote">Date-only countdown. A sponsor-stated time zone is used when recorded; cutoff times are never inferred.</small></div>
        <div className="section-head"><div><h2>Recent discoveries</h2><p>Opportunities with upcoming deadlines that need sponsor-level review.</p></div><button className="text-button" onClick={()=>setTab('Discovery')}>Open discovery →</button></div>
        <div className="candidate-grid">{candidateAssessments.slice(0,2).map(({item,assessment})=><CandidateCard key={item.id} item={item} assessment={assessment} added={tracked(item.id)} onAdd={()=>openAdd(item)}/>)}</div>
        <div className="bottom-grid"><div className="panel"><div className="panel-heading"><h3>Eligibility profile snapshot</h3><button className="text-button" onClick={()=>setTab('Eligibility filters')}>Edit →</button></div><div className="tag-row">{profileTags.slice(0,4).map(t=><span key={t}>{t}</span>)}</div><p className="muted">{profile.plannedMajor} · GPA {profile.gpa} · Rank {profile.classRank.split('—')[0].trim()} · ACT {profile.act}</p></div><div className="panel"><div className="panel-heading"><h3>How Scout verifies</h3><span className="spark">✦</span></div><div className="mini-steps"><span>01</span><p><b>Discover</b><small>Profile-specific searches and trusted directories.</small></p></div><div className="mini-steps"><span>02</span><p><b>Compare</b><small>Rules engine checks each entered requirement.</small></p></div><div className="mini-steps"><span>03</span><p><b>Audit</b><small>Unknowns and source evidence stay visible.</small></p></div></div></div>
      </div>;
}
