# Search visibility and public scholarship guides

**Implementation target:** GitHub production-source commit 08899927219f5cd8c2b5a40ac5e14059bf1bb388 (Vercel production deployment dpl_2ap8Gn1sXKwbj2TkztGvHQTw9eCL). A source commit does not itself prove Google indexing or ranking.

## Public routes

- / — application entry point with descriptive metadata and Organization/WebSite structured data.
- /scholarship-guides/ — index of the topic guides.
- /scholarship-guides/high-school-juniors/ — junior-year scholarship planning.
- /scholarship-guides/texas-scholarships/ — Texas state aid and scholarship search guidance.
- /scholarship-guides/scholarships-by-gpa/ — GPA thresholds, weighted scales, and matching considerations.
- /scholarship-guides/scholarships-by-major/ — major and field-of-study search strategy.
- /robots.txt and /sitemap.xml — public crawl directives and canonical URL list.

The guides are standalone static HTML under public/. Their text, title, canonical URL, and structured data are available in delivered HTML without executing or initializing the private student workspace.

## Accuracy and privacy boundaries

- Search visibility copy describes opportunities as research leads, never as verified, guaranteed, or currently open awards.
- Live discovery sends only state, expected graduation year, and selected category IDs.
- GPA and school details remain local; GPA may be compared locally against sponsor criteria. Major/interest searches are user-initiated, and the public live-discovery request does not contain major or GPA fields.
- The legal acceptance screen, verified email gate, local encrypted student-data vault, Supabase RLS, and account/data boundaries are preserved.
- Texas state grant descriptions point to the Texas Higher Education Coordinating Board and state that program rules and eligibility vary. They do not imply Texas residency alone qualifies a student.
- Guide content points to official sources and avoids publishing invented award amounts, sponsor details, or application deadlines.

## Release and indexing verification

1. Run node --test tests/seoPages.test.mjs, npm test, and npm run build.
2. Confirm Vite copies public/scholarship-guides/, public/robots.txt, and public/sitemap.xml into dist/.
3. Verify Vercel rewrites serve static HTML for every guide route before the private-workspace SPA fallback.
4. Verify production responses return HTTP 200, canonical URLs use https://scholarship-scout.org, and no unexpected noindex response header applies to the custom domain.
5. Verify Googlebot can fetch the guides and sitemap. Check for unexpected robots directives and canonical conflicts.
6. In Google Search Console, verify the domain property, submit https://scholarship-scout.org/sitemap.xml, and inspect each guide URL. Indexing and ranking remain Google's decisions and are not guaranteed.

## Editorial maintenance

Recheck state-program descriptions, external source URLs, and current requirements at least once per academic application cycle. Update each guide's sitemap lastmod after substantive content changes. Avoid doorway pages, keyword-stuffed variants, fake testimonials, fabricated scholarship counts, ratings, or award guarantees. Keep a distinct search intent and meaningful original guidance on every route.
