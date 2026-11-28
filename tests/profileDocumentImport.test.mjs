import test from 'node:test';
import assert from 'node:assert/strict';
import { extractProfileDetails, mergeExtractedProfileDetails } from '../src/lib/profileDocumentImport.js';

test('extracts labeled academic and experience details and GPA scale', () => {
  const result = extractProfileDetails(`
Student: Jordan Example
School: Central High School
Graduation Year: 2027
GPA: 3.85 / 4.0
Class Rank: 12 of 240 (top 5%)
ACT: 31
SAT: 1420
AP Courses: AP Biology, AP US History
Dual Credit Courses: English Composition
Activities: Student Council; Robotics Club
Volunteer Hours: 85
Employment: Library assistant
Languages: English, Spanish
Intended Major: Biology
`);
  assert.equal(result.school, 'Central High School');
  assert.equal(result.graduationYear, '2027');
  assert.equal(result.gpa, '3.85');
  assert.equal(result.gpaType, '4.0');
  assert.equal(result.classRank, '12 of 240 (top 5%)');
  assert.equal(result.act, '31');
  assert.equal(result.sat, '1420');
  assert.equal(result.apCourses, 'AP Biology, AP US History');
  assert.equal(result.dualCreditCourses, 'English Composition');
  assert.equal(result.activities, 'Student Council; Robotics Club');
  assert.equal(result.serviceHours, '85');
  assert.equal(result.employment, 'Library assistant');
  assert.equal(result.languages, 'English, Spanish');
  assert.equal(result.plannedMajor, 'Biology');
});

test('accepts supported GPA formats and rejects out-of-range numeric claims', () => {
  assert.deepEqual(extractProfileDetails('GPA: 3.7 out of 4.0'), { gpa: '3.7', gpaType: '4.0' });
  assert.deepEqual(extractProfileDetails('GPA: 4.2 / 4.0\nACT: 42\nSAT: 1700\nGraduation Year: 1800'), {});
});

test('does not infer identity or sensitive eligibility details', () => {
  const result = extractProfileDetails('Student: Jordan Example\nGPA: 3.7\nActivities: Debate');
  assert.deepEqual(Object.keys(result).sort(), ['activities', 'gpa']);
  assert.equal(result.firstGeneration, undefined);
  assert.equal(result.citizenship, undefined);
  assert.equal(result.age, undefined);
});

test('fills only blank known fields and preserves user-entered values', () => {
  const profile = { school: 'My confirmed school', gpa: '', act: '29' };
  const result = mergeExtractedProfileDetails(profile, { school: 'Transcript school', gpa: '3.9', act: '32' });
  assert.deepEqual(result, { school: 'My confirmed school', gpa: '3.9', act: '29' });
});

test('ignores unknown keys, prototype-like keys, invalid values, and non-string data', () => {
  const result = mergeExtractedProfileDetails({}, Object.fromEntries([
    ['__proto__', 'unsafe'],
    ['constructor', 'unsafe'],
    ['citizenship', 'US citizen'],
    ['gpa', 'not a number'],
    ['act', '99'],
    ['school', { value: 'Injected school' }],
  ]));
  assert.deepEqual(result, {});
  assert.equal(Object.prototype.polluted, undefined);
});

test('handles empty, non-string, null-byte, and oversized input safely', () => {
  assert.deepEqual(extractProfileDetails(null), {});
  assert.deepEqual(extractProfileDetails(''), {});
  assert.deepEqual(extractProfileDetails('GPA:\u00003.8'), {});
  assert.deepEqual(extractProfileDetails('x'.repeat(1_000_001)), {});
});
