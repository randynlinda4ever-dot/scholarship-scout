# Scholarship Scout — Field Notes design system

## Product principle
Scholarship Scout is a research workspace that keeps three things distinct: public scholarship leads, evidence from official sponsor sources, and private student profile/eligibility data. The interface should make the evidence trail legible without implying that a search lead is verified or that a profile match guarantees an award.

## Visual direction
**Field Notes:** a modern public-library research desk translated into a calm, digital workspace. Warm paper surfaces, deep evergreen structure, restrained brass for dates and attention, editorial serif display typography, and practical sans-serif interface typography. The visual language is original and does not imitate a specific institution or publication.

## Foundations
- Light: paper `#F4F1E8`, clean paper `#FFFDF7`, evergreen `#365B49`, ink `#202B24`, muted ink `#626F64`, brass `#795B2E`.
- Dark: forest `#151E19`, raised forest `#202E25`, pale text `#F0EEE5`, sage `#B7C69A`, brass `#E0C27F`.
- Type: Source Serif 4 for primary page headings and large numerals; DM Sans for navigation, labels, forms, tables, and body copy.
- Shape: 7–10px control/card radii; thin warm-gray borders; no decorative glass or heavy shadows.
- Spacing: 4px base rhythm; 8/12/16/24/32px common intervals.
- Responsive: existing 320/390/430 mobile behavior retained; mobile navigation remains collapsible; desktop uses a persistent 258px labeled navigation rail.

## Component rules
- Primary action: evergreen filled button; secondary action: paper surface with visible border.
- Inputs: visible labels, 44px minimum control height, clear focus outline.
- Statuses: status text always remains explicit; color reinforces rather than replaces the label.
- Evidence and eligibility: distinguish verified, needs-review, unverified, pass, fail, and unknown states; never collapse unknown into pass.
- Tables: horizontal overflow is contained in the table region; row labels and values remain readable.
- Dialogs: preserve existing modal semantics, focus behavior, and task safeguards.

## Non-goals
This redesign is visual and presentational. It does not change discovery, eligibility calculations, verification state, persistence, local-first privacy, cloud behavior, authentication, or backup semantics.
