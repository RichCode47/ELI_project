import assert from 'node:assert/strict';
import { test } from 'node:test';
import { includedInPlan, modules } from '../shared/catalog.js';
import { csv } from '../server/csv.js';
import { toMinor } from '../shared/money.js';
import { statesFor } from '../server/record-rules.js';
import { hashPassword, verifyPassword } from '../server/security.js';

test('money uses currency precision and rejects invalid or oversized amounts', () => {
  assert.equal(toMinor('152.50', 'ZMW'), 15250);
  assert.equal(toMinor('152.5', 'ZMW'), 15250);
  assert.equal(toMinor('152', 'JPY'), 152);
  for (const value of ['-1', '0', '1e4', '100,00', '10.001', '20000000.01']) assert.equal(toMinor(value, 'ZMW'), null);
  assert.equal(toMinor('12.50', 'JPY'), null);
});

test('plans and ledger states restrict premium and permanent records', () => {
  assert.equal(includedInPlan(modules.courses, 'BASIC'), false);
  assert.equal(includedInPlan(modules.courses, 'PROFESSIONAL'), true);
  assert.equal(includedInPlan(modules.students, 'BASIC'), true);
  assert.deepEqual(statesFor('invoices', modules.invoices, 'ISSUED'), ['ISSUED', 'VOID']);
  assert.deepEqual(statesFor('invoices', modules.invoices, 'PAID'), ['PAID']);
  assert.deepEqual(statesFor('admissions', modules.admissions, 'ENROLLED'), ['ENROLLED']);
  assert.deepEqual(statesFor('loans', modules.loans), ['OPEN']);
});

test('CSV cells are quoted and explicit spreadsheet formulas are rendered as text', () => {
  const value = csv([['=2+2', 'A,"B"', '  -3', 'normal']]);
  assert.equal(value, '\uFEFF"\'=2+2","A,""B""","\'  -3","normal"\r\n');
});

test('password hashes use separate salts and verify exact input', async () => {
  const a = await hashPassword('An institutional passphrase');
  const b = await hashPassword('An institutional passphrase');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('An institutional passphrase', a), true);
  assert.equal(await verifyPassword('Wrong passphrase', a), false);
});
