function parseOptionalNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return { empty: true, valid: true, value: null };
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
    return { empty: false, valid: false, value: null };
  }
  const number = Number(text);
  return { empty: false, valid: Number.isFinite(number), value: number };
}

function changed(previous, next, key) {
  return String(previous?.[key] ?? "") !== String(next?.[key] ?? "");
}

function validateBoundedInteger(previous, next, key, min, max, message) {
  if (!changed(previous, next, key)) return null;
  const parsed = parseOptionalNumber(next?.[key]);
  if (parsed.empty) return null;
  if (!parsed.valid || !Number.isInteger(parsed.value) || parsed.value < min || parsed.value > max) {
    return message;
  }
  return null;
}

/**
 * Validate only fields the user just changed. Unchanged legacy values do not
 * block edits elsewhere in the profile. Blank values remain valid because the
 * profile is optional and incomplete information must not become a false fail.
 */
export function validateProfileChanges(previous = {}, next = {}) {
  const errors = [];

  const graduationYearError = validateBoundedInteger(
    previous, next, "graduationYear", 1900, 2100,
    "Enter a four-digit expected graduation year between 1900 and 2100.",
  );
  if (graduationYearError) errors.push(graduationYearError);

  const ageError = validateBoundedInteger(
    previous, next, "age", 0, 120,
    "Enter age as a whole number from 0 through 120.",
  );
  if (ageError) errors.push(ageError);

  const actError = validateBoundedInteger(
    previous, next, "act", 1, 36,
    "Enter an ACT composite score from 1 to 36.",
  );
  if (actError) errors.push(actError);

  const satError = validateBoundedInteger(
    previous, next, "sat", 400, 1600,
    "Enter an SAT score from 400 to 1600.",
  );
  if (satError) errors.push(satError);

  if (changed(previous, next, "serviceHours")) {
    const hours = parseOptionalNumber(next?.serviceHours);
    if (!hours.empty && (!hours.valid || hours.value < 0)) {
      errors.push("Enter community service hours as a number of zero or more.");
    }
  }

  if (changed(previous, next, "gpa") || changed(previous, next, "gpaType")) {
    const gpa = parseOptionalNumber(next?.gpa);
    if (!gpa.empty && (!gpa.valid || gpa.value < 0)) {
      errors.push("Enter GPA as a non-negative number.");
    } else if (!gpa.empty && gpa.valid) {
      // Apply a maximum only when the student has explicitly supplied a
      // numeric scale. Weighted and district-specific scales remain flexible.
      const scaleValues = String(next?.gpaType ?? "")
        .match(/\d+(?:\.\d+)?/g)
        ?.map(Number)
        .filter((value) => Number.isFinite(value) && value >= 2 && value <= 100) ?? [];
      const scale = scaleValues.length ? Math.max(...scaleValues) : null;
      if (scale !== null && gpa.value > scale) {
        errors.push(`GPA cannot exceed the maximum on the entered scale (${scale}).`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
