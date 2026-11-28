import { useEffect, useMemo, useState } from "react";
import {
  calculateNetPrice,
  MAX_RESOURCE_COMPARISONS,
  MAX_RESUME_ENTRIES,
  RESOURCE_AID_CHECKLIST,
  RESOURCE_CALENDAR,
  RESUME_ENTRY_CATEGORIES,
  type ResourceWorkspace,
} from "../../lib/resourceWorkspace.js";
import "./ResourcesPage.css";

type ScholarshipRow = {
  id: string; name: string; provider: string; award: string; deadline: string;
  deadlineText?: string; applicationStatus?: string; priority?: string; archived?: boolean;
};
type ResourceId = "tracker" | "essay" | "aid" | "scams" | "calendar" | "resume";
type Props = {
  workspace: ResourceWorkspace;
  scholarships: ScholarshipRow[];
  onWorkspaceChange: (next: ResourceWorkspace) => void;
  onOpenTracker: () => void;
  onOpenApplicationPrep: (id: string) => void;
};

const CARDS: Array<{ id: ResourceId; number: string; category: string; title: string; description: string; detail: string }> = [
  { id: "tracker", number: "01", category: "ORGANIZE", title: "Scholarship application tracker", description: "Keep deadlines, application status, and next steps in one place.", detail: "Uses your existing My Scholarships tracker." },
  { id: "essay", number: "02", category: "WRITE", title: "Scholarship essay planner", description: "Plan an essay around the sponsor’s prompt.", detail: "A guided worksheet saved privately in this browser." },
  { id: "aid", number: "03", category: "PAY FOR COLLEGE", title: "Financial-aid checklist", description: "Track FAFSA tasks and compare college costs.", detail: "Includes an editable side-by-side cost worksheet." },
  { id: "scams", number: "04", category: "STAY SAFE", title: "Scholarship scam prevention guide", description: "Check messages for common scholarship scam signs.", detail: "An interactive red-flag check and trusted links." },
  { id: "calendar", number: "05", category: "PLAN AHEAD", title: "Junior-to-senior preparation calendar", description: "Plan key tasks across junior and senior year.", detail: "Check off tasks as you complete them." },
  { id: "resume", number: "06", category: "BUILD YOUR RESUME", title: "Activities & resume builder", description: "Organize work, service, leadership, activities, and achievements.", detail: "Create a private, printable experience record." },
];

const SCAM_QUESTIONS = [
  { id: "fee", label: "Are you being asked to pay an application, processing, or award-redemption fee?" },
  { id: "guarantee", label: "Does someone guarantee you will win money or promise a refund if you do not?" },
  { id: "bank", label: "Are they asking for a bank account, card number, or account password to release an award?" },
  { id: "finalist", label: "Were you told you are a finalist for a scholarship you never entered?" },
  { id: "pressure", label: "Are they pressuring you to act immediately, keep it secret, or avoid checking with someone?" },
  { id: "identity", label: "Can you not verify the sponsor and award on an official organization or school website?" },
];
const MONEY = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function Branding() {
  return <footer className="resource-branding"><span>Made for students by <b>Scholarship Scout</b></span><a href="https://scholarship-scout.org/" target="_blank" rel="noreferrer">scholarship-scout.org</a></footer>;
}

