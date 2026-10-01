require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase, all, get, run } = require('./src/db');
const { hashPassword, verifyPassword } = require('./src/auth');
const { canApproveStatus, canEditBudget, getUserDisplayName } = require('./src/authorization');
const {
  createTokenPair,
  getAccessPayload,
  getRefreshPayload,
  getRefreshToken,
  revokeRefreshToken,
} = require('./src/session');
const { parseCsvImportRows, buildExecutiveSummary } = require('./src/reporting');

const app = express();
const PORT = process.env.PORT || 3001;

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function validateMeasuredExpense(data) {
  const tipoMedicao = String(data.tipo_medicao || 'GERAL').toUpperCase();
  const quantidade = toNumber(data.quantidade, 1);
  const valorUnitario = toNumber(data.valor_unitario, toNumber(data.valor));

  if (!['GERAL', 'ESCAVADEIRA_M3', 'CAMINHAO_UNIDADE'].includes(tipoMedicao)) {
    return { error: 'Tipo de medição inválido.' };
  }

  if (quantidade <= 0 || valorUnitario <= 0) {
    return { error: 'Quantidade e valor unitário devem ser maiores que zero.' };
  }

  if (tipoMedicao === 'CAMINHAO_UNIDADE') {
    const placa = String(data.placa_caminhao || '').trim().toUpperCase();
    const motoristaCpf = onlyDigits(data.motorista_cpf);
    const prestadorCnpj = onlyDigits(data.prestador_cnpj);

    if (!placa || placa.length < 7 || !data.motorista_nome || motoristaCpf.length !== 11 || prestadorCnpj.length !== 14) {
      return { error: 'Caminhão exige placa, nome do motorista, CPF válido e CNPJ do prestador.' };
    }

    return {
      tipoMedicao,
      quantidade,
      unidadeMedida: 'UN',
      valorUnitario,
      placa,
      motoristaCpf,
      prestadorCnpj,
    };
  }

  return {
    tipoMedicao,
    quantidade,
    unidadeMedida: tipoMedicao === 'ESCAVADEIRA_M3' ? 'M3' : String(data.unidade_medida || 'UN').toUpperCase(),
    valorUnitario,
  };
}

function setAuthCookies(res, tokens) {
  const cookieOptions = 'HttpOnly; SameSite=Lax; Path=/';
  res.setHeader('Set-Cookie', [
    `accessToken=${encodeURIComponent(tokens.accessToken)}; Max-Age=900; ${cookieOptions}`,
    `refreshToken=${encodeURIComponent(tokens.refreshToken)}; Max-Age=604800; ${cookieOptions}`,
  ]);
}

function requireAuth(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ ok: false, message: 'Sessão inválida ou expirada.' });
  }

  next();
}

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || true,
  credentials: true,
}));
app.use(express.json({ limit: '8mb' }));
app.use((req, res, next) => {
  req.auth = getAccessPayload(req);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'API funcionando.' });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !String(email).trim()) {
      return res.status(400).json({ ok: false, message: 'E-mail obrigatório.' });
    }

    if (!senha || !String(senha).trim()) {
      return res.status(400).json({ ok: false, message: 'Senha obrigatória.' });
    }

    const usuario = await get(
      'SELECT * FROM usuarios WHERE LOWER(email) = LOWER(?) AND ativo = 1',
      [String(email).trim()]
    );

    if (!usuario) {
      return res.status(404).json({ ok: false, message: 'Usuário não encontrado.' });
    }

    const senhaValida = await verifyPassword(String(senha), usuario.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({ ok: false, message: 'Credenciais inválidas.' });
    }

    const { senha_hash: _senhaHash, ...usuarioSemSenha } = usuario;
    const tokens = createTokenPair(usuarioSemSenha);
    setAuthCookies(res, tokens);

    res.json({
      ok: true,
      user: usuarioSemSenha,
      displayName: getUserDisplayName(usuarioSemSenha),
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const payload = getRefreshPayload(req);
    if (!payload) {
      return res.status(401).json({ ok: false, message: 'Refresh token inválido ou expirado.' });
    }

    const usuario = await get('SELECT id, nome, email, perfil, ativo, criado_em FROM usuarios WHERE id = ? AND ativo = 1', [payload.userId]);
    if (!usuario) {
      return res.status(401).json({ ok: false, message: 'Usuário da sessão não está ativo.' });
    }

    revokeRefreshToken(getRefreshToken(req));
    setAuthCookies(res, createTokenPair(usuario));
    res.json({ ok: true, user: usuario, displayName: getUserDisplayName(usuario) });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/auth/session', (req, res) => {
  if (!req.auth) {
    return res.status(401).json({ ok: false, message: 'Sessão não encontrada.' });
  }

  get('SELECT id, nome, email, perfil, ativo, criado_em FROM usuarios WHERE id = ? AND ativo = 1', [req.auth.userId])
    .then((user) => user
      ? res.json({ ok: true, user, displayName: getUserDisplayName(user) })
      : res.status(401).json({ ok: false, message: 'Usuário da sessão não está ativo.' }))
    .catch((error) => res.status(500).json({ ok: false, message: error.message }));
});

