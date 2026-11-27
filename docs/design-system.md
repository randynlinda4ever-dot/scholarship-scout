# Scholarship Scout — Midnight Violet / Book & Compass

## Product principle
Scholarship Scout is a research workspace that keeps three things distinct: public scholarship leads, evidence from official sponsor sources, and private student profile/eligibility data. The interface should make the evidence trail legible without implying that a search lead is verified or that a profile match guarantees an award.

## Visual direction
**Midnight Violet, expressed through a book-and-compass mark.** The visual system is calm, structured, and navigational: the open pages represent the student's record and research; the rising route line represents a guided next step; the amber compass spark marks useful direction without implying certainty. The application remains a practical workspace, not a marketing dashboard. Deep violet and layered midnight surfaces carry focus, while amber is reserved for deadlines and review states and rose for expired or negative states. There is no green-based brand palette.

## Brand mark
- One reusable 48×48 inline SVG in `src/components/BrandMark.tsx`, shared by the workspace and legal acceptance gate.
- The mark combines open pages, a central spine, a route line, and an amber compass spark.
- Lavender-to-violet geometry uses `#C1B8FF`, `#9385F5`, and `#6655D2`; the compass accent is `#E8BD79`.
- Gradient IDs remain instance-safe through React `useId()`.
- The browser favicon uses the matching standalone `public/favicon.svg`.
- Navigation and KPI icons use a consistent 24×24 inline-stroke vocabulary rather than platform-dependent Unicode pictograms.

## Foundations
- Dark (default): background `#080918`, sidebar `#0D1128`, surface `#131A36`, raised surface `#1C2548`, text `#F7F5FF`, muted text `#A6A2C3`, violet `#A99FFF`, lavender `#D2CAFF`.
- Light (optional): background `#F5F3FB`, sidebar `#EFECF8`, surface `#FFFFFF`, raised surface `#F8F6FD`, text `#201B35`, muted text `#625A78`, violet `#6955C8`.
- Semantic states: warm amber for due-soon/review-needed states; muted rose for expired or ineligible states; violet for positive/verified states. Status labels remain explicit.
- Type: Source Serif 4 for primary page headings and large numerals; DM Sans for navigation, labels, forms, tables, and body copy. No additional font family is introduced.
- Shape: 9–12px surface radii, 8–10px control radii, thin cool-violet borders, and restrained offset shadows only where elevation is needed.
- Spacing: 4px base rhythm; 8/12/16/24/32px common intervals.
- Responsive: preserve the 320px minimum layout. Desktop uses a labeled 258px navigation rail and an explicit, locally remembered 76px collapsed state. Hover and focus never change rail geometry. Mobile retains the independent menu toggle and explicit open/close behavior.

## Component rules
- Primary action: violet filled button; secondary action: raised surface with visible cool-toned border.
- Inputs: visible labels, 44px minimum control height, clear violet focus outline.
- Navigation: one icon geometry and stroke weight; active state uses a tinted violet surface and a stable inset marker; hover never moves or resizes a target.
- Statuses: status text always remains explicit; color reinforces rather than replaces the label.
- Evidence and eligibility: distinguish verified, needs-review, unverified, pass, fail, and unknown states; never collapse unknown into pass.
- Tables: horizontal overflow is contained in the table region; row labels and values remain readable.
- Dialogs: preserve existing modal semantics, focus behavior, and task safeguards.
- Motion: short color and border transitions only. The sidebar has no hover expansion or width transition. Respect reduced-motion preferences.

## Non-goals
This redesign is visual and presentational. It does not change discovery, eligibility calculations, verification state, persistence, local-first privacy, cloud behavior, authentication, legal consent, or backup semantics. The user profile and eligibility data continue to remain local unless the existing, explicitly limited cloud actions are used.
