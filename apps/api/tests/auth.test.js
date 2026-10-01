const test = require('node:test');
const assert = require('node:assert/strict');

const { hashPassword, verifyPassword } = require('../src/auth');

test('hash and verify credentials', async () => {
  const hash = await hashPassword('admin123');

  assert.notEqual(hash, 'admin123');
  assert.equal(await verifyPassword('admin123', hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
});
