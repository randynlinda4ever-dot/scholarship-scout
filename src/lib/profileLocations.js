// ISO 3166-1 alpha-2 countries and territories plus U.S. states and territories.
const COUNTRY_CODE_VALUES = "AF AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR HR CU CW CY CZ CI DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RO RU RW RE BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TM TC TV TR UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW AX".split(" ");
const regionNames = typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

export const COUNTRY_OPTIONS = COUNTRY_CODE_VALUES.map((code) => [
  code,
  regionNames?.of(code) ?? code,
]);

const COUNTRY_CODES = new Set(COUNTRY_CODE_VALUES);

export const US_STATE_OPTIONS = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AS", "American Samoa"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "District of Columbia"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["GU", "Guam"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["MP", "Northern Mariana Islands"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["PR", "Puerto Rico"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["VI", "U.S. Virgin Islands"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
];

const US_STATE_CODES = new Map(US_STATE_OPTIONS.map(([code, name]) => [code.toLowerCase(), name]));
const US_STATE_NAMES = new Map(US_STATE_OPTIONS.map(([, name]) => [name.toLowerCase(), name]));

export const PROFILE_CITIZENSHIP_OPTIONS = [
  ["", "Not provided"],
  ["U.S. citizen", "U.S. citizen"],
  ["U.S. national", "U.S. national"],
  ["Eligible noncitizen", "Eligible noncitizen (confirm sponsor definition)"],
  ["Other or unsure", "Other or unsure — needs sponsor review"],
];

export function isCountryCode(value) {
  return COUNTRY_CODES.has(String(value ?? "").trim().toUpperCase());
}

export function countryNameForCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return COUNTRY_OPTIONS.find(([candidate]) => candidate === code)?.[1] ?? "";
}

export function normalizeUsStateName(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return US_STATE_NAMES.get(raw) ?? US_STATE_CODES.get(raw) ?? "";
}
