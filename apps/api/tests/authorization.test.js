const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canApproveStatus,
  canEditBudget,
  getUserDisplayName,
} = require('../src/authorization');

test('admin can approve and adjust budget', () => {
  assert.equal(canApproveStatus('ADMIN', 'APROVADO'), true);
  assert.equal(canEditBudget('ADMIN'), true);
  assert.equal(getUserDisplayName({ nome: 'Maria', perfil: 'ADMIN' }), 'Maria (ADMIN)');
});

test('lancador cannot approve or adjust budget', () => {
  assert.equal(canApproveStatus('LANCADOR', 'APROVADO'), false);
  assert.equal(canApproveStatus('APROVADOR', 'REJEITADO'), true);
  assert.equal(canEditBudget('LANCADOR'), false);
});
