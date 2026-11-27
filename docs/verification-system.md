# Scholarship source verification

## Principle

A discovered search result is an unverified lead. A domain suffix, polished web page, or search-engine ranking is not proof that a scholarship is genuine or currently available.

## Current review workflow

The current UI and evidence helpers separate source quality from personal eligibility. The evidence layer checks for a safe HTTPS source, a recognized source authority, sponsor identity, award information, deadline information or an explicit no-fixed-deadline statement, eligibility evidence, and a recent sponsor-check date.

Current app-facing source states include verified, needs-review, and expired. Newly discovered web results remain unverified leads. Last discovery date is not substituted for a sponsor review date.

Cloud schema status values are more limited: unverified, needs_review, verified, and rejected. Mapping from local evidence state to cloud status is deliberately conservative.

## Manual confirmation

Before marking a source verified, a reviewer must inspect the official sponsor, institution, or recognized government page and record the evidence needed by the source helper. Government authority is assigned only to the explicit allowlist in the evidence helper (studentaid.gov, ed.gov, grants.gov, usa.gov, dol.gov, and texas.gov, including their subdomains); an arbitrary .gov domain or a lookalike suffix remains unverified. Aggregator-only pages and missing required information remain needs-review. Stale sponsor-check dates require another review. The app does not automatically declare legitimacy from a domain suffix.

## Automated verification

The repository contains supabase/functions/scholarship-verify/index.ts as a disabled placeholder. Its LIVE_VERIFICATION_ENABLED flag is false. The source explicitly refuses sponsor extraction while disabled. No scholarship-verify Edge Function is deployed.

Automated retrieval or extraction should remain a future opt-in pipeline. It must preserve source URLs and dates, compare new information against current records, flag conflicts, and require human review. It must not silently overwrite verified details or independently declare a sponsor legitimate.

## Remaining work

- Expand the user-facing lifecycle to distinguish discovered, needs review, source confirmed, details reviewed, current, expired, unavailable, and disputed.
- Store evidence provenance and review dates consistently.
- Add user reporting for questionable records.
- Add plain-language scholarship scam guidance and authoritative consumer-protection links.
