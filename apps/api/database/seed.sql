INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo)
VALUES
  ('Admin', 'admin@empresa.com', '$2b$10$7UzligEQbk.k9VFAG.rtE.GJ5oxYK/KW9iok8I/zrHehC8PV.9tFi', 'ADMIN', 1),
  ('Aprovador', 'aprovador@empresa.com', '$2b$10$5JtJN6j0C0ZbibyVah2TX.lKQhp01dnOGQuVSDtTKwfe.wXw8Mdqm', 'APROVADOR', 1),
  ('Lançador', 'lancador@empresa.com', '$2b$10$oAguGA.fA6trjeptKnnjwOLkQzAY2aXIdTmdVio2MyPXegKjqdKay', 'LANCADOR', 1)
ON CONFLICT(email) DO NOTHING;

INSERT INTO projetos (codigo, nome, descricao, orcamento_total, reserva_total)
VALUES
  ('PRJ-001', 'Obra Centro', 'Ampliação da sede central', 120000.00, 15000.00),
  ('PRJ-002', 'Instalação Norte', 'Sistema de infraestrutura do setor norte', 98000.00, 12000.00),
  ('PRJ-003', 'Expansão Sul', 'Expansão de produção e logística', 140000.00, 18000.00)
ON CONFLICT(codigo) DO NOTHING;

INSERT INTO categorias (codigo, nome)
VALUES
  ('CAT-MATERIAL', 'Material'),
  ('CAT-MAO_DE_OBRA', 'Mão de obra'),
  ('CAT-EQUIPAMENTO', 'Equipamento'),
  ('CAT-TRANSPORTE', 'Transporte'),
  ('CAT-OUTROS', 'Outros')
ON CONFLICT(codigo) DO NOTHING;

INSERT INTO formas_pagamento (codigo, nome)
VALUES
  ('PIX', 'Pix'),
  ('BOLETO', 'Boleto'),
  ('CARTAO', 'Cartão'),
  ('DINHEIRO', 'Dinheiro'),
  ('TRANSFERENCIA', 'Transferência')
ON CONFLICT(codigo) DO NOTHING;

INSERT INTO lancamentos (
  projeto_id,
  categoria_id,
  forma_pagamento_id,
  descricao,
  fornecedor,
  valor,
  data_lancamento,
  status,
  numero_nota,
  observacoes,
  criado_por,
  aprovado_por,
  data_aprovacao
)
VALUES
  (1, 1, 1, 'Cimento e areia para fundação', 'Materiais Alpha', 8500.00, '2026-09-15', 'APROVADO', 'NF-10293', 'Compra de material para estrutura', 3, 2, '2026-09-16T10:00:00Z'),
  (1, 2, 3, 'Mão de obra da escavação', 'Construtora Nova', 6200.00, '2026-09-17', 'PENDENTE', 'NF-10410', 'Serviço de escavação e preparação', 3, NULL, NULL),
  (2, 3, 4, 'Compra de compressor', 'Equipamentos XYZ', 18500.00, '2026-09-18', 'APROVADO', 'NF-11482', 'Equipamento para linha de produção', 3, 2, '2026-09-19T08:35:00Z'),
  (3, 4, 2, 'Frete para entrega de peças', 'Logística Prime', 2400.00, '2026-09-21', 'REJEITADO', 'NF-12233', 'Frete não aprovado pela origem', 3, 2, '2026-09-22T12:00:00Z'),
  (3, 5, 5, 'Material de escritório', 'Atelier Supply', 980.00, '2026-09-22', 'PENDENTE', 'NF-12247', 'Suprimentos operacionais', 3, NULL, NULL)
ON CONFLICT DO NOTHING;
