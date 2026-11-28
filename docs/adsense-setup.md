# AdSense setup and release checklist

**Publisher-account administration is for the adult account owner only.** The site's operator is under 18, so a parent or legal guardian must manage the AdSense account, site approval, settings, and any payments. Do not share Google passwords, recovery codes, or account credentials with the student or put them in this repository.

## Current implementation state

The repository contains a manually placed AdSense integration, but it is **disabled by default**. No publisher ID or ad-unit ID has been supplied to the source, and no Vercel secret or credential is required. The IDs used by the client are public identifiers, not passwords.

The loader only runs on `https://scholarship-scout.org` when all of these conditions are met:

- `public/adsense-config.js` has `enabled: true` and valid real publisher and ad-unit IDs.
- The browser has a saved affirmative choice in the separate advertising-preference control.
- The preference is made by an adult authorized to decide for the visitor; for visitors under 18, the parent or legal guardian must make the choice.
- The page is one of the five explicitly approved public scholarship-guide pages.

The setting in `public/adsense-config.js` is deliberately:

```js
window.SCHOLARSHIP_SCOUT_ADS_CONFIG = Object.freeze({
  enabled: false,
  publisherId: "",
  publicGuideSlotId: "",
});
```

Do not change these values until the adult publisher has completed the steps below. The site's consent checkbox is an acknowledgement only. It does not prove age, verify a guardian's identity, or replace a legally required consent mechanism.

## Adult publisher setup

1. Sign in to the existing AdSense account using the adult account owner's Google Account. In AdSense, open **Sites**, add `scholarship-scout.org`, and complete the verification method AdSense presents. Do not share account access or payment information.
2. Complete the publisher account and payment profile tasks shown in AdSense. Wait until the site's status is **Ready** before expecting any ad to serve. A newly added site may show **Requires review** or **Getting ready**; do not enable ads while that status is pending or shows **Needs attention**.
3. Create one manual, responsive display ad unit named **Public Scholarship Guides**. Do not enable Auto ads, anchor ads, vignette ads, in-page automatic placements, or automatic refresh. Copy the publisher client ID (`ca-pub-...`) and the ad-unit slot ID from the actual generated ad unit.
4. In `public/adsense-config.js`, replace the empty values with the exact IDs supplied by AdSense and set `enabled: true` only after site approval and the privacy checks in this document are complete. These are public identifiers; never add an AdSense password, API token, payment detail, or other secret.
5. If AdSense specifically requires an `ads.txt` file, use the exact line provided by the adult-owned AdSense account. Do not guess or synthesize a publisher record.
6. In AdSense **Brand safety / Blocking controls**, review site-level sensitive-category controls and block inappropriate categories wherever the provider offers them: gambling, alcohol, tobacco/vaping, recreational drugs, adult content, weapons, predatory financial products, misleading financial opportunities, and political advertising. Review the Ad Review Center periodically. AdSense category controls may not provide an exact block for every requested category; do not claim that all such ads are technically excluded if the provider does not offer that control.
7. Keep personalized advertising, remarketing, audience targeting, customer matching, user-provided data, and Google Signals disabled. Use the provider's aggregate reporting only. The site sends non-personalized ad requests and includes the teen age-treatment attribute for each ad unit; this does not eliminate every cookie or identifier. Google may still use limited identifiers for frequency capping and aggregated reporting.
8. Review the location of site visitors and applicable consent requirements before enabling the flag. Google's AdSense publisher guidance requires a Google-certified CMP integrated with IAB TCF when serving **personalized** ads to visitors in the EEA, UK, or Switzerland. This implementation requests non-personalized ads and its simple acknowledgement is **not** a certified CMP or a legal compliance determination. Do not serve ads in a jurisdiction unless the adult publisher has confirmed that the actual ad mode, consent mechanism, and regional requirements are satisfied. Configure appropriate regional exclusions or add a suitable certified CMP before enabling traffic that needs one.
9. Review the live ad and category controls after launch. Keep ads off if the site approval, consent requirements, teen/minor treatment, or content restrictions are unresolved.

## Placement and data boundaries

One responsive placement is available on each of these five public, text-based pages:

- `/scholarship-guides/`
- `/scholarship-guides/high-school-juniors/`
- `/scholarship-guides/texas-scholarships/`
- `/scholarship-guides/scholarships-by-gpa/`
- `/scholarship-guides/scholarships-by-major/`

There are no ad units or AdSense scripts on the application workspace, sign-in or registration, profile, settings, saved scholarships, discovery/search, scholarship application workflows, or API documentation. Ads do not affect organic scholarship ranking and must never be represented as scholarship opportunities.

The loader does not access local-vault or account data and does not send profiles, school details, grades, state, graduation year, eligibility, scholarship searches, application content, form fields, or user identifiers to AdSense. The only locally stored advertising choice is `granted` or `denied`. Storage failures leave ads off. An ad blocker, script error, or missing configuration must not affect page functionality.

## Verification

After the adult publisher confirms approval and enters real IDs:

- Confirm the production source is the intended commit and that the config remains disabled on previews and local development.
- On the production domain, check that the page has at most one labelled placement and excluded routes have none.
- Before consent, inspect the page and network panel: there must be no request to `pagead2.googlesyndication.com`.
- Decline; reload; confirm no AdSense request. Then, only with the authorized adult making the choice, opt in and confirm the async AdSense script loads.
- Verify the request is non-personalized (`requestNonPersonalizedAds = 1`) and that the rendered `ins.adsbygoogle` includes `data-tag-for-age-treatment="2"`.
- Confirm a real ad response in the adult owner's AdSense reporting. A loaded script or an empty ad slot is not proof of a served impression or revenue.
- Test mobile and desktop layout, blocked-script behavior, and the page's layout stability. Keep the unit from appearing next to navigation, scholarship actions, or other controls.

Repository tests cannot inspect the parent-owned AdSense account, validate approval, prove legal compliance, or establish that an ad impression occurred. Do not report advertising as live or revenue-generating until the adult account owner has completed the provider-side review and actual serving has been verified.
