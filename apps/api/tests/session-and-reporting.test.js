const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCsvImportRows, buildExecutiveSummary } = require('../src/reporting');
const { createTokenPair, revokeRefreshToken, verifyJwt } = require('../src/session');

test('parseCsvImportRows converts CSV text to row objects', () => {
  const csv = [
    'projeto,categoria,descricao,valor,status,data_lancamento',
    'Expansão Sul,Material,Compra de tubo,1250.50,PENDENTE,2026-10-01',
    'Expansão Norte,Transporte,Frete,320.00,APROVADO,2026-10-02',
  ].join('\n');

  const rows = parseCsvImportRows(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].projeto, 'Expansão Sul');
  assert.equal(Number(rows[1].valor), 320);
});

test('buildExecutiveSummary computes totals for projects and categories', () => {
  const summary = buildExecutiveSummary([
    { projeto: 'P1', categoria: 'Material', valor: 1000, status: 'APROVADO' },
    { projeto: 'P1', categoria: 'Material', valor: 500, status: 'PENDENTE' },
    { projeto: 'P2', categoria: 'Transporte', valor: 300, status: 'REJEITADO' },
  ]);

  assert.equal(summary.totalValor, 1800);
  assert.equal(summary.totalProjetos, 2);
  assert.equal(summary.statusBreakdown.APROVADO, 1000);
  assert.equal(summary.topProjects[0].nome, 'P1');
});

test('createTokenPair creates valid access and refresh JWTs', () => {
  const tokens = createTokenPair({ id: 'user-7', perfil: 'ADMIN' });
  assert.equal(verifyJwt(tokens.accessToken, 'access').userId, 'user-7');
  assert.equal(verifyJwt(tokens.refreshToken, 'refresh').userId, 'user-7');
  assert.equal(verifyJwt(tokens.accessToken, 'refresh'), null);
  revokeRefreshToken(tokens.refreshToken);
  assert.equal(verifyJwt(tokens.refreshToken, 'refresh'), null);
});
