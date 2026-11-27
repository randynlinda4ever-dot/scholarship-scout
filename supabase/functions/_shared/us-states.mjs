const STATE_PAIRS = [["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],["DC","District of Columbia"],["PR","Puerto Rico"],["GU","Guam"],["VI","U.S. Virgin Islands"],["AS","American Samoa"],["MP","Northern Mariana Islands"]];

const STATE_ALIASES = new Map();
for (const [code, name] of STATE_PAIRS) {
  STATE_ALIASES.set(code.toLowerCase(), code);
  STATE_ALIASES.set(name.toLowerCase(), code);
}

export function normalizeUsState(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  return STATE_ALIASES.get(raw) ?? "";
}

export function stateMatchesText(text, state) {
  const code = normalizeUsState(state);
  if (!code) return false;
  const name = STATE_PAIRS.find(([abbreviation]) => abbreviation === code)?.[1] ?? "";
  const searchable = String(text ?? "");
  const matchesToken = (value) => new RegExp("(^|[^a-z0-9])" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=$|[^a-z0-9])", "i").test(searchable);
  return matchesToken(name.toLowerCase()) || new RegExp("(^|[^a-z0-9])" + code + "(?=$|[^a-z0-9])").test(searchable);
}
