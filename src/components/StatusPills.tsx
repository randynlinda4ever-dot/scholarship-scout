import type { EligibilityAssessment } from '../eligibility.js';
import type { Scholarship, Status } from '../domain/types.js';
import type { ApplicationStatus, TrackerPriority } from '../lib/trackerManagement.js';
import { getEvidenceCompleteness, getOfficialSourceFreshness, sanitizePublicHttpsUrl } from '../lib/evidence.js';
import { getDeadlineUrgency } from '../lib/trackerInsights.js';
import { summarizeEligibilityAssessment } from '../lib/eligibilitySummary.js';

const STATUS_CLASS_MAP: Record<string, string> = {
  'Eligible': 'eligible',
  'Rules match — source unverified': 'rules-match-unverified',
  'Needs information': 'needs-information',
  'Ineligible': 'ineligible',
  'Expired': 'expired',
};

export function StatusPill({status}:{status:Status}) {
  return <span className={'status status-' + (STATUS_CLASS_MAP[status] || 'unknown')}>{status}</span>;
}

export function ApplicationStatusPill({status}:{status:ApplicationStatus}) { return <span className={'application-status-pill application-status-'+status.toLowerCase().replace(/ /g,'-')}>{status}</span>; }

export function PriorityPill({priority}:{priority:TrackerPriority}) { return <span className={'priority-pill priority-'+priority.toLowerCase()}>{priority}</span>; }

export function SourceStatusPill({item}:{item:Scholarship}) {
  const freshness = getOfficialSourceFreshness(item);
  const label = freshness === 'fresh' ? 'Fresh' : freshness === 'stale' ? 'Stale' : 'Unverified';
  const tone = freshness === 'fresh' ? 'verified' : 'needs-review';
  return <span className={'source-status source-status-'+tone} aria-label={'Official source freshness: '+label}>{label}</span>;
}

export function DeadlineUrgencyPill({deadline,timeZone,openDate,openDateTimezone,deadlineTime}:{deadline?:string;timeZone?:string;openDate?:string;openDateTimezone?:string;deadlineTime?:string}) {
  const urgency = getDeadlineUrgency(deadline, new Date(), timeZone, openDate, openDateTimezone, deadlineTime);
  const explanation = openDate
    ? "Opening date is evaluated as a date-only sponsor window" + (openDateTimezone ? " in " + openDateTimezone : "") + "; the deadline is not treated as overdue before the opportunity opens."
    : timeZone
      ? "Date-only estimate using the sponsor-stated time zone (" + timeZone + "); no cutoff time is inferred."
      : "Date-only estimate; no sponsor time zone or cutoff time is inferred.";
  return <span className={`deadline-urgency deadline-urgency-${urgency.status}`} title={explanation}>{urgency.label}</span>;
}

export function EvidenceCompletenessList({item}:{item:Scholarship}) {
  const review = getEvidenceCompleteness(item);
  return <div className="evidence-completeness"><div className="panel-heading"><div><b>Sponsor evidence completeness</b><small>{review.completedCount} of {review.totalCount} source checks complete. This is not a personal eligibility result.</small></div><span className={review.complete ? 'source-status source-status-verified' : 'source-status source-status-needs-review'}>{review.complete ? 'Complete' : 'Needs review'}</span></div><ul>{review.checks.map((check)=><li key={check.label}><span className={check.complete ? 'evidence-check-done' : 'evidence-check-missing'}>{check.complete ? '✓' : '•'}</span>{check.label}</li>)}</ul></div>;
}

export function EligibilityMatchSummary({assessment}:{assessment:EligibilityAssessment}) {
  const summary = summarizeEligibilityAssessment(assessment);
  const groups = [
    { title: 'Matches recorded rules', items: summary.passed, tone: 'pass' },
    { title: 'Does not meet', items: summary.failed, tone: 'fail' },
    { title: 'Still needs confirmation', items: summary.unknown, tone: 'unknown' },
    { title: 'Preferred qualifications (informational)', items: summary.preferred, tone: 'unknown' },
  ].filter((group) => group.items.length > 0);
  return <div className="match-summary"><div className="match-summary-heading"><b>{summary.headline}</b><span>{summary.passed.length} mandatory passed · {summary.failed.length} mandatory not met · {summary.unknown.length} mandatory unknown · {summary.preferred.length} preferred informational</span></div>{groups.length ? groups.map((group)=><section className={`match-summary-group match-summary-${group.tone}`} key={group.title}><h4>{group.title}</h4><ul>{group.items.map((item)=><li key={item.label}><b>{item.label}</b>{item.importance === 'preferred' && <small>{item.outcome === 'pass' ? 'Preferred match' : item.outcome === 'fail' ? 'Preferred not met — not disqualifying' : 'Preferred — confirmation pending'}</small>}<span>{item.detail || 'No additional detail recorded.'}</span>{item.evidence?.state === 'linked' ? <div className="criterion-evidence"><small>Source excerpt: {item.evidence.excerpt}</small>{sanitizePublicHttpsUrl(item.evidence.sourceUrl) && <a className="source-link" href={sanitizePublicHttpsUrl(item.evidence.sourceUrl) || undefined} target="_blank" rel="noreferrer">Open criterion source ↗</a>}</div> : item.criterionKey ? <small className="criterion-evidence-missing">Criterion evidence is not linked yet; confirm this rule on the sponsor's official page.</small> : null}</li>)}</ul></section>) : <p className="muted">Add structured sponsor criteria to compare this scholarship.</p>}<small>{summary.caveat} Sponsor decisions and requirements not recorded in Scout may still apply.</small></div>;
}