app.post('/api/auth/logout', (req, res) => {
  revokeRefreshToken(getRefreshToken(req));
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const projetos = await all(`
      SELECT p.id, p.nome, p.codigo, p.orcamento_total, p.reserva_total,
             COALESCE(SUM(CASE WHEN l.status = 'APROVADO' THEN l.valor ELSE 0 END), 0) AS gasto_aprovado,
             COALESCE(SUM(CASE WHEN l.status IN ('PENDENTE', 'APROVADO') THEN l.valor ELSE 0 END), 0) AS gasto_total,
             COUNT(l.id) AS qtd_lancamentos
      FROM projetos p
      LEFT JOIN lancamentos l ON l.projeto_id = p.id AND l.excluido_em IS NULL
      WHERE p.ativo = 1
      GROUP BY p.id, p.nome, p.codigo, p.orcamento_total, p.reserva_total
      ORDER BY p.nome ASC
    `);

    const totalGeral = projetos.reduce((acc, projeto) => acc + Number(projeto.gasto_total || 0), 0);
    const aprovados = projetos.reduce((acc, projeto) => acc + Number(projeto.gasto_aprovado || 0), 0);
    const pendentes = await all(`SELECT SUM(valor) AS total FROM lancamentos WHERE status = 'PENDENTE' AND excluido_em IS NULL`);
    const rejeitados = await all(`SELECT SUM(valor) AS total FROM lancamentos WHERE status = 'REJEITADO' AND excluido_em IS NULL`);

    const porCategoria = await all(`
      SELECT c.nome, SUM(l.valor) AS total
      FROM lancamentos l
      JOIN categorias c ON c.id = l.categoria_id
      WHERE l.excluido_em IS NULL
      GROUP BY c.nome
      ORDER BY total DESC
    `);

    const usuarios = await all(`
      SELECT u.id, u.nome, u.perfil,
             COALESCE(SUM(CASE WHEN l.status = 'PENDENTE' AND l.excluido_em IS NULL THEN 1 ELSE 0 END), 0) AS pendentes,
             COALESCE(SUM(CASE WHEN l.status = 'APROVADO' AND l.excluido_em IS NULL THEN 1 ELSE 0 END), 0) AS aprovados
      FROM usuarios u
      LEFT JOIN lancamentos l ON l.criado_por = u.id
      WHERE u.ativo = 1
      GROUP BY u.id, u.nome, u.perfil
      ORDER BY u.nome ASC
    `);

    res.json({
      totalGeral,
      totalAprovado: aprovados,
      totalPendente: toNumber(pendentes[0]?.total || 0),
      totalRejeitado: toNumber(rejeitados[0]?.total || 0),
      projetos,
      porCategoria,
      usuarios,
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/categorias', requireAuth, async (req, res) => {
  try {
    const categorias = await all('SELECT * FROM categorias WHERE ativo = 1 ORDER BY nome ASC');
    res.json(categorias);
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/formas-pagamento', requireAuth, async (req, res) => {
  try {
    const formasPagamento = await all('SELECT * FROM formas_pagamento WHERE ativo = 1 ORDER BY nome ASC');
    res.json(formasPagamento);
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/usuarios', requireAuth, async (req, res) => {
  try {
    const usuarios = await all(`
      SELECT id, nome, email, perfil, ativo, criado_em
      FROM usuarios
      WHERE ativo = 1
      ORDER BY nome ASC
    `);
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/usuarios', requireAuth, async (req, res) => {
  try {
    const { nome, email, perfil = 'LANCADOR', senha } = req.body;

    if (!nome || !email) {
      return res.status(400).json({ ok: false, message: 'Nome e e-mail são obrigatórios.' });
    }

    const existing = await get('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ ok: false, message: 'Usuário já cadastrado.' });
    }

    const senhaHash = await hashPassword(senha || 'Temporaria123!');
    const result = await run(`
      INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo)
      VALUES (?, ?, ?, ?, 1)
    `, [nome, email, senhaHash, perfil]);

    const usuario = await get(`
      SELECT id, nome, email, perfil, ativo, criado_em
      FROM usuarios WHERE id = ?
    `, [result.id]);
    res.status(201).json({ ok: true, item: usuario });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/projetos', requireAuth, async (req, res) => {
  try {
    const projetos = await all('SELECT * FROM projetos WHERE ativo = 1 ORDER BY nome ASC');
    res.json(projetos);
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/projetos', requireAuth, async (req, res) => {
  try {
    const { codigo, nome, descricao, orcamento_total, reserva_total } = req.body;

    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ ok: false, message: 'Nome do projeto é obrigatório.' });
    }

    const codigoFinal = String(codigo || `PRJ-${Date.now()}`).trim();
    const result = await run(`
      INSERT INTO projetos (codigo, nome, descricao, orcamento_total, reserva_total, ativo)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [codigoFinal, nome.trim(), descricao || '', toNumber(orcamento_total, 0), toNumber(reserva_total, 0)]);

    const projeto = await get('SELECT * FROM projetos WHERE id = ?', [result.id]);
    res.status(201).json({ ok: true, item: projeto });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.patch('/api/projetos/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo, nome, descricao, orcamento_total, reserva_total } = req.body;

    const projetoAtual = await get('SELECT * FROM projetos WHERE id = ?', [id]);
    if (!projetoAtual) {
      return res.status(404).json({ ok: false, message: 'Projeto não encontrado.' });
    }

    const codigoFinal = codigo || projetoAtual.codigo;
    const nomeFinal = nome || projetoAtual.nome;
    const descricaoFinal = descricao ?? projetoAtual.descricao;
    const orcamentoFinal = toNumber(orcamento_total, Number(projetoAtual.orcamento_total || 0));
    const reservaFinal = toNumber(reserva_total, Number(projetoAtual.reserva_total || 0));

    await run(`
      UPDATE projetos
      SET codigo = ?, nome = ?, descricao = ?, orcamento_total = ?, reserva_total = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [codigoFinal, nomeFinal, descricaoFinal, orcamentoFinal, reservaFinal, id]);

    const projeto = await get('SELECT * FROM projetos WHERE id = ?', [id]);
    res.json({ ok: true, item: projeto });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/projetos/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const projeto = await get('SELECT * FROM projetos WHERE id = ? AND ativo = 1', [id]);

    if (!projeto) {
      return res.status(404).json({ ok: false, message: 'Projeto não encontrado.' });
    }

    const lancamentos = await all(`
      SELECT l.*, u.nome AS usuario_nome
      FROM lancamentos l
      LEFT JOIN usuarios u ON u.id = l.criado_por
      WHERE l.projeto_id = ? AND l.excluido_em IS NULL
      ORDER BY l.data_lancamento DESC
    `, [id]);

    const totalGasto = lancamentos.reduce((total, item) => total + Number(item.valor || 0), 0);
    const aprovado = lancamentos.filter((item) => item.status === 'APROVADO').reduce((total, item) => total + Number(item.valor || 0), 0);

    res.json({
      ok: true,
      item: {
        ...projeto,
        totalGasto,
        totalAprovado: aprovado,
        pendentes: lancamentos.filter((item) => item.status === 'PENDENTE').length,
        lancamentos,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/lancamentos', requireAuth, async (req, res) => {
  try {
    const rows = await all(`
      SELECT l.*, p.nome AS projeto_nome, c.nome AS categoria_nome, fp.nome AS forma_pagamento_nome
      FROM lancamentos l
      JOIN projetos p ON p.id = l.projeto_id
      JOIN categorias c ON c.id = l.categoria_id
      LEFT JOIN formas_pagamento fp ON fp.id = l.forma_pagamento_id
      WHERE l.excluido_em IS NULL
      ORDER BY l.data_lancamento DESC, l.id DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/lancamentos', requireAuth, async (req, res) => {
  try {
    const {
      projeto_id,
      categoria_id,
      forma_pagamento_id,
      descricao,
      fornecedor,
      valor,
      tipo_medicao,
      quantidade,
      unidade_medida,
      valor_unitario,
      placa_caminhao,
      motorista_nome,
      motorista_cpf,
      prestador_cnpj,
      foto_caminhao,
      data_lancamento,
      status = 'PENDENTE',
      numero_nota,
      observacoes,
      criado_por,
    } = req.body;

    if (!projeto_id || !categoria_id || !descricao || !data_lancamento) {
      return res.status(400).json({ ok: false, message: 'Campos obrigatórios ausentes.' });
    }

    const measured = validateMeasuredExpense({
      tipo_medicao,
      quantidade,
      unidade_medida,
      valor,
      valor_unitario,
      placa_caminhao,
      motorista_nome,
      motorista_cpf,
      prestador_cnpj,
    });

    if (measured.error) {
      return res.status(400).json({ ok: false, message: measured.error });
    }

    if (measured.tipoMedicao === 'CAMINHAO_UNIDADE' && (!foto_caminhao || String(foto_caminhao).length > 4 * 1024 * 1024)) {
      return res.status(400).json({ ok: false, message: 'A foto do caminhão é obrigatória e deve ter no máximo 4 MB.' });
    }

    const result = await run(`
      INSERT INTO lancamentos (
        projeto_id,
        categoria_id,
        forma_pagamento_id,
        descricao,
        fornecedor,
        valor,
        tipo_medicao,
        quantidade,
        unidade_medida,
        valor_unitario,
        placa_caminhao,
        motorista_nome,
        motorista_cpf,
        prestador_cnpj,
        foto_caminhao,
        data_lancamento,
        status,
        numero_nota,
        observacoes,
        criado_por,
        atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      projeto_id,
      categoria_id,
      forma_pagamento_id || null,
      descricao,
      fornecedor || '',
      measured.quantidade * measured.valorUnitario,
      measured.tipoMedicao,
      measured.quantidade,
      measured.unidadeMedida,
      measured.valorUnitario,
      measured.placa || null,
      motorista_nome || null,
      measured.motoristaCpf || null,
      measured.prestadorCnpj || null,
      foto_caminhao || null,
      data_lancamento,
      status,
      numero_nota || '',
      observacoes || '',
      criado_por || req.auth.userId,
    ]);

    const novo = await get('SELECT * FROM lancamentos WHERE id = ?', [result.id]);
    res.status(201).json({ ok: true, item: novo });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.patch('/api/lancamentos/:id/status', requireAuth, async (req, res) => {
  try {
    const { status, aprovado_por, usuario_id } = req.body;
    const { id } = req.params;

    if (!status) {
      return res.status(400).json({ ok: false, message: 'Status obrigatório.' });
    }

    const perfilAtual = usuario_id
      ? (await get('SELECT perfil FROM usuarios WHERE id = ?', [usuario_id]))?.perfil
      : req.auth?.perfil;

    if (['APROVADO', 'REJEITADO'].includes(String(status).toUpperCase()) && !canApproveStatus(perfilAtual, status)) {
      return res.status(403).json({
        ok: false,
        message: 'Apenas usuários com perfil de aprovação podem alterar o status do lançamento.',
      });
    }

    const dataAprovacao = status === 'APROVADO' ? new Date().toISOString() : null;

    await run(`
      UPDATE lancamentos
      SET status = ?, aprovado_por = ?, data_aprovacao = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, aprovado_por || usuario_id || req.auth.userId, dataAprovacao, id]);

    const item = await get('SELECT * FROM lancamentos WHERE id = ?', [id]);
    res.json({ ok: true, item });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.patch('/api/projetos/:id/orcamento', requireAuth, async (req, res) => {
  try {
    const { orcamento_total, reserva_total, usuario_id } = req.body;
    const { id } = req.params;

    if (orcamento_total === undefined && reserva_total === undefined) {
      return res.status(400).json({ ok: false, message: 'Informe o valor do orçamento ou da reserva.' });
    }

    const perfilAtual = usuario_id
      ? (await get('SELECT perfil FROM usuarios WHERE id = ?', [usuario_id]))?.perfil
      : req.auth?.perfil;

    if (!canEditBudget(perfilAtual)) {
      return res.status(403).json({
        ok: false,
        message: 'Apenas administradores podem ajustar o orçamento do projeto.',
      });
    }

    const projetoAtual = await get('SELECT * FROM projetos WHERE id = ?', [id]);
    if (!projetoAtual) {
      return res.status(404).json({ ok: false, message: 'Projeto não encontrado.' });
    }

    const novoOrcamento = orcamento_total !== undefined ? Number(orcamento_total) : Number(projetoAtual.orcamento_total);
    const novaReserva = reserva_total !== undefined ? Number(reserva_total) : Number(projetoAtual.reserva_total);

    await run(`
      UPDATE projetos
      SET orcamento_total = ?, reserva_total = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [novoOrcamento, novaReserva, id]);

    const projeto = await get('SELECT * FROM projetos WHERE id = ?', [id]);
    res.json({ ok: true, item: projeto });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/importar-planilha', requireAuth, async (req, res) => {
  try {
    const csvText = req.body?.csv || req.body?.text || req.body?.fileContent;
    if (!csvText || typeof csvText !== 'string') {
      return res.status(400).json({ ok: false, message: 'Arquivo CSV inválido ou ausente.' });
    }

    const rows = parseCsvImportRows(csvText);
    if (!rows.length) {
      return res.status(400).json({ ok: false, message: 'Nenhuma linha válida foi encontrada no arquivo importado.' });
    }

    let imported = 0;
    for (const row of rows) {
      const projetoNome = String(row.projeto || row.projeto_nome || '').trim() || 'Projeto importado';
      const categoriaNome = String(row.categoria || row.categoria_nome || 'Outros').trim() || 'Outros';
      const descricao = String(row.descricao || 'Importado via planilha').trim();
      const valor = Number(row.valor || 0);
      const status = String(row.status || 'PENDENTE').trim().toUpperCase();
      const dataLancamento = row.data_lancamento || row.data || new Date().toISOString().slice(0, 10);

      let projeto = await get('SELECT * FROM projetos WHERE LOWER(nome) = LOWER(?) AND ativo = 1', [projetoNome]);
      if (!projeto) {
        const codigo = `PRJ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const novoProjeto = await run(`
          INSERT INTO projetos (codigo, nome, descricao, orcamento_total, reserva_total, ativo)
          VALUES (?, ?, ?, 0, 0, 1)
        `, [codigo, projetoNome, `Importado automaticamente em ${new Date().toISOString().slice(0, 10)}`]);
        projeto = { id: novoProjeto.id };
      }

      let categoria = await get('SELECT * FROM categorias WHERE LOWER(nome) = LOWER(?) AND ativo = 1', [categoriaNome]);
      if (!categoria) {
        const codigo = `CAT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const novaCategoria = await run('INSERT INTO categorias (codigo, nome, ativo) VALUES (?, ?, 1)', [codigo, categoriaNome]);
        categoria = { id: novaCategoria.id };
      }

      await run(`
        INSERT INTO lancamentos (
          projeto_id, categoria_id, descricao, fornecedor, valor, data_lancamento, status,
          numero_nota, observacoes, criado_por, atualizado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        projeto.id,
        categoria.id,
        descricao,
        row.fornecedor || '',
        Number.isFinite(valor) ? valor : 0,
        dataLancamento,
        ['PENDENTE', 'APROVADO', 'REJEITADO'].includes(status) ? status : 'PENDENTE',
        row.numero_nota || '',
        row.observacoes || '',
        req.auth.userId,
      ]);

      imported += 1;
    }

    res.json({
      ok: true,
      imported,
      total: rows.length,
      summary: buildExecutiveSummary(rows),
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/relatorios/resumo-mensal', requireAuth, async (req, res) => {
  try {
    const rows = await all(`
      SELECT strftime('%Y-%m', data_lancamento) AS mes,
             SUM(valor) AS total,
             COUNT(*) AS qtd
      FROM lancamentos
      WHERE excluido_em IS NULL
      GROUP BY strftime('%Y-%m', data_lancamento)
      ORDER BY mes DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/relatorios/executivo', requireAuth, async (req, res) => {
  try {
    const rows = await all(`
      SELECT p.nome AS projeto,
             c.nome AS categoria,
             l.descricao,
             l.fornecedor,
             l.valor,
             l.status,
             l.data_lancamento,
             u.nome AS criado_por
      FROM lancamentos l
      JOIN projetos p ON p.id = l.projeto_id
      JOIN categorias c ON c.id = l.categoria_id
      JOIN usuarios u ON u.id = l.criado_por
      WHERE l.excluido_em IS NULL
      ORDER BY l.data_lancamento DESC
    `);

    const porProjeto = await all(`
      SELECT p.nome AS projeto,
             ROUND(SUM(l.valor), 2) AS total,
             COUNT(*) AS qtd
      FROM lancamentos l
      JOIN projetos p ON p.id = l.projeto_id
      WHERE l.excluido_em IS NULL
      GROUP BY p.id, p.nome
      ORDER BY total DESC
    `);

    const porCategoria = await all(`
      SELECT c.nome AS categoria,
             ROUND(SUM(l.valor), 2) AS total,
             COUNT(*) AS qtd
      FROM lancamentos l
      JOIN categorias c ON c.id = l.categoria_id
      WHERE l.excluido_em IS NULL
      GROUP BY c.id, c.nome
      ORDER BY total DESC
    `);

    const tendencia = await all(`
      SELECT strftime('%Y-%m', data_lancamento) AS mes,
             ROUND(SUM(valor), 2) AS total
      FROM lancamentos
      WHERE excluido_em IS NULL
      GROUP BY strftime('%Y-%m', data_lancamento)
      ORDER BY mes DESC
      LIMIT 6
    `);

    res.json({
      ok: true,
      summary: buildExecutiveSummary(rows),
      porProjeto,
      porCategoria,
      tendencia: [...tendencia].reverse(),
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/relatorios/export', requireAuth, async (req, res) => {
  try {
    const rows = await all(`
      SELECT p.nome AS projeto,
             c.nome AS categoria,
             l.descricao,
             l.fornecedor,
             l.valor,
             l.status,
             l.data_lancamento,
             u.nome AS criado_por
      FROM lancamentos l
      JOIN projetos p ON p.id = l.projeto_id
      JOIN categorias c ON c.id = l.categoria_id
      JOIN usuarios u ON u.id = l.criado_por
      WHERE l.excluido_em IS NULL
      ORDER BY l.data_lancamento DESC
    `);

    const header = ['projeto', 'categoria', 'descricao', 'fornecedor', 'valor', 'status', 'data_lancamento', 'criado_por'];
    const csvRows = [header.join(',')];

    rows.forEach((row) => {
      const values = header.map((key) => {
        const value = row[key] ?? '';
        const normalized = String(value).replace(/"/g, '""');
        return `"${normalized}"`;
      });
      csvRows.push(values.join(','));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio_despesas.csv"');
    res.send(csvRows.join('\n'));
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/caminhoes', requireAuth, async (req, res) => {
  try {
    const rows = await all(`
      SELECT c.*, COUNT(v.id) AS qtd_viagens,
             COALESCE(SUM(v.quantidade_m3), 0) AS volume_total,
             COALESCE(SUM(v.quantidade_m3 * v.valor_unitario), 0) AS custo_total
      FROM caminhoes c
      LEFT JOIN viagens_caminhao v ON v.caminhao_id = c.id
      WHERE c.ativo = 1
      GROUP BY c.id
      ORDER BY c.placa ASC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/caminhoes', requireAuth, async (req, res) => {
  try {
    const { placa, modelo, capacidade_m3, prestador_nome, prestador_cnpj, foto } = req.body;
    const placaNormalizada = String(placa || '').trim().toUpperCase();
    const cnpj = onlyDigits(prestador_cnpj);

    if (!placaNormalizada || placaNormalizada.length < 7 || (cnpj && cnpj.length !== 14)) {
      return res.status(400).json({ ok: false, message: 'Informe uma placa válida e, se preenchido, um CNPJ válido.' });
    }

    const result = await run(`
      INSERT INTO caminhoes (placa, modelo, capacidade_m3, prestador_nome, prestador_cnpj, foto)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [placaNormalizada, modelo || '', toNumber(capacidade_m3), prestador_nome || '', cnpj || null, foto || null]);

    res.status(201).json({ ok: true, item: await get('SELECT * FROM caminhoes WHERE id = ?', [result.id]) });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/caminhoes/:id/viagens', requireAuth, async (req, res) => {
  try {
    const rows = await all(`
      SELECT v.*, p.nome AS projeto_nome, c.placa
      FROM viagens_caminhao v
      JOIN projetos p ON p.id = v.projeto_id
      JOIN caminhoes c ON c.id = v.caminhao_id
      WHERE v.caminhao_id = ?
      ORDER BY v.data_viagem DESC, v.id DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/viagens-caminhao', requireAuth, async (req, res) => {
  try {
    const { caminhao_id, projeto_id, motorista_nome, motorista_cpf, origem, destino, quantidade_m3, valor_unitario, data_viagem, observacoes } = req.body;
    const cpf = onlyDigits(motorista_cpf);

    if (!caminhao_id || !projeto_id || !motorista_nome || cpf.length !== 11 || toNumber(quantidade_m3) <= 0 || toNumber(valor_unitario) <= 0 || !data_viagem) {
      return res.status(400).json({ ok: false, message: 'Informe caminhão, projeto, motorista, CPF, volume, valor e data válidos.' });
    }

    const result = await run(`
      INSERT INTO viagens_caminhao (caminhao_id, projeto_id, motorista_nome, motorista_cpf, origem, destino, quantidade_m3, valor_unitario, data_viagem, observacoes, criado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [caminhao_id, projeto_id, motorista_nome, cpf, origem || '', destino || '', toNumber(quantidade_m3), toNumber(valor_unitario), data_viagem, observacoes || '', req.auth.userId]);

    res.status(201).json({ ok: true, item: await get('SELECT * FROM viagens_caminhao WHERE id = ?', [result.id]) });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

async function start() {
  try {
    await initDatabase();
    app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));
  } catch (error) {
    console.error('Falha ao iniciar o servidor:', error.message);
    process.exit(1);
  }
}

start();
