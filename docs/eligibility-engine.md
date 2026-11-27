# Eligibility engine

## Location and privacy

Eligibility logic lives in src/eligibility.js and is called inside the browser app. Student-specific profile data and assessment results are local. The app does not save eligibility_checks rows to Supabase.

## Outcomes

The current engine can return:

- Eligible.
- Rules match — source unverified.
- Needs information.
- Ineligible.
- Expired.

Individual checks are represented as pass, fail, or unknown and include a plain-language explanation. A structured criterion can be scored as pass or fail only when it has its own non-empty excerpt and HTTPS evidence URL on the same recognized official sponsor domain as the scholarship source. A sponsor-wide excerpt, a directory link, a different sponsor domain, or a missing/unsafe URL leaves the criterion unknown. Source verification and a student's eligibility are separate concepts.

Current precedence is:

1. A confirmed expired deadline produces Expired, except when a future sponsor-confirmed opening date shows the opportunity is not open yet or the opening/deadline range is inconsistent; those cases remain Needs information.
2. Any confirmed failed comparison produces Ineligible.
3. Any blocking unknown requirement produces Needs information.
4. If there are no blocking unknowns but the sponsor record is not verified, status is Rules match — source unverified.
5. Otherwise, status is Eligible.

The "Rules match — source unverified" label means the recorded structured criteria match the profile, but the sponsor's source has not passed verification. It is not an award prediction. The engine returns Eligible only when the structured rules match and the sponsor source passes the verification checks. No status guarantees an award.

## Missing profile information

A missing profile field must not count as a failed eligibility test. The current correction makes missing state, district, education level, graduation year, age, planned major/interests, and planned college produce unknown checks. A nonempty mismatching value can still fail an explicit requirement.

Age is entered as an optional whole number in the local profile; no date of birth is collected or sent to discovery. Sponsor age limits use an explicit age-range rule with independently specified inclusive or exclusive minimum and maximum boundaries. A boundary without clear inclusivity wording, an invalid range, or a missing/invalid profile age remains Unknown. For example, “at least 18” is a minimum of 18 inclusive, while “over 18” is a minimum of 18 exclusive; “under 25” is a maximum of 25 exclusive.

Citizenship matching no longer uses a substring test that could treat the phrase "not a U.S. citizen" as a positive result. A U.S.-citizen requirement requires an explicit U.S. citizen or U.S. national statement; explicit non-citizen language fails; ambiguous or blank values remain unknown. The engine does not infer financial need.

## Supported rules and current limitations

The engine handles structured requirements including applicant state of residence, current school location state, intended college location state, school district, explicit inclusive/exclusive age ranges, grade/education level, graduation year, citizenship, GPA, class rank, ACT, SAT, alternative ACT-or-SAT thresholds, academic fields, planned institution, explicit enrollment-status alternatives (full-time, part-time, incoming college, or current student), service hours, membership, financial need, first-generation status, application fee warnings, and additional sponsor requirements. Enrollment alternatives use OR semantics: one explicitly supported route passes; all routes must be explicitly ruled out to fail; unresolved routes remain Unknown. The legacy full-time-only flag remains supported and now requires an explicit full-time status rather than a generic confirmation. These three geographic fields are evaluated independently: residence uses `profile.state`, current school location uses `profile.schoolState`, and intended college location uses `profile.plannedCollegeState`. Missing location values remain unknown.

Education-level matching requires an explicit mapping. High-school senior status is supported by an explicit high-school-senior label or a numeric grade 12 entry; current high-school student status requires an explicit high-school label or numeric grade 9–12. Undergraduate status requires an explicit undergraduate/college-student label or a college-qualified class-year label (for example, “College freshman”). Bare “Freshman,” “Junior,” or “Senior” labels and “Class of YYYY” cohort labels do not establish which education level applies, so the matching check remains unknown. A class-of year is evaluated separately through the explicit graduation-year criterion and is never converted into a grade number.

## Mandatory and preferred criteria

Each recorded structured criterion can be classified as **Mandatory — must be met** or **Preferred — does not disqualify** in the scholarship editor. Existing records without a classification remain mandatory for backward compatibility. The classification is stored alongside the sponsor's structured criteria and round-trips through the existing cloud eligibility JSON; it does not change database schema or send student profile information.

Preferred checks retain their pass/fail/unknown result and evidence details for transparency, but they are separated into an informational group and do not affect the overall eligibility status or mandatory pass/fail/unknown counts. Missing preferred evidence therefore remains visible without blocking a match. Mandatory failures still produce Ineligible, and mandatory unknowns still produce Needs information. If a record contains only preferred criteria, Scout reports Needs information until at least one mandatory sponsor rule is recorded; preferred strengths alone cannot establish eligibility.

The classification is a human-entered interpretation of the sponsor's wording. It does not infer whether a rule is mandatory or preferred, and sponsor wording should be checked before classifying it.

Important remaining limits:

- Optional context that is not an eligibility qualification remains outside the structured rule engine; only criteria explicitly entered by the user are evaluated.
- Eligibility results are local; they are not synchronized to public.eligibility_checks.
- Sponsor rule extraction is provisional until a human confirms it against the official source.
- GPA scale comparability and other sponsor-specific qualification paths beyond the modeled enrollment and ACT/SAT alternatives still deserve more explicit modeling and tests.
- Profile changes do not automatically remove records from the user's tracker.

## Tests

tests/eligibilityMissingProfile.test.mjs adds six missing-information regression cases and an explicit non-citizen case. The focused eligibility run passed 30 tests in the validation workspace after the correction. Full-suite verification on the final artifact revision is still pending.
