import { useEffect, useRef, useState, type ReactNode, type UIEvent } from "react";
import { LEGAL_ACCEPTANCE_STORAGE_KEY, createLegalAcceptanceRecord, isCurrentLegalAcceptance } from "../legal/acceptance.js";
import { LEGAL_EFFECTIVE_DATE, LEGAL_SECTIONS, LEGAL_ACCEPTANCE_VERSION } from "../legal/terms";
import { BrandMark } from "./BrandMark";
import "./LegalAcceptanceGate.css";

const REVIEW_EVENT = "scholarship-scout:review-legal";

function readAcceptance(): boolean {
  try {
    return typeof window !== "undefined" &&
      isCurrentLegalAcceptance(window.localStorage.getItem(LEGAL_ACCEPTANCE_STORAGE_KEY));
  } catch {
    return false;
  }
}

export default function LegalAcceptanceGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(readAcceptance);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [ageGroup, setAgeGroup] = useState<"adult" | "minor" | "under13" | "">("");
  const [guardianConfirmed, setGuardianConfirmed] = useState(false);
  const [readToEnd, setReadToEnd] = useState(false);
  const [storageError, setStorageError] = useState("");
  const legalDocumentRef = useRef<HTMLDivElement>(null);
  const gateOpen = !accepted || reviewOpen;

  useEffect(() => {
    if (!gateOpen) return;
    const element = legalDocumentRef.current;
    if (element && element.scrollHeight <= element.clientHeight + 12) {
      setReadToEnd(true);
    }
  }, [gateOpen]);

  useEffect(() => {
    const openReview = () => {
      setChecked(false);
      setAgeGroup("");
      setGuardianConfirmed(false);
      setReadToEnd(false);
      setStorageError("");
      setReviewOpen(true);
    };
    window.addEventListener(REVIEW_EVENT, openReview);
    return () => window.removeEventListener(REVIEW_EVENT, openReview);
  }, []);

  const handleAccept = () => {
    if (!checked || !readToEnd) return;
    if (ageGroup !== "adult" && ageGroup !== "minor") return;
    if (ageGroup === "minor" && !guardianConfirmed) return;
    try {
      const receipt = createLegalAcceptanceRecord(new Date().toISOString(), {
        ageGroup,
        guardianConfirmed,
      });
      window.localStorage.setItem(LEGAL_ACCEPTANCE_STORAGE_KEY, receipt);
      if (!isCurrentLegalAcceptance(window.localStorage.getItem(LEGAL_ACCEPTANCE_STORAGE_KEY))) {
        throw new Error("The acceptance receipt could not be verified in this browser.");
      }
      setAccepted(true);
      setReviewOpen(false);
      setChecked(false);
      setAgeGroup("");
      setGuardianConfirmed(false);
      setStorageError("");
    } catch {
      setStorageError("Scholarship Scout could not save your acceptance in this browser. Check your browser storage settings and try again. The workspace will remain locked until acceptance can be saved.");
    }
  };

  const handleDocumentScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 12) {
      setReadToEnd(true);
    }
  };

  if (!gateOpen) return <>{children}</>;

  return (
    <main className="legal-gate-screen">
      <section className="legal-gate-panel" role="dialog" aria-modal="true" aria-labelledby="legal-gate-title" aria-describedby="legal-gate-intro">
        <header className="legal-gate-header">
          <div className="legal-gate-brand"><BrandMark className="legal-gate-mark"/><span>Scholarship Scout</span></div>
          <p className="legal-gate-kicker">REQUIRED BEFORE ACCESS</p>
          <h1 id="legal-gate-title">Terms of Service &amp; Privacy Notice</h1>
          <p id="legal-gate-intro">Review the full notice, choose an age group, and confirm your agreement before entering the workspace.</p>
          <p className="legal-gate-version">Effective {LEGAL_EFFECTIVE_DATE} · Version {LEGAL_ACCEPTANCE_VERSION}</p>
        </header>

        <div ref={legalDocumentRef} className="legal-document" role="region" aria-label="Terms of Service and Privacy Notice. Scroll to the end to continue." tabIndex={0} onScroll={handleDocumentScroll}>
          {LEGAL_SECTIONS.map((section) => (
            <section className="legal-document-section" key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              {section.bullets ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
            </section>
          ))}
        </div>

        <footer className="legal-gate-footer">
          {!readToEnd ? <p className="legal-gate-scroll-hint" role="status">Scroll through the entire notice to enable acceptance.</p> : <p className="legal-gate-scroll-hint" role="status">You have reached the end of the notice.</p>}
          <label className="legal-age-control">
            <span>Age group</span>
            <select
              className="legal-age-select"
              name="legal-age-group"
              value={ageGroup}
              onChange={(event) => {
                const value = event.target.value as "adult" | "minor" | "under13" | "";
                setAgeGroup(value);
                setGuardianConfirmed(false);
                if (value === "under13") setChecked(false);
              }}
            >
              <option value="">Choose an age group</option>
              <option value="adult">I am 18 or older</option>
              <option value="minor">I am 13 through 17</option>
              <option value="under13">I am under 13</option>
            </select>
          </label>
          {ageGroup === "minor" ? <label className="legal-guardian-check">
            <input type="checkbox" checked={guardianConfirmed} onChange={(event) => setGuardianConfirmed(event.target.checked)} />
            <span><b>Parent or guardian authorization</b> I am this user's parent or legal guardian. I reviewed this notice and authorize this 13–17-year-old to use Scholarship Scout.</span>
          </label> : null}
          {ageGroup === "under13" ? <p className="legal-gate-error" role="alert">Scholarship Scout is not available to children under 13. Do not continue or submit information.</p> : null}
          <label className="legal-acceptance-check">
            <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} disabled={ageGroup === "under13" || ageGroup === ""} />
            <span>I have read and agree to the Terms of Service and acknowledge the Privacy Notice, including the Service's stated limits and my responsibilities.</span>
          </label>
          {storageError ? <p className="legal-gate-error" role="alert">{storageError}</p> : null}
          <p className="legal-gate-footnote">Age and guardian selections stay on this device; age and guardian identity are not verified.</p>
          <div className="legal-gate-actions">
            {accepted ? <button type="button" className="legal-gate-secondary" onClick={() => setReviewOpen(false)}>Close without changing acceptance</button> : null}
            <button type="button" className="legal-gate-primary" disabled={!checked || !readToEnd || !ageGroup || ageGroup === "under13" || (ageGroup === "minor" && !guardianConfirmed)} onClick={handleAccept}>Accept and continue</button>
          </div>
        </footer>
      </section>
    </main>
  );
}
