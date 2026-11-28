import test from 'node:test';
import assert from 'node:assert/strict';
import { extractProfileDetails, mergeExtractedProfileDetails } from '../src/lib/profileDocumentImport.js';

test('extracts explicit academic and experience details from a resume or transcript', () => {
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

test('does not infer sensitive eligibility answers or invent missing details', () => {
  const result = extractProfileDetails('GPA: 3.7\nActivities: Debate');
  assert.deepEqual(Object.keys(result).sort(), ['activities', 'gpa']);
  assert.equal(result.firstGeneration, undefined);
  assert.equal(result.citizenship, undefined);
});

test('fills only blank profile fields and preserves user-entered values', () => {
  const profile = { school: 'My confirmed school', gpa: '', act: '29' };
  const result = mergeExtractedProfileDetails(profile, { school: 'Transcript school', gpa: '3.9', act: '32' });
  assert.deepEqual(result, { school: 'My confirmed school', gpa: '3.9', act: '29' });
});
