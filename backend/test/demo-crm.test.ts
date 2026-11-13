import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_COUNTS,
  getSeedState,
  parseApplyFlag,
  requireDevelopmentEnvironment,
  requireExactlyOneActiveSuperAdmin,
  type DemoCounts,
} from '../scripts/demo-crm-plan.js';

const emptyCounts = (): DemoCounts => ({
  companies: 0,
  contacts: 0,
  inquiries: 0,
  opportunities: 0,
  activities: 0,
});

test('demo seed is idempotent for empty and complete anchor sets', () => {
  assert.equal(getSeedState(emptyCounts()), 'empty');
  assert.equal(getSeedState({ ...DEMO_COUNTS }), 'complete');
});

test('demo seed refuses partial/duplicated anchors before writes', () => {
  const partial = emptyCounts();
  partial.companies = 1;
  assert.throws(() => getSeedState(partial), /parciales o duplicados/);
  const duplicate = { ...DEMO_COUNTS, companies: DEMO_COUNTS.companies + 1 };
  assert.throws(() => getSeedState(duplicate), /parciales o duplicados/);
});

test('demo seed requires exactly one active SUPER_ADMIN', () => {
  assert.throws(() => requireExactlyOneActiveSuperAdmin(0), /exactamente un/);
  assert.doesNotThrow(() => requireExactlyOneActiveSuperAdmin(1));
  assert.throws(() => requireExactlyOneActiveSuperAdmin(2), /exactamente un/);
});

test('demo commands are dry-run by default and accept only --apply', () => {
  assert.equal(parseApplyFlag([]), false);
  assert.equal(parseApplyFlag(['--apply']), true);
  assert.throws(() => parseApplyFlag(['--apply', '--force']), /Argumento no válido/);
});

test('demo commands require development mode', () => {
  assert.doesNotThrow(() => requireDevelopmentEnvironment('development'));
  assert.throws(() => requireDevelopmentEnvironment('production'), /NODE_ENV=development/);
  assert.throws(() => requireDevelopmentEnvironment(undefined), /NODE_ENV=development/);
});
