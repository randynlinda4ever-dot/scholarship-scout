import type { EligibilityAssessment } from '../eligibility.js';
import type { LiveScholarship } from '../lib/scholarshipApi';
import type { Scholarship, Status } from '../domain/types.js';
import { sanitizePublicHttpsUrl, getSourceAttribution } from '../lib/evidence.js';
import { summarizeEligibilityAssessment } from '../lib/eligibilitySummary.js';
import { SourceStatusPill, StatusPill } from './StatusPills.js';

export function CloudResultCard({item,tracked,onTrack}:{item:LiveScholarship;tracked:boolean;onTrack:()=>void}) {
  const rules = item.extracted_rules as {
    eligibility_requirements?:Array<{requirement?:string;mandatory?:boolean;evidence?:string;needs_human_confirmation?:boolean}>;
    uncertainties?:string[]; short_source_summary?:string; application_fee?:boolean|null;
    application_documents?:string[]; application_steps?:string[];
  }|undefined;
  return <article className="cloud-result-card" role="listitem">
    <div className="candidate-top"><span className="status status-needs-information">{item.verification_state === 'human_verified' ? 'Sponsor-reviewed record' : item.verification_state === 'needs_human_review' ? 'Needs sponsor review' : 'Unverified lead'}</span><span>{(item.discovery_categories || [item.discovery_category]).map((category)=>category.replace(/_/g,' ')).join(' · ')}</span></div>
    <h3>{item.title}</h3><p className="candidate-provider">{item.provider || 'Sponsor not confirmed'} · {item.source_domain || (()=>{try{return new URL(item.source_url).hostname.replace(/^www[.]/,'')}catch{return 'Source domain unavailable'}})()}</p>
    <div className="cloud-result-meta" aria-label="Award and deadline clues from search snippets">
      <span><b>Award</b> {item.award_text || 'Not found in snippet'}</span>
      <span><b>Deadline</b> {item.deadline_text || (item.deadline ? item.deadline : 'Not found in snippet')}</span>
    </div>
    {(item.award_text || item.deadline_text) && <small className="candidate-source">Snippet details only. Confirm dates and award terms on the sponsor page.</small>}
    <p className="candidate-description">{rules?.short_source_summary || item.excerpt || 'Open the source page for award and application details.'}</p>
    {item.relevance_score !== undefined && (() => {
      const score = Math.max(0, Math.min(100, Math.round(item.relevance_score)));
      const level = score >= 70 ? 'Strong' : score >= 40 ? 'Moderate' : 'Limited';
      return <section className="research-relevance" aria-label={`Profile match: ${score} out of 100, ${level}`}>
        <div className="research-relevance-head"><b>Profile match</b><strong>{score}/100 · {level}</strong></div>
        <div className="research-relevance-track" role="meter" aria-label="Profile match score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-valuetext={`${score} out of 100, ${level} profile match`}>
          <span style={{ width: `${score}%` }} />
        </div>
        <small>Calculated on this device from available profile details and search evidence. 0–39 limited · 40–69 moderate · 70–100 strong. Not an eligibility decision.</small>
        {item.relevance_reasons?.length ? <details><summary>Why this ranked here</summary><small>{item.relevance_reasons.join(' · ')}</small></details> : null}
      </section>;
    })()}

    {sanitizePublicHttpsUrl(item.source_evidence_url || '') && <p><a className="source-link" href={sanitizePublicHttpsUrl(item.source_evidence_url || '') || undefined} target="_blank" rel="noreferrer">Open supporting rules / evidence ↗</a></p>}
    {rules?.eligibility_requirements?.length ? <div className="extracted-rules"><b>Extracted sponsor rules — provisional</b>{rules.eligibility_requirements.map((rule,index)=><div key={index}><span>{rule.mandatory?'Required':'Selection / preference'}{rule.needs_human_confirmation?' · Confirm with sponsor':''}</span><p>{rule.requirement}</p>{rule.evidence&&<small>Evidence: {rule.evidence}</small>}</div>)}</div>:null}
    {rules?.uncertainties?.length ? <div className="uncertainty-list"><b>Still unclear</b><ul>{rules.uncertainties.map((item,index)=><li key={index}>{item}</li>)}</ul></div>:null}
    {rules?.application_documents?.length ? <div className="extracted-rules"><b>Application documents</b><ul>{rules.application_documents.map((item,index)=><li key={index}>{item}</li>)}</ul></div>:null}
    {rules?.application_steps?.length ? <div className="extracted-rules"><b>Application steps</b><ol>{rules.application_steps.map((item,index)=><li key={index}>{item}</li>)}</ol></div>:null}
    {rules?.application_fee === true ? <div className="risk-flag">⚠ The sponsor-page extraction indicates an application fee. Verify directly with the sponsor and do not pay to apply.</div>:null}
    <div className="candidate-actions">{sanitizePublicHttpsUrl(item.source_url) && <a href={sanitizePublicHttpsUrl(item.source_url) || undefined} target="_blank" rel="noreferrer">Open source page ↗</a>}<button className="secondary" disabled={true} title="Sponsor verification Edge Function is not deployed">Verification not deployed</button><button className="primary" disabled={tracked} onClick={onTrack}>{tracked?'In tracker':'＋ Add to tracker'}</button></div>
    <small className="candidate-source">Cloud records are not automatically refreshed. Re-check the current official sponsor page before relying on any detail.</small>
  </article>;
}