function SharePrint({ id, onStatus }: { id: ResourceId; onStatus: (message: string) => void }) {
  const share = async () => {
    const url = `${window.location.origin}/resources#${id}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Scholarship Scout resource", url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        onStatus("Resource link copied. It does not include your worksheet data.");
      } else {
        onStatus(`Copy this resource URL: ${url}`);
      }
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "AbortError") onStatus("Could not share automatically. Copy the resource URL from your browser address bar.");
    }
  };
  return <div className="resource-actions"><button type="button" onClick={() => window.print()}>Print / Save PDF</button><button type="button" onClick={() => void share()}>Share resource</button></div>;
}

function Field({ label, value, onChange, multiline = false, placeholder = "", type = "text", maxLength }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; placeholder?: string; type?: "text" | "number" | "month"; maxLength?: number;
}) {
  return <label className={`resource-field${multiline ? " resource-field-wide" : ""}`}><span>{label}</span>
    {multiline
      ? <textarea rows={4} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      : <input type={type} maxLength={maxLength} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.01" : undefined} inputMode={type === "number" ? "decimal" : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />}
  </label>;
}

export function ResourcesPage({ workspace, scholarships, onWorkspaceChange, onOpenTracker, onOpenApplicationPrep }: Props) {
  const [active, setActive] = useState<ResourceId | null>(() => {
    const hash = window.location.hash.slice(1);
    return CARDS.some((card) => card.id === hash) ? hash as ResourceId : null;
  });
  const [status, setStatus] = useState("");
  const [scamAnswers, setScamAnswers] = useState<Record<string, "yes" | "no" | "unsure">>({});

  useEffect(() => {
    const syncHash = () => {
      const hash = window.location.hash.slice(1);
      setActive(CARDS.some((card) => card.id === hash) ? hash as ResourceId : null);
    };
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, []);

  const activeCard = CARDS.find((card) => card.id === active);
  const activeScholarships = useMemo(() => scholarships.filter((item) => !item.archived), [scholarships]);
  const essay = workspace.essayPlan;
  const resumeEntries = workspace.resumeEntries ?? [];
  const resumeEntriesForPreview = resumeEntries.filter((entry) =>
    entry.role.trim() || entry.organization.trim() || entry.details.trim() || entry.impact.trim()
  );
  const update = (patch: Partial<ResourceWorkspace>) => onWorkspaceChange({ ...workspace, ...patch });
  const updateEssay = (key: keyof ResourceWorkspace["essayPlan"], value: string) =>
    update({ essayPlan: { ...essay, [key]: value } });
  const updateAid = (patch: Partial<ResourceWorkspace["aidChecklist"]>) =>
    update({ aidChecklist: { ...workspace.aidChecklist, ...patch } });
  const toggleAid = (id: string, checked: boolean) => updateAid({
    completed: checked ? [...new Set([...workspace.aidChecklist.completed, id])] : workspace.aidChecklist.completed.filter((item) => item !== id),
  });
  const addCollege = () => {
    if (workspace.aidChecklist.comparisons.length >= MAX_RESOURCE_COMPARISONS) return;
    updateAid({ comparisons: [...workspace.aidChecklist.comparisons, {
      id: `college-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, school: "", cost: "", grants: "", notes: "",
    }] });
  };
  const updateCollege = (id: string, patch: Partial<ResourceWorkspace["aidChecklist"]["comparisons"][number]>) =>
    updateAid({ comparisons: workspace.aidChecklist.comparisons.map((row) => row.id === id ? { ...row, ...patch } : row) });
  const addResumeEntry = () => {
    if (resumeEntries.length >= MAX_RESUME_ENTRIES) return;
    update({
      resumeEntries: [...resumeEntries, {
        id: `resume-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        category: "Activities",
        role: "",
        organization: "",
        startDate: "",
        endDate: "",
        details: "",
        impact: "",
      }],
    });
    setStatus("New experience added. Your changes save automatically.");
  };
  const updateResumeEntry = (id: string, patch: Partial<ResourceWorkspace["resumeEntries"][number]>) =>
    update({ resumeEntries: resumeEntries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) });
  const removeResumeEntry = (id: string) =>
    update({ resumeEntries: resumeEntries.filter((entry) => entry.id !== id) });
  const formatResumeMonth = (value: string) => {
    if (!value) return "";
    const [year, month] = value.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  };
  const changeResumeStartMonth = (id: string, value: string, endDate: string) => {
    const clearEndDate = Boolean(endDate && (!value || endDate < value));
    updateResumeEntry(id, { startDate: value, endDate: clearEndDate ? "" : endDate });
    if (clearEndDate) setStatus("The end month was cleared. Add a start month first, then choose an end month on or after it.");
    else setStatus("");
  };
  const changeResumeEndMonth = (id: string, value: string, startDate: string) => {
    if (value && !startDate) {
      setStatus("Add a start month before an end month.");
      return;
    }
    if (value && value < startDate) {
      setStatus("End month must be the same as or later than the start month.");
      return;
    }
    updateResumeEntry(id, { endDate: value });
    setStatus("");
  };
  const toggleCalendar = (id: string, checked: boolean) => update({
    calendarCompleted: checked ? [...new Set([...workspace.calendarCompleted, id])] : workspace.calendarCompleted.filter((item) => item !== id),
  });
  const totalCalendarTasks = RESOURCE_CALENDAR.reduce((sum, phase) => sum + phase.tasks.length, 0);
  const scamRiskCount = Object.values(scamAnswers).filter((answer) => answer === "yes" || answer === "unsure").length;

  const open = (id: ResourceId) => {
    window.history.pushState({ scholarshipScoutResource: id }, "", `/resources#${id}`);
    setActive(id);
    setStatus("");
  };
  const back = () => {
    window.history.pushState({ scholarshipScoutResource: null }, "", "/resources");
    setActive(null);
    setStatus("");
  };

  return <div className="page resource-page">
    {!activeCard ? <>
      <div className="page-heading resource-index-heading">
        <div><div className="eyebrow">THE SCHOLARSHIP SCOUT TOOLKIT</div><h1>Student resources</h1>
          <p>Tools for essays, financial aid, scam checks, and planning.</p></div>
      </div>
      <div className="resource-index-note"><span aria-hidden="true">✳</span><p><b>Private worksheets</b> Your worksheets and progress stay in this browser’s encrypted vault. Sponsors cannot access them.</p></div>
      <div className="resource-card-grid">
        {CARDS.map((card) => <button type="button" className="resource-card" key={card.id} onClick={() => open(card.id)}>
          <div className="resource-card-top"><span>{card.number}</span><small>{card.category}</small></div>
          <h2>{card.title}</h2><p>{card.description}</p>
          <div className="resource-card-bottom"><span>{card.detail}</span><b aria-hidden="true">↗</b></div>
        </button>)}
      </div>
      <div className="resource-bottom-links"><span>Already found an opportunity?</span><button type="button" className="resource-inline-link" onClick={onOpenTracker}>Open your scholarship tracker →</button></div>
      <Branding />
    </> : <>
      <div className="resource-document-heading resource-printable">
        <button type="button" className="resource-back" onClick={back}>← All resources</button>
        <div className="resource-document-topline"><span className="resource-category">{activeCard.category}</span><SharePrint id={activeCard.id} onStatus={setStatus} /></div>
        <h1>{activeCard.title}</h1><p>{activeCard.description}</p>
      </div>
      {status && <p className="resource-status" role="status" aria-live="polite">{status}</p>}

      {active === "tracker" && <section className="resource-document resource-printable" aria-label="Scholarship application tracker">
        <div className="resource-kpi-row">
          <div><b>{activeScholarships.length}</b><span>active scholarships</span></div>
          <div><b>{activeScholarships.filter((item) => item.applicationStatus === "Submitted").length}</b><span>submitted</span></div>
          <div><b>{activeScholarships.filter((item) => item.applicationStatus === "Preparing").length}</b><span>preparing</span></div>
          <div><b>{activeScholarships.filter((item) => item.deadline && item.deadline >= new Date().toISOString().slice(0, 10)).length}</b><span>future deadlines</span></div>
        </div>
        <div className="resource-section-heading"><div><h2>Your application list</h2><p>This is the same tracker used throughout Scholarship Scout. Updates stay in sync with My Scholarships.</p></div><button type="button" className="resource-button resource-button-primary resource-no-print" onClick={onOpenTracker}>Manage tracker</button></div>
        {activeScholarships.length ? <div className="resource-table-wrap"><table className="resource-table"><thead><tr><th>Scholarship / sponsor</th><th>Deadline</th><th>Application status</th><th>Next step</th></tr></thead><tbody>
          {activeScholarships.map((item) => <tr key={item.id}><td><b>{item.name}</b><small>{item.provider}</small></td><td>{item.deadlineText || (item.deadline ? new Date(`${item.deadline}T12:00:00`).toLocaleDateString() : "Not confirmed")}</td><td>{item.applicationStatus || "Not started"}</td><td><button type="button" className="resource-inline-link resource-no-print" onClick={() => onOpenApplicationPrep(item.id)}>Open prep →</button></td></tr>)}
        </tbody></table></div> : <div className="resource-empty-state"><h3>Your tracker is ready when you are.</h3><p>Add an opportunity after reviewing its official sponsor page. Record the exact deadline and requirements.</p><button type="button" className="resource-button resource-button-primary resource-no-print" onClick={onOpenTracker}>Add a scholarship</button></div>}
        <div className="resource-tip"><b>Good tracker habits</b><ul><li>Save the official sponsor page and copy its deadline exactly.</li><li>Break the application into smaller tasks instead of leaving it until the due date.</li><li>Mark an application submitted only after you complete the sponsor’s submission process.</li></ul></div>
      </section>}

      {active === "essay" && <section className="resource-document resource-printable" aria-label="Scholarship essay planning worksheet">
        <div className="resource-callout"><b>Start with the prompt, not a generic essay.</b><span>Answer these questions before drafting. Reuse a story only when it genuinely answers the new prompt.</span></div>
        <div className="resource-form-grid">
          <Field label="Scholarship name" value={essay.scholarshipName} onChange={(value) => updateEssay("scholarshipName", value)} placeholder="Name of the award" />
          <Field label="Word or character limit" value={essay.wordLimit} onChange={(value) => updateEssay("wordLimit", value)} placeholder="Use the sponsor’s exact limit" />
          <Field label="Exact essay prompt" value={essay.prompt} onChange={(value) => updateEssay("prompt", value)} multiline placeholder="Paste the prompt from the official application page." />
          <Field label="What is the prompt asking, in your own words?" value={essay.promptInMyWords} onChange={(value) => updateEssay("promptInMyWords", value)} multiline placeholder="Identify the question you need to answer." />
          <Field label="One idea you want the reader to remember" value={essay.coreMessage} onChange={(value) => updateEssay("coreMessage", value)} multiline placeholder="Your central point in one or two sentences." />
          <Field label="A specific experience that supports your idea" value={essay.specificStory} onChange={(value) => updateEssay("specificStory", value)} multiline placeholder="Choose a real moment, decision, challenge, contribution, or lesson." />
        </div>
        <div className="resource-outline"><h2>Build the outline</h2><p>Concrete details make an essay more convincing than broad claims. Use your own words and keep the story accurate.</p>
          <div className="resource-form-grid">
            <Field label="Opening · What moment will draw the reader in?" value={essay.opening} onChange={(value) => updateEssay("opening", value)} multiline />
            <Field label="Context · What did the reader need to know?" value={essay.context} onChange={(value) => updateEssay("context", value)} multiline />
            <Field label="Action · What did you actually do?" value={essay.action} onChange={(value) => updateEssay("action", value)} multiline />
            <Field label="Reflection · What changed or what did you learn?" value={essay.reflection} onChange={(value) => updateEssay("reflection", value)} multiline />
            <Field label="Connection · How does this answer the scholarship prompt?" value={essay.connection} onChange={(value) => updateEssay("connection", value)} multiline />
            <Field label="Closing · What do you want the reader to take away?" value={essay.closing} onChange={(value) => updateEssay("closing", value)} multiline />
          </div>
        </div>
        <div className="resource-tip"><b>Before you submit</b><ul><li>Answer every part of the prompt and stay within the stated word limit.</li><li>Use concrete details and your own voice. Do not claim an experience or result you did not have.</li><li>Check the sponsor’s formatting, file type, and submission instructions.</li><li>Ask a trusted teacher or counselor to review clarity while keeping the final writing yours.</li></ul></div>
        <p className="resource-private-note">Your planning notes save in this browser’s encrypted vault. They are not uploaded to Scholarship Scout servers or included in scholarship searches.</p>
      </section>}

      {active === "aid" && <section className="resource-document resource-printable" aria-label="College financial aid checklist">
        <div className="resource-aid-progress"><div><b>{workspace.aidChecklist.completed.length} of {RESOURCE_AID_CHECKLIST.length}</b><span>steps complete</span></div><progress max={RESOURCE_AID_CHECKLIST.length} value={workspace.aidChecklist.completed.length} aria-label="Financial aid checklist completion" /></div>
        <div className="resource-section-heading"><div><h2>Financial-aid checklist</h2><p>Use this as a prompt list. StudentAid.gov and each college’s aid office control current requirements and deadlines.</p></div></div>
        <div className="resource-checklist">{RESOURCE_AID_CHECKLIST.map((item) => <label className="resource-check-item" key={item.id}>
          <input type="checkbox" checked={workspace.aidChecklist.completed.includes(item.id)} onChange={(event) => toggleAid(item.id, event.target.checked)} />
          <span><b>{item.label}</b><small>{item.detail}</small></span>
        </label>)}</div>
        <div className="resource-important-note"><b>Know what counts as gift aid.</b> Grants and scholarships generally reduce what you need to pay. Work-study is earned through work, and loans must be repaid. Do not treat either as a grant.</div>
        <div className="resource-section-heading resource-college-heading"><div><h2>Compare college offers</h2><p>Use the same award year and official cost and grant/scholarship figures for each school.</p></div><button type="button" className="resource-button resource-button-primary resource-no-print" onClick={addCollege} disabled={workspace.aidChecklist.comparisons.length >= MAX_RESOURCE_COMPARISONS}>＋ Add college</button></div>
        {workspace.aidChecklist.comparisons.length === 0 ? <div className="resource-empty-state"><p>Add up to {MAX_RESOURCE_COMPARISONS} colleges to compare estimated net price.</p><button type="button" className="resource-button resource-button-secondary resource-no-print" onClick={addCollege}>Add first college</button></div> :
          <div className="resource-college-list">{workspace.aidChecklist.comparisons.map((row, index) => {
            const netPrice = calculateNetPrice(row.cost, row.grants);
            return <article className="resource-college-card" key={row.id}>
              <div className="resource-college-card-title"><h3>College {index + 1}</h3><button type="button" className="resource-inline-link resource-no-print" onClick={() => updateAid({ comparisons: workspace.aidChecklist.comparisons.filter((item) => item.id !== row.id) })}>Remove</button></div>
              <div className="resource-form-grid">
                <Field label="College name" value={row.school} onChange={(value) => updateCollege(row.id, { school: value })} placeholder="School name" />
                <Field label="Total cost of attendance (USD)" value={row.cost} onChange={(value) => updateCollege(row.id, { cost: value })} placeholder="e.g. 32000" type="number" />
                <Field label="Grants and scholarships (USD)" value={row.grants} onChange={(value) => updateCollege(row.id, { grants: value })} placeholder="e.g. 18000" type="number" />
                <Field label="Questions / conditions to confirm" value={row.notes} onChange={(value) => updateCollege(row.id, { notes: value })} multiline placeholder="Renewal rules, housing assumptions, fees, travel, loans..." />
              </div>
              <div className="resource-net-price"><span>Estimated net price</span><b>{netPrice === null ? "Enter both amounts" : MONEY.format(netPrice)}</b><small>Cost of attendance minus grants and scholarships. Include expenses not shown in the offer.</small></div>
            </article>;
          })}</div>}
        <div className="resource-source-links"><b>Official guidance</b>
          <a href="https://studentaid.gov/articles/things-you-need-for-fafsa/" target="_blank" rel="noreferrer">What you need for the FAFSA ↗</a>
          <a href="https://studentaid.gov/articles/evaluating-financial-aid-offers/" target="_blank" rel="noreferrer">How to evaluate financial-aid offers ↗</a>
          <a href="https://studentaid.gov/apply-for-aid/fafsa/filling-out" target="_blank" rel="noreferrer">FAFSA form and award-year information ↗</a>
        </div>
        <p className="resource-private-note">Your checklist and college comparisons save in this browser’s encrypted vault. They are not shared with colleges or sponsors.</p>
      </section>}

      {active === "scams" && <section className="resource-document resource-printable" aria-label="Scholarship scam prevention guide">
        <div className="resource-callout"><b>Real scholarships do not need your bank password.</b><span>Pause before paying, sharing account details, or responding to unexpected award messages.</span></div>
        <div className="resource-section-heading"><div><h2>Check a message for red flags</h2><p>Choose Yes, No, or Not sure. This is a screening checklist, not a legitimacy score.</p></div></div>
        <div className="resource-scam-check">{SCAM_QUESTIONS.map((question) => <div className="resource-scam-question" key={question.id}>
          <p>{question.label}</p><div className="resource-choice-group" role="group" aria-label={question.label}>
            {(["yes", "no", "unsure"] as const).map((answer) => <button type="button" key={answer} className={scamAnswers[question.id] === answer ? "is-selected" : ""} aria-pressed={scamAnswers[question.id] === answer} onClick={() => setScamAnswers((current) => ({ ...current, [question.id]: answer }))}>{answer === "unsure" ? "Not sure" : answer[0].toUpperCase() + answer.slice(1)}</button>)}
          </div>
        </div>)}</div>
        <div className={`resource-scam-result${scamRiskCount ? " has-flags" : ""}`} role="status" aria-live="polite">
          {scamRiskCount > 0 ? <><b>{scamRiskCount} answer(s) need caution.</b><p>Do not pay or share financial/account details. Verify the award using contact information from the sponsor’s official website, not the message. Ask a school counselor or trusted adult to review it with you.</p></> :
            Object.keys(scamAnswers).length === SCAM_QUESTIONS.length ? <><b>No red flags selected.</b><p>This does not prove an offer is legitimate. Verify the sponsor, award, eligibility rules, and application process through an official source before sharing information.</p></> :
              <><b>Work through the questions.</b><p>Any Yes or Not sure response is a reason to pause and check the offer independently.</p></>}
          <button type="button" className="resource-inline-link resource-no-print" onClick={() => setScamAnswers({})}>Reset check</button>
        </div>
        <div className="resource-tip"><b>Safer verification routine</b><ol><li>Find the sponsor’s website independently. Do not rely on a link in an unexpected message.</li><li>Confirm the award appears on the organization’s official site or with your school counselor.</li><li>Never pay a fee or share a password to claim a scholarship. Do not provide bank or card details to an unknown contact.</li><li>Keep copies of messages and report suspected fraud with help from a trusted adult.</li></ol></div>
        <div className="resource-source-links"><b>Trusted help</b>
          <a href="https://consumer.ftc.gov/articles/how-avoid-scholarship-and-financial-aid-scams" target="_blank" rel="noreferrer">FTC: How to avoid scholarship and financial-aid scams ↗</a>
          <a href="https://reportfraud.ftc.gov/" target="_blank" rel="noreferrer">Report suspected fraud to the FTC ↗</a>
        </div>
      </section>}

      {active === "resume" && <section className="resource-document resource-printable" aria-label="Student activities and resume builder">
        <div className="resource-callout resource-no-print">
          <b>Keep a clear record of what you do and contribute.</b>
          <span>Record roles, service, leadership, activities, awards, and projects as you go. Use specific responsibilities and results rather than broad claims.</span>
        </div>
        <div className="resource-resume-editor resource-no-print">
          <div className="resource-section-heading">
            <div><h2>Experience entries</h2><p>Add one entry for each role, activity, service project, award, or academic project.</p></div>
            <button type="button" className="resource-button resource-button-primary" onClick={addResumeEntry} disabled={resumeEntries.length >= MAX_RESUME_ENTRIES}>＋ Add experience</button>
          </div>
          {resumeEntries.length ? <div className="resource-resume-list">
            {resumeEntries.map((entry, index) => <article className="resource-resume-entry" key={entry.id}>
              <div className="resource-resume-entry-heading">
                <b>Experience {index + 1}</b>
                <button type="button" className="resource-inline-link" aria-label={`Remove experience ${entry.role || index + 1}`} onClick={() => removeResumeEntry(entry.id)}>Remove</button>
              </div>
              <div className="resource-form-grid">
                <label className="resource-field"><span>Resume section</span>
                  <select value={entry.category} onChange={(event) => updateResumeEntry(entry.id, { category: event.target.value })}>
                    {RESUME_ENTRY_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
                <Field label="Role or position" value={entry.role} onChange={(value) => updateResumeEntry(entry.id, { role: value })} placeholder="e.g. Volunteer coordinator" maxLength={120} />
                <Field label="Organization or group" value={entry.organization} onChange={(value) => updateResumeEntry(entry.id, { organization: value })} placeholder="e.g. Local food pantry" maxLength={160} />
                <Field label="Start month" value={entry.startDate} onChange={(value) => changeResumeStartMonth(entry.id, value, entry.endDate)} type="month" />
                <Field label="End month (leave blank if current)" value={entry.endDate} onChange={(value) => changeResumeEndMonth(entry.id, value, entry.startDate)} type="month" />
                <Field label="Responsibilities and activities" value={entry.details} onChange={(value) => updateResumeEntry(entry.id, { details: value })} multiline placeholder="Describe what you actually did. Keep details specific and accurate." maxLength={800} />
                <Field label="Result, contribution, or achievement" value={entry.impact} onChange={(value) => updateResumeEntry(entry.id, { impact: value })} multiline placeholder="Add a result, contribution, recognition, or skill you can explain." maxLength={500} />
              </div>
            </article>)}
          </div> : <div className="resource-empty-state"><h3>Your experience list is empty.</h3><p>Add a job, volunteer role, club, leadership position, award, or academic project when you are ready.</p><button type="button" className="resource-button resource-button-primary" onClick={addResumeEntry}>＋ Add your first experience</button></div>}
          <p className="resource-private-note">{resumeEntries.length} of {MAX_RESUME_ENTRIES} entries used. Changes save automatically in your encrypted local vault.</p>
        </div>
        <div className="resource-resume-preview">
          <div className="resource-section-heading"><div><h2>Printable resume content</h2><p>Review the experiences you want to include. Add your name and contact details to the final copy only when you are ready to share it.</p></div></div>
          {resumeEntriesForPreview.length ? <div className="resource-resume-preview-sections">
            {RESUME_ENTRY_CATEGORIES.map((category) => {
              const entries = resumeEntriesForPreview.filter((entry) => entry.category === category);
              if (!entries.length) return null;
              return <section className="resource-resume-preview-section" key={category}>
                <h3>{category}</h3>
                {entries.map((entry) => {
                  const dateRange = [formatResumeMonth(entry.startDate), entry.endDate ? formatResumeMonth(entry.endDate) : entry.startDate ? "Present" : ""].filter(Boolean).join(" – ");
                  return <article className="resource-resume-preview-entry" key={entry.id}>
                    <div className="resource-resume-preview-topline"><b>{entry.role || entry.organization}</b>{dateRange && <span>{dateRange}</span>}</div>
                    {entry.role && entry.organization && <p className="resource-resume-organization">{entry.organization}</p>}
                    {entry.details && <p>{entry.details}</p>}
                    {entry.impact && <p>{entry.impact}</p>}
                  </article>;
                })}
              </section>;
            })}
          </div> : <div className="resource-empty-state resource-no-print"><h3>Your printable content will appear here.</h3><p>Add experience entries, then review the preview before using Print / Save PDF.</p></div>}
        </div>
        <p className="resource-private-note resource-no-print">Your entries are stored in this browser’s encrypted vault and included in your encrypted backup. They are not added to your scholarship profile or sent to scholarship discovery or analytics. Add contact details only to the copy you choose to share.</p>
      </section>}

      {active === "calendar" && <section className="resource-document resource-printable" aria-label="Junior to senior scholarship preparation calendar">
        <div className="resource-aid-progress"><div><b>{workspace.calendarCompleted.length} of {totalCalendarTasks}</b><span>planning tasks complete</span></div><progress max={totalCalendarTasks} value={workspace.calendarCompleted.length} aria-label="Calendar task completion" /></div>
        <div className="resource-important-note"><b>Use this as a flexible planning guide.</b> Months are approximate. Your school calendar, sponsor deadlines, state aid dates, and FAFSA award year may differ. Confirm every date with the official source.</div>
        <div className="resource-calendar">{RESOURCE_CALENDAR.map((phase, index) => {
          const complete = phase.tasks.filter((task) => workspace.calendarCompleted.includes(task.id)).length;
          return <section className="resource-calendar-phase" key={phase.id}>
            <div className="resource-calendar-phase-heading"><span>{String(index + 1).padStart(2, "0")}</span><div><small>{phase.label}</small><h2>{phase.title}</h2></div><b>{complete}/{phase.tasks.length}</b></div>
            <div className="resource-checklist">{phase.tasks.map((task) => <label className="resource-check-item" key={task.id}>
              <input type="checkbox" checked={workspace.calendarCompleted.includes(task.id)} onChange={(event) => toggleCalendar(task.id, event.target.checked)} /><span><b>{task.label}</b></span>
            </label>)}</div>
          </section>;
        })}</div>
        <div className="resource-source-links"><b>Check official dates</b>
          <a href="https://studentaid.gov/" target="_blank" rel="noreferrer">Federal Student Aid / FAFSA ↗</a>
          <a href="https://www.consumerfinance.gov/paying-for-college/" target="_blank" rel="noreferrer">Consumer Financial Protection Bureau: Paying for college ↗</a>
        </div>
        <p className="resource-private-note">Calendar progress saves in this browser’s encrypted vault and is included in your encrypted backup.</p>
      </section>}
      <Branding />
    </>}
  </div>;
}
