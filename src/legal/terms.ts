import { LEGAL_ACCEPTANCE_VERSION } from "./acceptance.js";

export const LEGAL_EFFECTIVE_DATE = "November 27, 2026";
export { LEGAL_ACCEPTANCE_VERSION };

export type LegalSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export const LEGAL_SECTIONS: readonly LegalSection[] = [
  {
    title: "1. Agreement and acceptance",
    paragraphs: [
      "These Terms of Service and Privacy Notice govern your access to and use of Scholarship Scout, including its website, required email authentication, encrypted local workspace, scholarship discovery tools, eligibility comparisons, tracker, application-preparation workspace, and optional cloud saving of sponsor records (the Service). By checking the acceptance box and selecting Accept and continue, you acknowledge that you have reviewed this notice and agree to these terms. If you do not agree, do not use the Service.",
      "This notice describes the current application behavior reflected in the source code and project privacy documentation as of the effective date above. Features, providers, and data flows can change. A new version number is used when the terms materially change; the Service will require a new acceptance for that version.",
    ],
  },
  {
    title: "2. Age requirements and minors",
    paragraphs: [
      "Scholarship Scout is intended for people who are at least 13 years old and is not directed to children under 13. If you are under 13, do not use the Service. The application asks each visitor to affirm that they are at least 13, but it does not independently verify age or prevent a visitor from making a false statement. The operator does not intend to collect personal information from children under 13. If a parent or guardian believes a child under 13 has submitted personal information, contact the privacy address in Section 20 so the report can be reviewed and information under the operator's control can be handled as required by applicable law.",
      "If you are 13 through 17, a parent or legal guardian must personally review this notice and permit your use before you continue. The acceptance screen has a separate parent/guardian acknowledgement followed by the student's own acceptance. The local receipt records only the selected age group and whether the guardian acknowledgement was checked; it does not collect a guardian's name or verify a guardian's identity, and it is not a verifiable-consent process under the Children's Online Privacy Protection Rule (COPPA). Do not proceed unless a parent or legal guardian has actually reviewed this notice and permitted your use.",
      "Parents and guardians should help minors decide what information to enter, secure the device and browser profile, review external scholarship links, and confirm sponsor requirements before a student relies on a listing.",
    ],
  },
  {
    title: "3. What Scholarship Scout provides",
    paragraphs: [
      "Scholarship Scout is an organizational and research aid. It can create manual scholarship search links, request automated research of public scholarship pages, display candidate information, compare sponsor criteria that a user records, organize saved opportunities, track deadlines, and keep application-preparation notes and drafts in the browser.",
      "The Service is not a scholarship provider, school, college, government agency, financial-aid office, admissions office, lender, tax adviser, attorney, or representative of any sponsor. Scholarship Scout does not award, fund, approve, administer, or guarantee any scholarship and is not affiliated with a sponsor merely because a listing or link appears in the Service.",
    ],
  },
  {
    title: "4. No advice, eligibility decision, or award guarantee",
    paragraphs: [
      "Search results, extracted rules, summaries, match scores, eligibility statuses, deadline displays, and reminders are informational and may be incomplete, delayed, inaccurate, or generated automatically. They are not professional advice, an official sponsor determination, or a promise that you qualify or will receive an award.",
      "An Eligible result means only that the structured rules currently recorded in your tracker passed the Service's comparison. It does not confirm every sponsor requirement, selection preference, financial-need test, enrollment condition, document requirement, or sponsor decision. Unknown information is not proof of eligibility.",
      "You must independently review the current official sponsor page, confirm eligibility, award amount and basis, opening date, deadline and time zone, application instructions, fees, required materials, and legitimacy with the sponsor or an appropriate school/financial-aid office. Sponsor rules and deadlines can change without notice.",
    ],
  },
  {
    title: "5. User decisions and responsibility",
    paragraphs: [
      "You are responsible for deciding whether to apply, what information to submit to a sponsor, and whether an external scholarship opportunity is appropriate. Do not rely on Scholarship Scout as your only source for a deadline or eligibility rule. Keep your own copies of important sponsor instructions and confirmation receipts.",
      "Do not use the Service as an emergency, legal, financial, tax, medical, admissions, or individualized educational-advice service. Seek qualified help from the relevant professional or institution when a decision requires it.",
    ],
  },
  {
    title: "6. Applications, payments, and sponsor relationships",
    paragraphs: [
      "Scholarship Scout does not submit scholarship applications, contact sponsors, request recommendation letters, enroll you in a program, or complete an application on your behalf. Drafts and checklists are organizational tools; you must submit materials directly to the sponsor through a destination you have independently verified.",
      "The current application does not process application fees, tuition, award disbursements, donations, or other payments. Do not enter payment-card, bank-account, or payment credentials into Scholarship Scout. Scholarship Scout does not collect or forward a payment to a sponsor. Treat unexpected requests for payment or sensitive financial information with caution and verify them independently.",
    ],
  },
  {
    title: "7. Information you enter and local browser storage",
    paragraphs: [
      "Profile and application-workspace information can include state and county, citizenship status, age, school and district, education plans, GPA, class rank, test scores, coursework, honors, interests, activities, service, employment, languages, checklist progress, essay prompts and drafts, recommendation details, priorities, tags, personal notes, eligibility comparisons, and source-evidence history.",
      "You may choose to import a transcript or essay document in PDF, DOCX, or plain-text format. Supported files are read and parsed inside your browser, with a 10 MB file-size limit; the current importer does not process scanned/image-only PDFs. For transcripts, the application suggests clearly labeled academic values for your review. No extracted profile value is applied until you choose to apply it. Essay text is added to the selected scholarship's local application workspace. The original document file is not uploaded to Scholarship Scout or included in live search requests. Imported text remains subject to the local vault and backup disclosures in this notice.",
      "The Service encrypts your student profile, tracker, application drafts, preferences, and other student records in this browser before storing them in IndexedDB. After you verify an email sign-in, the browser creates a non-exportable encryption key tied to that account and browser profile. The local vault key is stored separately from the encrypted authentication session and is not uploaded to the Service. You do not need a separate vault passphrase for routine sign-in on the same browser profile. The browser can decrypt records only after the account session is verified and the matching device key is available. Decrypted information is available in the browser while the workspace is unlocked; encryption at rest does not protect information from malicious software, compromised browser extensions, or someone using an unlocked device.",
      "If you have an older local workspace that has not yet been migrated to the account-bound device key, this browser may ask for its existing vault passphrase once to verify and migrate those records. The original encrypted workspace is retained unless the migration is verified and saved successfully. Routine sign-ins after a successful migration do not require that legacy passphrase.",
      "After 15 minutes without activity, or when you choose Lock workspace and sign out, the Service attempts to save pending local changes, stops session refresh, signs out, clears decrypted records from memory, and requires a new email sign-in before the workspace can reopen. The Service stores a minimal legal-acceptance receipt and limited technical reliability information separately in this browser. These records are not designed to contain student profile details and are not sent as analytics by the current application.",
      "Your local data is tied to this browser profile and device. The Service does not have a copy of the encrypted local workspace and cannot remotely retrieve or erase it. Use the local-data removal control on each browser profile or device where you used Scholarship Scout. Downloaded backups are separate files and are not removed by deleting the workspace.",
      "Do not enter passwords, Social Security numbers, government identification numbers, full street addresses, bank details, payment-card details, or other information that is not necessary for scholarship organization. Only enter information you are comfortable storing in that browser profile.",
    ],
  },
  {
    title: "8. Automated public scholarship search",
    paragraphs: [
      "A verified email sign-in is required before you can use automated scholarship search. Automated live discovery currently supports U.S. state targeting only. When you start a search, the Service sends only your selected U.S. state, expected graduation year, and selected scholarship category IDs. Your residence country is used locally to determine whether U.S. state targeting applies. School location, county, school name, citizenship, grades, interests, activities, extra ranking keywords, employment notes, transcript contents, essays, recommendation details, tracker notes, and application drafts are not included in the search request.",
      "After search results are returned, the browser may compare result titles and excerpts against locally stored county, school name, education level, planned major, interests, academic coursework and honors, activities, service experience, employment, languages, certifications, and custom ranking keywords to order the results. Those matching values are processed only on this device and are not sent as part of the search request. This on-device relevance ordering is not an eligibility determination or sponsor verification.",
      "The search is handled by the Service's hosting, cloud-processing, and search providers. Those providers may process the search filters, IP address, browser and network metadata, request time, and security information needed to return results and protect the service. Their own privacy terms govern information they process. Scholarship Scout does not control all provider-side logging or retention.",
      "Automated results are research leads, not verified scholarship offers. The application does not currently perform a complete independent sponsor-verification service for each result. Provider identity, award, deadline, eligibility, and extracted rules must be confirmed by the user on the official sponsor page.",
    ],
  },
  {
    title: "9. Manual search links and external fonts",
    paragraphs: [
      "The Discovery page's suggested manual search links use generic scholarship search terms. They do not include your profile, school, location, academic details, interests, or application data. Google receives the generic query and ordinary connection information only when you choose to open a Search link. If you edit the query on Google's site, any information you type there is sent to Google. Google processes that visit under its own terms and privacy practices.",
      "The application currently requests interface fonts from Google Fonts after the legal gate, email verification, and local-vault unlock. Google may receive ordinary request metadata when those font resources are requested. Google controls its own processing under its policies.",
    ],
  },
  {
    title: "10. Required email authentication and saved sponsor records",
    paragraphs: [
      "A verified email address and authenticated account are required to open Scholarship Scout, including its local profile, live search, tracker, and application workspace. The current login sends a one-time email sign-in link; you must open the newest link in the same browser profile. Supabase Auth acts as the account provider and processes the email address, authentication exchange, session tokens, and ordinary connection metadata needed to verify and maintain the account. The encrypted browser session is stored separately from the local student-data vault. Existing verified sessions may be restored on the same browser profile. Signing in on another device does not transfer local student data. Scholarship Scout does not request access to your email inbox or other email-provider content.",
      "The sign-in screen also offers Google sign-in when the project's Google provider is enabled. If you choose it, Google and Supabase Auth process the account identifier, verified email address, basic profile claims, OAuth exchange, and ordinary connection metadata needed to authenticate you. Scholarship Scout requests only the openid, email, and profile scopes; it does not request access to Gmail, Google Drive, contacts, or other Google account content. The email or Google identity provider processes only the information needed for the sign-in method you select under its own privacy notice and terms.",
      "A sponsor record is sent to cloud storage only when you choose the cloud-save action. Cloud sponsor records may include scholarship title, sponsor/provider, official HTTPS source URL, award text or range, currency, deadline, structured sponsor criteria, evidence references, discovery metadata, verification status, and record timestamps. The current application does not send your student profile, grades, test scores, class rank, school, activities, transcript contents, essays, recommendation details, free-form personal notes, or local source-evidence revision history as part of cloud sponsor records.",
      "Cloud sponsor records are associated with the authenticated account that saved them. They are separate from the local tracker. Removing a local tracker item, clearing browser data, or signing out does not remove cloud records. Settings provides a permanent cloud-account deletion workflow that deletes the authenticated account and its associated account records. Deleting the cloud account does not erase local data on other devices or separately downloaded backups. The operator does not claim a fixed provider-side backup or log-retention period.",
      "The app does not currently implement an automated sponsor-verification request through its cloud API. Sponsor source checks and verification status should be treated as user-reviewed records, not a live determination made by Scholarship Scout.",
    ],
  },
  {
    title: "11. Service providers and external websites",
    paragraphs: [
      "Scholarship Scout relies on third-party providers for website hosting and delivery, account authentication, cloud storage, automated scholarship search, email delivery, domain and traffic delivery, and interface fonts. When you choose to open a manual search link, the search engine you selected receives the query and ordinary connection information. These providers may process IP addresses, request metadata, authentication information, search filters, or cloud sponsor records as needed to provide their services. Their own privacy notices and terms govern their processing. The Service does not control their independent retention, security, or availability.",
      "Scholarship Scout also links to scholarship sponsors, directories, search engines, government resources, and other third-party websites. Those sites are independent. Their availability, content, eligibility rules, privacy practices, security, and terms are not controlled or endorsed by Scholarship Scout. Review each site's terms and privacy notice before sharing information.",
    ],
  },
  {
    title: "12. Retention, deletion, and backups",
    paragraphs: [
      "Local profile, tracker, scholarship, essay, recommendation, and application-preparation information is stored in an encrypted vault in this browser. A verified email sign-in is required to open it. On a browser profile where the original non-exportable device key is present, the vault unlocks after account verification. The 15-minute inactivity lock and the manual lock action sign out and clear decrypted records from memory. The operator does not receive the local vault contents or its device key. Clearing browser/site data, switching browser profiles, using another device, or losing the device key may permanently remove access to local information unless you have a usable encrypted backup.",
      "Encrypted backups are initiated by you and encrypted in the browser before download. The current backup format uses AES-256-GCM with PBKDF2-SHA-256. You choose a backup password; the password is not saved by Scholarship Scout, and the backup file is not uploaded by the application. Anyone with the backup file and its password may be able to restore its contents. Losing the password may make the backup unrecoverable. Keep a separate backup before deleting browser data or changing devices.",
      "Cloud sponsor and source records are stored separately from your local workspace. The current app does not upload a cloud copy of your student profile or local eligibility assessments. Settings provides a permanent account-deletion workflow and form for deleting the authenticated account and its associated cloud records. The deletion process revokes refresh-token sessions across devices before removing the account. Previously issued access tokens may remain valid until their normal expiry, but they cannot be refreshed. The Service displays a result after the deletion request completes or fails. This action does not erase the local workspace on other devices, separately downloaded backups, or information independently held by third-party providers. You may also use the privacy request form in Settings or contact the address in Section 20. The operator cannot decrypt, retrieve, or remotely erase information held only in your local encrypted workspace.",
    ],
  },
  {
    title: "13. Security limitations",
    paragraphs: [
      "No website, browser, storage system, network, or third-party provider can be guaranteed completely secure or continuously available. The encrypted vault protects stored records at rest, but it does not protect decrypted records from malicious JavaScript running while the vault is unlocked, compromised browser extensions, malware, or an already-unlocked device. Use a device and browser profile you control, keep the browser and operating system updated, use a device lock, and protect your email sign-in method and encrypted backup password.",
      "The Service uses security measures intended to protect information during use and storage. No website or connected provider can guarantee complete security. Information is decrypted in the browser while you use the workspace, and security also depends on the device, browser, network, and third-party providers you use. Keep your device and browser updated, use a device lock, protect your email account, and do not share sign-in links or backup passwords. Scholarship Scout does not claim an independent security certification or guarantee that every risk has been eliminated.",
    ],
  },
  {
    title: "14. Your content and acceptable use",
    paragraphs: [
      "You retain the rights you already have in information and content you enter. You authorize Scholarship Scout to process that information only as needed to provide the features you choose, including local organization, comparison, backup creation, or the specific cloud-save action you initiate. The current app does not upload essay drafts or recommendation notes to cloud sponsor records.",
      "You must have permission to use information you enter and must not use the Service to break the law, infringe another person's rights, interfere with the Service, probe or bypass security controls, overload search infrastructure, or submit malicious code. Do not enter another person's private information without permission.",
    ],
  },
  {
    title: "15. Changes, availability, and termination",
    paragraphs: [
      "Features, search providers, third-party integrations, and availability may change or be discontinued. The Service may be unavailable because of maintenance, outages, provider limits, rate limits, network problems, or circumstances outside the operator's control. No service level or uninterrupted availability is promised.",
      "The operator may suspend or restrict access when reasonably necessary to protect the Service, comply with law, respond to misuse, or address a security risk. Material changes to these terms will be assigned a new version and the Service will request renewed acceptance before loading the workspace.",
    ],
  },
  {
    title: "16. Warranty disclaimer",
    paragraphs: [
      'To the maximum extent permitted by applicable law, Scholarship Scout is provided "as is" and "as available," without warranties or conditions of any kind, whether express, implied, or statutory, including implied warranties of merchantability, fitness for a particular purpose, title, non-infringement, accuracy, availability, or reliability.',
      "The operator does not warrant that scholarship information is complete, accurate, current, safe, or suitable for your circumstances; that search results will be returned; that any opportunity is legitimate; or that using the Service will result in an application, scholarship, admission, or financial benefit.",
    ],
  },
  {
    title: "17. Limitation of liability",
    paragraphs: [
      "To the maximum extent permitted by applicable law, the operator will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, lost opportunities, lost data, missed deadlines, lost awards, or interruption arising from or related to use of the Service or third-party sites.",
      "To the maximum extent permitted by law, any liability that cannot be excluded is limited to the direct loss proven to have been caused by the operator's breach. Nothing in these terms excludes or limits liability, consumer rights, or remedies that applicable law does not allow to be excluded or limited. Some jurisdictions do not permit certain exclusions, so parts of this section may not apply to you.",
    ],
  },
  {
    title: "18. Intellectual property",
    paragraphs: [
      "The Scholarship Scout interface, software, design, branding, and original materials are protected by applicable intellectual-property laws. You may use the Service for personal, non-commercial scholarship research and organization. You may not copy, resell, redistribute, or commercially exploit the Service except as permitted by law or with written permission from the relevant rights holder.",
      "Scholarship names, sponsor marks, and third-party materials remain the property of their respective owners. Their appearance in a search result or link does not imply sponsorship, endorsement, or partnership.",
    ],
  },
  {
    title: "19. Governing law and mandatory rights",
    paragraphs: [
      "The operator has stated that Scholarship Scout is an individually operated project based in Texas, United States, and is not being presented as a separate corporation, LLC, nonprofit, school, or government agency. Texas law governs these terms to the extent permitted by law, without limiting mandatory consumer protections or privacy rights that apply where you live. No exclusive county court, arbitration requirement, or waiver of non-waivable rights is created by this notice.",
      "The Texas Data Privacy and Security Act (TDPSA) applies only when its statutory coverage requirements are met and contains exclusions and a small-business exemption, subject to the Act's terms. The operator has not represented that the Act's applicability or any exemption has been formally determined for this project. Where the TDPSA or another privacy law applies, rights may include requesting confirmation and access, correction, deletion, a portable copy of personal data, and opting out of targeted advertising, sale of personal data, or certain profiling. The Service is not designed to sell personal data or deliver targeted advertising. Scholarship match summaries are informational; they do not make a sponsor's award decision, admissions decision, or other legal or similarly significant decision about you.",
      "To make a privacy request, use the form in Settings. The form prepares an email to the privacy contact and requires you to review and send it; preparing the message alone does not submit a request. You may also email the address in Section 20 directly. The operator may request information reasonably necessary to verify the requester and locate the relevant account or data. Do not send sign-in links, backup passwords, government identification numbers, or unnecessary student records.",
      "If a request is denied and the law applicable to the request provides an appeal right, select the appeal option in the in-app privacy form or email the same contact with the subject line Privacy Appeal. Identify the earlier request and the decision being appealed. Where the TDPSA applies, the statute generally requires a response to a consumer request within 45 days, permits a qualifying 45-day extension with notice, and requires a written appeal response within 60 days. These statutory periods are described for covered requests; they are not a claim that the TDPSA necessarily applies to this individual project.",
    ],
  },
  {
    title: "20. Operator identity, support, and privacy requests",
    paragraphs: [
      "The Service is offered under the product name Scholarship Scout and is operated by an individual based in Texas, United States. Scholarship Scout is not represented as a separate corporation, LLC, nonprofit, school, or government agency.",
      "For support questions, privacy requests, complaints, or legal notices relating to the Service, contact levi.haidar@outlook.com. The privacy-request form in Settings prepares a message for this address; you must review and send the email yourself. A parent or legal guardian may submit a request on behalf of a minor where applicable law allows.",
      "The operator may request information reasonably necessary to verify the requester’s authority and locate the relevant account or cloud records. Do not email passwords, sign-in links, backup passwords, government identification numbers, or unnecessary student records. The public notice does not publish a personal residential street address.",
      "For signed-in cloud accounts, Settings provides a permanent account-deletion action. It revokes refresh-token sessions across devices and removes the authenticated account and associated account-linked cloud records. Previously issued access tokens may remain valid until their normal expiry, but they cannot be refreshed. You may separately erase the local workspace in the current browser. Local data on another device or browser profile, separately downloaded backups, and information independently held by service providers are not erased by those actions. The operator cannot retrieve or remotely erase information held only in a user's local encrypted workspace.",
      "This notice describes the current application and disclosed data practices; it is not legal advice or a certification that every privacy law applies or that every legal obligation has been satisfied. Applicability can depend on the operator’s activities, scale, data practices, and statutory exemptions. The operator should obtain qualified legal review before commercial launch or materially expanding data collection.",
    ],
  },
  {
    title: "21. Official legal information",
    paragraphs: [
      "The following government resources provide general information and are not a substitute for advice about your particular circumstances:",
    ],
    bullets: [
      "Federal Trade Commission — Children's Online Privacy Protection Rule (COPPA): https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa",
      "Federal Trade Commission — COPPA compliance guidance: https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions",
      "Texas Attorney General — Texas Data Privacy and Security Act overview: https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint/consumer-privacy-rights/texas-data-privacy-and-security-act",
    ],
  },
  {
    title: "22. Acceptance record",
    paragraphs: [
      "When you accept, the current document version, an affirmative acceptance flag, browser timestamp, selected age group, and parent/guardian acknowledgement status (where applicable) are stored in this browser. No guardian name, email address, school, account ID, or student profile is added to that receipt, and the receipt is not sent to the operator's server. It is a local browser record of the selections, not server-side proof of identity, actual age, guardian identity, or legally sufficient verifiable parental consent.",
      "The receipt is removed if the relevant browser storage is cleared. If the document version changes, the old receipt no longer opens the workspace and you will be asked to review and accept the updated notice.",
    ],
  },
] as const satisfies readonly LegalSection[];
