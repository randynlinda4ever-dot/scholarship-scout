# Student tools research and roadmap — November 28, 2026

**Repository:** `randynlinda4ever-dot/scholarship-scout`  
**Baseline:** `main` at `d757597eaf9b5153c6b45479146f09caae345ad9`  
**Implementation candidate:** [PR #31](https://github.com/randynlinda4ever-dot/scholarship-scout/pull/31)

## Executive decision

Scholarship Scout already implements most of the candidate tools named in the master assignment. Building another scholarship tracker, essay planner, recommendation tracker, financial-aid checklist, or deadline calendar would duplicate live workflows.

The one verified product gap selected for implementation is a structured **Activities & Resume Builder**. It extends the existing Resources workspace and existing encrypted local persistence. It does not use AI, upload a résumé, collect contact information, or send student records to another service.

The result is a six-tool Resources toolkit: five existing tools plus one net-new tool. The assignment explicitly says not to force a feature count; prioritizing one real gap is preferable to shipping several duplicate tools.

## Student-needs research

### Documented guidance

- The [Federal Student Aid aid-offer comparison guidance](https://studentaid.gov/articles/evaluating-financial-aid-offers/) explains comparing total cost and types of aid. Net price should subtract grants and scholarships, not student loans or work-study. This supports a transparent calculator with clearly separated cost and aid categories rather than one ambiguous "aid" total. 
- [USAGov's college-cost guidance](https://www.usa.gov/estimate-college-cost) points students to cost-estimation and comparison resources, including official net-price tools.
- [ACT's college-application guidance](https://www.act.org/content/act/en/students-and-parents/college-planning-resources/applying-to-college/planning-for-college.html) covers research, required materials, essays, recommendations, and timing. This aligns with the application's existing application-preparation workflow.
- The [Austin ISD McCallum High School College & Career Center resume guidance](https://mccallum.austinschools.org/department/college-career-center/resumes) identifies education, activities, leadership, community service, work, honors/awards, and skills/certifications as useful information students may organize for jobs, scholarships, college applications, and recommendation preparation.
- The [Xello High School & Beyond Plan curriculum PDF](https://xello.mcoutput.com/1365882/Texas%20TEKS%20Career%20Development%20and%20Xello.pdf) describes a student resume builder and a timeline for work and volunteer experiences. The useful pattern is keeping experiences updated over time so students do not have to reconstruct them later.

These sources support the selected categories and record-keeping workflow. They do not establish that every school or scholarship requires a résumé or that every student should use the same résumé format.

### Student discussions

Public student discussions offer anecdotal, not representative, evidence:
- In [a scholarship-organization discussion](https://www.reddit.com/r/scholarships/comments/1p5fi86/how_do_you_guys_organize_all_your_scholarship/), contributors described spreadsheets containing deadlines, recommendation letters, essay prompts, word counts, transcripts, and weekly actions; one response described moving from a large master list to a monthly snapshot to make the workload easier to review.
- In [an application-organization discussion](https://www.reddit.com/r/ApplyingToCollege/comments/1qqyiud/best_ways_to_organize_your_college_applications/), students discussed spreadsheets and Notion/Docs trackers with school/program, application type, deadlines, recommendation-letter dates, required materials, and priority.
- A [student reflection on application preparation](https://www.reddit.com/r/ApplyingToCollege/comments/1r12d99/i_wish_i_knew_about_college_apps_that_nobody_told/) emphasizes tracking deadlines, essay prompts, materials, and recommendation letters in one place.

These are community anecdotes with small and self-selected samples. They inform hypotheses about reducing scattered records and making the next action visible; they are not treated as survey statistics.

### Competitor and adjacent-product review

| Product / source | Observed pattern | Product implication |
|---|---|---|
| [ScholarshipTracker.org](https://www.scholarshiptracker.org/) | Public scholarship search with filters, effort/requirements context, deadline-oriented views and alerts | Discovery should make sponsor requirements and dates easy to compare without blurring ads and opportunities |
| [Scholarly tracker](https://tryscholarly.app/tools/scholarship-application-tracker/) | Status progression, countdowns, sorting, browser-local records, CSV export | Keep tracker actions compact and preserve user control over local data/export |
| [Scholified](https://www.scholified.com/) | Scholarship discovery, profile-based matching, deadline and application-status organization | Scholarship Scout already has the core discovery/tracking pattern; duplicating it is not valuable |
| [Xello](https://xello.mcoutput.com/1365882/Texas%20TEKS%20Career%20Development%20and%20Xello.pdf) | Experience timeline feeds a résumé | A structured activity record can serve future scholarship, work, and college-preparation needs |
| [Local school career-center guidance](https://mccallum.austinschools.org/department/college-career-center/resumes) | Organizes activities, service, work, leadership, awards, education, and skills | Use categories that match recognizable student experiences; do not fabricate résumé content |

No competitor UI or proprietary branding is copied.

## Existing Scholarship Scout capabilities

Verified in the active source:

| Capability | Current location | Current role |
|---|---|---|
| Scholarship search/discovery | Find scholarships | Generic search links and live public discovery |
| Scholarship tracker | My scholarships | Records, deadlines, status, filtering, sorting, archive, CSV |
| Application preparation | My scholarships → Application preparation | Core/custom checklist, essay prompts/drafts, recommendations, documents, review, submission/decision |
| Essay planning | Resources | Prompt interpretation, outline, manual drafting notes, revision checklist |
| Financial-aid planning | Resources | FAFSA task checklist and user-entered college-cost comparison |
| Scam prevention | Resources | Red-flag questions and trusted help links |
| Student timeline | Resources | Junior-to-senior planning calendar |
| Profile/eligibility | My profile | Explicit student-entered profile fields and deterministic eligibility rules |
| Encrypted storage/backup | Settings and application shell | Local encrypted vault and user-controlled encrypted backup/restore |

Do not create standalone duplicates of these tools. Improvements should connect existing records rather than introduce parallel models.

## Selected new tool: Activities & Resume Builder

### Student problem

A free-text activities field is not enough to maintain a useful history of paid work, volunteer service, leadership, school activities, awards, and academic projects. Students often need to assemble these details later for scholarships, jobs, and recommendation requests.

### Minimum viable scope implemented in PR #31

- Up to 30 structured experience entries.
- Categories: Work, Leadership, Community service, Activities, Awards & honors, and Academic projects.
- Fields: role/position, organization, start month, end month, responsibilities/activities, and result/contribution/achievement.
- Character bounds and safe unique identifiers.
- Month format validation and chronological start/end checks.
- Editable and removable entries.
- Grouped printable résumé-content preview.
- Print / Save PDF using the existing Resources print mechanism.
- Contact details are not stored in this workspace; students add those manually to the final copy if appropriate.

The tool deliberately does not claim every entry belongs on every résumé. Students choose what is relevant and confirm every statement is accurate.

### Data ownership and privacy

The new entries are stored in the existing `scout-resource-workspace` through the established encrypted local vault. The existing version-3 backup contains the resource workspace; the new field is additive and does not require a backup format version change. Older version-3 backups without `resumeEntries` remain valid.

The new fields are not merged into the scholarship eligibility profile, the `scholarship-discover` request, cloud sponsor records, analytics, advertising, or external résumé services. The existing encrypted backup is the only supported user-controlled export of the saved workspace. The print preview contains the user-entered experience content, and the student decides whether to save/share the generated print copy.

### Acceptance and verification

PR #31 adds tests for:
- Empty defaults and the 30-entry ceiling.
- Safe IDs and duplicate rejection.
- Bounded text normalization.
- Invalid months and end-before-start cases.
- Version-3 encrypted backup round-trip.
- Compatibility with older version-2 backups and version-3 resource objects without the new field.
- Resource page card, form, preview, and removal controls.

The first feature commit passed GitHub Actions: 885 tests passed, 0 failed, 0 skipped; dependency audit reported zero vulnerabilities; TypeScript and Vite production build passed. PR #31 remains a draft and has not been merged or deployed.

## Prioritized follow-up roadmap

### P1 — Safely complete frontend modularization

Use the preserved target architecture in `docs/frontend-module-architecture.md`, but reconcile each module with the live runtime first. The Settings and application-shell behaviors are particularly sensitive. Move one page at a time and keep shared persistence in the composition/domain layer.

### P1 — One coherent "next actions" view

Connect existing tracker deadlines, application-prep checklist progress, and the existing student calendar into a concise view of the next student-controlled actions. Keep one authoritative record for each deadline/task. Do not add a second reminder database, automatic outreach to recommenders, background notification service, or cloud sync.

### P2 — Clarify affordability comparisons

Keep the current transparent arithmetic. Make sure users enter total educational cost and grant/scholarship aid separately from work-study and loans. Label assumptions, time period, residency, housing, and academic-year context. Encourage checking each college's current official net-price calculator. A calculator must not imply a guaranteed aid award or replace a college financial-aid offer.

### P2 — Improve export and preparation continuity

Consider a student-controlled, local export of selected résumé sections and application checklists after validating what should be included. Keep any export deliberate and previewed. Do not upload essays, recommendation details, transcripts, or private records to third-party services by default.

### P2 — Browser accessibility and responsive verification

Run a manual viewport and keyboard matrix on the live PR preview after code review. Test the editor, date inputs, delete controls, print preview, mobile layout, theme variants, and zoom. Verify actual assistive-technology behavior rather than inferring conformance from source tests.

## Permanent non-AI requirement

No selected or implemented tool uses generative AI, machine learning, a model provider, an AI SDK, AI APIs, AI-generated recommendations, essay generation, or document analysis. The resume tool is user-authored structured data with deterministic validation and rendering only. This remains a product constraint for all future work.

## Sources

- Federal Student Aid: [Comparing aid offers](https://studentaid.gov/articles/evaluating-financial-aid-offers/)
- USAGov: [College costs](https://www.usa.gov/estimate-college-cost)
- ACT: [Applying to college](https://www.act.org/content/act/en/students-and-parents/college-planning-resources/applying-to-college/planning-for-college.html)
- Austin ISD McCallum High School: [Resume guidance](https://mccallum.austinschools.org/department/college-career-center/resumes)
- Xello: [High School & Beyond Plan curriculum](https://xello.mcoutput.com/1365882/Texas%20TEKS%20Career%20Development%20and%20Xello.pdf)
- Student discussions: [r/scholarships tracker organization](https://www.reddit.com/r/scholarships/comments/1p5fi86/how_do_you_guys_organize_all_your_scholarship/), [r/ApplyingToCollege application organization](https://www.reddit.com/r/ApplyingToCollege/comments/1qqyiud/best_ways_to_organize_your_college_applications/), and [application preparation retrospective](https://www.reddit.com/r/ApplyingToCollege/comments/1r12d99/i_wish_i_knew_about_college_apps_that_nobody_told/).
- Product review: [ScholarshipTracker.org](https://www.scholarshiptracker.org/), [Scholarly tracker](https://tryscholarly.app/tools/scholarship-application-tracker/), and [Scholified](https://www.scholified.com/).
