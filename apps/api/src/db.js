const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'gestao_despesas.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'database', 'schema.sql');
const SEED_PATH = path.join(__dirname, '..', 'database', 'seed.sql');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

function runSqlFile(filePath) {
  return new Promise((resolve, reject) => {
    const sql = fs.readFileSync(filePath, 'utf8');
    db.exec(sql, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function ensurePasswordColumn() {
  const columns = await all('PRAGMA table_info(usuarios)');
  if (!columns.some((column) => column.name === 'senha_hash')) {
    await run('ALTER TABLE usuarios ADD COLUMN senha_hash TEXT');
  }
}

async function ensureExpenseMeasurementColumns() {
  const columns = await all('PRAGMA table_info(lancamentos)');
  const migrations = [
    ['tipo_medicao', "ALTER TABLE lancamentos ADD COLUMN tipo_medicao TEXT NOT NULL DEFAULT 'GERAL'"],
    ['quantidade', 'ALTER TABLE lancamentos ADD COLUMN quantidade REAL NOT NULL DEFAULT 1'],
    ['unidade_medida', "ALTER TABLE lancamentos ADD COLUMN unidade_medida TEXT NOT NULL DEFAULT 'UN'"],
    ['valor_unitario', 'ALTER TABLE lancamentos ADD COLUMN valor_unitario REAL NOT NULL DEFAULT 0'],
    ['placa_caminhao', 'ALTER TABLE lancamentos ADD COLUMN placa_caminhao TEXT'],
    ['motorista_nome', 'ALTER TABLE lancamentos ADD COLUMN motorista_nome TEXT'],
    ['motorista_cpf', 'ALTER TABLE lancamentos ADD COLUMN motorista_cpf TEXT'],
    ['prestador_cnpj', 'ALTER TABLE lancamentos ADD COLUMN prestador_cnpj TEXT'],
    ['foto_caminhao', 'ALTER TABLE lancamentos ADD COLUMN foto_caminhao TEXT'],
  ];

  for (const [name, statement] of migrations) {
    if (!columns.some((column) => column.name === name)) {
      await run(statement);
    }
  }
}

async function syncPasswordHashes() {
  const employees = [
    { email: 'admin@empresa.com', senha: 'admin123' },
    { email: 'aprovador@empresa.com', senha: 'aprovador123' },
    { email: 'lancador@empresa.com', senha: 'lancador123' },
  ];

  for (const employee of employees) {
    const row = await get('SELECT id FROM usuarios WHERE LOWER(email) = LOWER(?)', [employee.email]);
    if (!row) continue;

    const existingHash = (await get('SELECT senha_hash FROM usuarios WHERE LOWER(email) = LOWER(?)', [employee.email]))?.senha_hash;
    if (!existingHash) {
      const { hashPassword } = require('./auth');
      const senhaHash = await hashPassword(employee.senha);
      await run('UPDATE usuarios SET senha_hash = ? WHERE LOWER(email) = LOWER(?)', [senhaHash, employee.email]);
    }
  }
}

async function initDatabase() {
  try {
    await runSqlFile(SCHEMA_PATH);
    await ensurePasswordColumn();
    await ensureExpenseMeasurementColumns();
    await runSqlFile(SEED_PATH);
    await syncPasswordHashes();
    console.log('Banco de dados inicializado com sucesso.');
  } catch (error) {
    console.error('Erro ao inicializar banco:', error.message);
    throw error;
  }
}

function all(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function get(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function run(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

module.exports = { db, initDatabase, all, get, run };
