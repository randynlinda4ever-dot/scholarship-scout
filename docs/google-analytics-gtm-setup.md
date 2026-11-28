# Google Analytics and Tag Manager setup

**Adult account owner only.** The Google Tag Manager container `GTM-T6NTTR5X` is owned and administered by the site's adult account owner. Do not share account credentials or give students access to the Google Analytics administration account.

The site-side integration is intentionally basic-consent mode: the GTM script is not requested until a visitor explicitly enables optional analytics. The loader sends only fixed page-category values and keeps all advertising consent types denied. A visitor can withdraw consent from the persistent Privacy choices control or Settings.

## Required container configuration

1. In the existing GTM container, confirm the container ID is `GTM-T6NTTR5X`. Create or select the GA4 property and add its Google tag using the property’s Measurement ID.
2. Configure the Google tag so it does **not** automatically send page views (`send_page_view = false`). The site supplies a sanitized static page location/title and sends page categories explicitly.
3. Disable Enhanced Measurement options that automatically collect scrolls, outbound clicks, site searches, form interactions, file downloads, video engagement, and history-based page views. Do not enable Google Signals, ads personalization, Google Ads linking, user-provided data, cross-domain identifiers, or User-ID features.
4. Create one GA4 Event tag. Use a Custom Event trigger whose event name is `scout_page_view`. Configure the GA4 event name as `page_view`, and add exactly one event parameter:
   - Parameter name: `page_type`
   - Value: a Data Layer Variable named `page_type`
5. Do not add other tags, custom HTML, advertising/remarketing tags, conversion tags, or variables that read page URL, page title, referrer, form values, search terms, profile data, or account details.
6. Keep advertising consent disabled in the property and container. Retain only the shortest data-retention period suitable for the site's reporting needs. Review Google’s current Analytics privacy and data-retention controls before publishing.
7. Preview the container configuration, then publish it from the adult-owned GTM account. The site's Vercel previews and local development intentionally do not load the GTM script; validate after the site integration is released by opting in on the production domain and checking GA4 Realtime/DebugView.

The event name `page_view` keeps GA4's page-view reporting available. All events use the same static page location and title; the `page_type` custom parameter distinguishes the broad sections. Register `page_type` as an event-scoped custom dimension in GA4 if it is to be used in standard explorations and reports.

## Data that the application sends

The data layer event contains only:

```js
{
  event: "scout_page_view",
  page_type: "overview" // one of the fixed categories in public/analytics-consent.js
}
```

The application does not send page URLs, titles, referrers, student names, email addresses, account IDs, schools, grades, eligibility values, scholarship search terms/filters, form entries, essays, or other free-form text. Google may still process ordinary browser/network metadata and analytics identifiers after opt-in; this is disclosed in the site's Privacy Notice.

Do not treat a published GTM container as verified merely because its tag is present. Confirm in GA4 Realtime that the event arrives only after an explicit opt-in and that the only custom event parameter is `page_type`. If the container has any unapproved tags or data-layer variables, remove them before publishing.
