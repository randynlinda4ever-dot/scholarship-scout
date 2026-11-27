# Scholarship Scout methodology and result labels

This guide explains what Scout's discovery, source-review, and eligibility labels mean. Scout helps organize research; it does not decide who receives an award.

## 1. Discovery results are leads, not verified awards

Live search finds public pages that may describe scholarships. A result begins as an **unverified lead**. Search ranking, a familiar-looking website, a secure connection, or a directory listing does not establish that an award is genuine, open, or sponsored by the organization named in the listing.

Scout validates that displayed source links use public HTTPS URLs and classifies a source as an official sponsor, official program, official school, or official government source only when its host matches the application's explicit recognized-domain list. Government authority is limited to the listed roots (currently studentaid.gov, ed.gov, grants.gov, usa.gov, dol.gov, and texas.gov) and their subdomains; an arbitrary .gov domain or a lookalike suffix is not enough. Other domains remain unverified leads. This is a bounded allowlist, not a universal directory of legitimate organizations.

## 2. Source-review labels

Source review describes the quality and freshness of the scholarship listing evidence. It is separate from a student's eligibility result.

- **Verified** — the record has a recognized official HTTPS source; sponsor identity and award details; a valid deadline or explicit evidence that no fixed deadline is published / that the program has a rolling or recurring deadline; supporting eligibility evidence; criterion-specific evidence for every active structured criterion; and a sponsor check dated within the last 30 days. The record must also be explicitly marked reviewed.
- **Needs review** — the record is incomplete, newly discovered, based on an unrecognized or secondary source, missing required evidence, missing a recent sponsor-check date, or otherwise does not satisfy every verification condition. A discovery date does not count as a sponsor review.

An explicitly recorded but impossible calendar date (for example, February 30 or a non-leap-year February 29) remains unconfirmed and requires sponsor review. Rolling or no-fixed-deadline wording cannot override a contradictory malformed date; remove the structured date only after the sponsor confirms that no fixed date applies.
- **Expired** — a recorded valid calendar deadline is earlier than the current date in the applicable calendar/time-zone calculation. A date-only deadline is not treated as expired during that calendar date. Scout does not invent a cutoff time or time zone.

A source can be official without its scholarship details being fully reviewed. Likewise, a “Verified” label means the recorded listing evidence passed Scout's checks; it is not a guarantee that the sponsor will fund the award, that the page has not changed since review, or that every real-world condition has been captured.

Source review is currently a manual workflow. The automated scholarship-verification function is disabled and is not deployed. Review the sponsor's current official rules yourself before relying on dates, amounts, or requirements.

## 3. Eligibility outcomes

Eligibility compares the student's locally stored profile with the structured sponsor criteria recorded in Scout. Each criterion is shown separately as:

- **Pass** — the available profile information matches the recorded criterion.
- **Fail** — the available profile information conflicts with the recorded criterion.
- **Unknown** — required information is missing, ambiguous, not supported by the rules engine, or lacks criterion-specific official-source evidence. Unknown is not a pass or a fail.

The overall result follows this precedence:

1. **Expired** — the recorded deadline has passed.
2. **Ineligible** — at least one recorded comparison is a confirmed failure.
3. **Needs information** — at least one blocking requirement is unknown, or no structured checks are available.
4. **Rules match — source unverified** — the recorded criteria match, but the scholarship source has not passed verification.
5. **Eligible** — the recorded structured criteria pass and the source is verified.

“Eligible” therefore means only that the requirements currently entered in Scout matched the profile under the implemented checks. It does not mean the sponsor has accepted an application, independently validated the profile, or selected the student. Sponsor decisions and requirements not entered in Scout may still apply.

## 4. What the evidence checks require

For a source to be marked verified, Scout checks the source URL, recognized source authority, sponsor name, award information, deadline evidence, supporting evidence, and review freshness. Every excerpt remains paired with its own exact recorded page URL: general evidence uses its supporting-evidence URL, award wording uses its award-evidence URL, and each active structured criterion (for example, residency or a minimum GPA) uses that criterion's own URL. These excerpt URLs must be HTTPS pages on the same recognized official sponsor domain as the scholarship source. The interface derives each excerpt's displayed attribution from that excerpt's URL; it never borrows the scholarship URL or another excerpt's attribution. A general sponsor excerpt or a link to a different organization's site is not enough to verify an individual criterion.

The rules engine only evaluates structured criteria it knows how to interpret. Some requirements deliberately remain unknown rather than being guessed. For example, financial need is not inferred from profile details; additional sponsor requirements remain unknown until resolved; and organization membership or achievement claims may still need direct sponsor confirmation. A profile match is not proof that the sponsor accepts the interpretation.

## 5. Important limitations and recommended review

- The recognized official-domain list is limited and may not include every legitimate sponsor. An unrecognized domain stays unverified; do not interpret that label alone as proof of fraud.
- Search results can be stale, incomplete, duplicated, or unrelated. Live-result normalization uses a strict field allowlist: source authority and verification labels are reset to unverified, arbitrary label fields from search metadata are discarded, and discovery categories are retained only when they match the application's known category IDs. A result's displayed source attribution is derived from that result's own source URL, never from a neighboring result or search-engine metadata. Scout does not guarantee that an opportunity is currently accepting applications.
- Source review checks recorded evidence and a 30-day review date; it cannot guarantee that a sponsor page remains unchanged after review.
- The rules engine supports a defined set of structured requirements, including mandatory versus preferred criteria and explicit ACT/SAT and enrollment alternatives. Unsupported or malformed numeric thresholds remain Unknown rather than being treated as a mismatch; complex alternatives and sponsor-specific definitions may still need manual interpretation.
- Student profile comparisons run locally in the browser. They are not a sponsor decision or an independent validation of student-provided information.
- Award text is shown as entered. Unless the sponsor's terms explicitly state the payment basis, Scout does not infer whether an amount is one-time, annual, renewable, or per recipient.
- A missing deadline or cutoff time is not guessed. For annual programs, a prior-cycle date remains in its recorded year and is never advanced from wording such as “annually” or “each September.” If the sponsor has not confirmed the current-cycle date, leave it unconfirmed. Record a sponsor-confirmed application opening date separately from the final deadline: before that date, the opportunity is Not open yet, not Expired, even if a stale prior-cycle deadline remains. If the recorded final deadline precedes the opening date, treat the date range as inconsistent and require sponsor review rather than classifying it as overdue. Use only a sponsor-stated opening time zone; otherwise retain date-only local-calendar behavior. Confirm the exact current-cycle dates and any stated time zone on the sponsor's current page.
- No application is submitted and no sponsor is contacted by the verification or eligibility checks.

Before applying, open the current official sponsor page, confirm the award cycle, amount and payment terms, deadline and time zone, eligibility definitions, required documents, and any fees. Treat unexpected application fees as a warning and use authoritative consumer-protection guidance when evaluating a suspicious offer.
