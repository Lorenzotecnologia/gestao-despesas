PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT,
  perfil TEXT NOT NULL CHECK(perfil IN ('ADMIN', 'APROVADOR', 'LANCADOR')),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projetos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  orcamento_total REAL NOT NULL CHECK(orcamento_total >= 0),
  reserva_total REAL NOT NULL DEFAULT 0 CHECK(reserva_total >= 0),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS formas_pagamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS caminhoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placa TEXT NOT NULL UNIQUE,
  modelo TEXT,
  capacidade_m3 REAL CHECK(capacidade_m3 >= 0),
  prestador_nome TEXT,
  prestador_cnpj TEXT,
  foto TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS viagens_caminhao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caminhao_id INTEGER NOT NULL REFERENCES caminhoes(id),
  projeto_id INTEGER NOT NULL REFERENCES projetos(id),
  motorista_nome TEXT NOT NULL,
  motorista_cpf TEXT NOT NULL,
  origem TEXT,
  destino TEXT,
  quantidade_m3 REAL NOT NULL CHECK(quantidade_m3 > 0),
  valor_unitario REAL NOT NULL CHECK(valor_unitario > 0),
  data_viagem TEXT NOT NULL,
  observacoes TEXT,
  criado_por INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_viagens_caminhao_data ON viagens_caminhao(caminhao_id, data_viagem);
CREATE INDEX IF NOT EXISTS idx_viagens_projeto_data ON viagens_caminhao(projeto_id, data_viagem);

CREATE TABLE IF NOT EXISTS status_lancamento (
  codigo TEXT PRIMARY KEY,
  descricao TEXT NOT NULL
);

INSERT INTO status_lancamento(codigo, descricao)
VALUES
  ('PENDENTE', 'Pendente'),
  ('APROVADO', 'Aprovado'),
  ('REJEITADO', 'Rejeitado')
ON CONFLICT(codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS lancamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projeto_id INTEGER NOT NULL REFERENCES projetos(id),
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  forma_pagamento_id INTEGER REFERENCES formas_pagamento(id),
  descricao TEXT NOT NULL,
  fornecedor TEXT,
  valor REAL NOT NULL CHECK(valor > 0),
  tipo_medicao TEXT NOT NULL DEFAULT 'GERAL' CHECK(tipo_medicao IN ('GERAL', 'ESCAVADEIRA_M3', 'CAMINHAO_UNIDADE')),
  quantidade REAL NOT NULL DEFAULT 1 CHECK(quantidade > 0),
  unidade_medida TEXT NOT NULL DEFAULT 'UN',
  valor_unitario REAL NOT NULL DEFAULT 0 CHECK(valor_unitario >= 0),
  placa_caminhao TEXT,
  motorista_nome TEXT,
  motorista_cpf TEXT,
  prestador_cnpj TEXT,
  foto_caminhao TEXT,
  data_lancamento TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDENTE' REFERENCES status_lancamento(codigo),
  numero_nota TEXT,
  observacoes TEXT,
  criado_por INTEGER NOT NULL REFERENCES usuarios(id),
  aprovado_por INTEGER REFERENCES usuarios(id),
  data_aprovacao TEXT,
  versao INTEGER NOT NULL DEFAULT 1,
  excluido_em TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS anexos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lancamento_id INTEGER NOT NULL REFERENCES lancamentos(id),
  nome_arquivo TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL CHECK(tamanho_bytes > 0),
  storage_key TEXT NOT NULL UNIQUE,
  checksum_sha256 TEXT NOT NULL,
  tipo_arquivo TEXT NOT NULL CHECK(tipo_arquivo IN ('IMAGEM', 'XML', 'PDF', 'OUTRO')),
  dados_extraidos TEXT,
  processado INTEGER NOT NULL DEFAULT 0,
  excluido_em TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade TEXT NOT NULL,
  entidade_id INTEGER NOT NULL,
  acao TEXT NOT NULL CHECK(acao IN ('INSERT', 'UPDATE', 'DELETE')),
  usuario_id INTEGER REFERENCES usuarios(id),
  dados_antes TEXT,
  dados_depois TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS parametros (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  descricao TEXT,
  atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO parametros(chave, valor, descricao)
VALUES
  ('TETO_APROVACAO', '5000.00', 'Valor máximo aceito sem segunda aprovação'),
  ('PERMISSAO_AJUSTE_ORCAMENTO', 'ADMIN', 'Perfil habilitado para ajustar orçamento')
ON CONFLICT(chave) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_lancamentos_projeto_data ON lancamentos(projeto_id, data_lancamento);
CREATE INDEX IF NOT EXISTS idx_lancamentos_status ON lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_lancamentos_fornecedor ON lancamentos(fornecedor);
CREATE INDEX IF NOT EXISTS idx_lancamentos_valor ON lancamentos(valor);
CREATE INDEX IF NOT EXISTS idx_anexos_lancamento ON anexos(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidade ON auditoria(entidade, entidade_id);