const formatDate = (value?: string) => value ? new Date(value + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not listed';

export function CandidateCard({item,assessment,added,onAdd}:{item:Scholarship;assessment:EligibilityAssessment;added:boolean;onAdd:()=>void}) {
  const summary = summarizeEligibilityAssessment(assessment);
  return <div className="candidate-card">
    <div className="candidate-top"><StatusPill status={summary.status as Status}/><SourceStatusPill item={item}/></div>
    <div className="candidate-deadline">{item.deadlineText && item.deadlineText !== item.deadline ? item.deadlineText : (item.deadline ? formatDate(item.deadline) : item.deadlineNotPublished ? 'No deadline published by sponsor' : 'Deadline not confirmed')} {item.deadlineTimezone ? `· ${item.deadlineTimezone}` : ''}</div>
    <h3>{item.name}</h3><p className="candidate-provider">{item.provider}</p><div className="candidate-award">{item.award || 'Award details not published'}</div>
    <p className="candidate-description">{item.notes}</p>
    <div className="candidate-match"><b>Profile check</b><span>{summary.passed.length} pass · {summary.unknown.length} unknown · {summary.failed.length} fail</span></div>
    <small className="candidate-source">{summary.caveat}</small>
    <div className="candidate-actions">{sanitizePublicHttpsUrl(item.sourceUrl) && <a href={sanitizePublicHttpsUrl(item.sourceUrl) || undefined} target="_blank" rel="noreferrer">{getSourceAttribution(item.sourceUrl).linkLabel} ↗</a>}<button className={added?'secondary':'primary'} disabled={added} onClick={onAdd}>{added?'Added to tracker':'＋ Track & verify'}</button></div>
    <small className="candidate-source">Sponsor rules last checked: {item.lastCheckedDate || 'Not recorded'} · Discovered: {item.discoveredOn || 'Date not recorded'} · Added to tracker: {item.recordCreatedAt ? new Date(item.recordCreatedAt).toLocaleString() : 'Date not recorded'} · {getSourceAttribution(item.sourceUrl).label}. {item.discoverySourceLabel ? `Discovery source: ${item.discoverySourceLabel}.` : 'No discovery source recorded'}</small>
  </div>;
}

export function Empty({onAdd}:{onAdd:()=>void}) { return <div className="empty"><div>▤</div><b>No scholarships in this view</b><p>Add an opportunity from discovery or enter its sponsor criteria.</p><button className="secondary" onClick={onAdd}>＋ Add scholarship</button></div>; }

export function FilteredEmpty({onClear}:{onClear:()=>void}) { return <div className="empty" role="status"><div>⌕</div><b>No scholarships match these filters</b><p>Saved opportunities are available, but your search or selected filters hide them.</p><button type="button" className="secondary" onClick={onClear}>Clear filters</button></div>; }
