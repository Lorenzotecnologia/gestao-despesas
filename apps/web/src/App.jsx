import { useEffect, useMemo, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const SESSION_KEY = 'gestao-despesas-session';

const initialProjectForm = {
  codigo: '',
  nome: '',
  descricao: '',
  orcamento_total: '',
  reserva_total: '',
};

const initialExpenseForm = {
  projeto_id: '1',
  categoria_id: '1',
  forma_pagamento_id: '1',
  descricao: '',
  fornecedor: '',
  valor: '',
  tipo_medicao: 'GERAL',
  quantidade: '1',
  unidade_medida: 'UN',
  valor_unitario: '',
  placa_caminhao: '',
  motorista_nome: '',
  motorista_cpf: '',
  prestador_cnpj: '',
  foto_caminhao: '',
  data_lancamento: new Date().toISOString().slice(0, 10),
  status: 'PENDENTE',
  numero_nota: '',
  observacoes: '',
};

const initialFleetForm = { placa: '', modelo: '', capacidade_m3: '', prestador_nome: '', prestador_cnpj: '', foto: '' };

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));
}

function getStatusClass(status) {
  return status ? `status ${status.toLowerCase()}` : 'status pendente';
}

export default function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const [sessionUser, setSessionUser] = useState(() => {
    try {
      const storedValue = localStorage.getItem(SESSION_KEY);
      return storedValue ? JSON.parse(storedValue) : null;
    } catch (error) {
      return null;
    }
  });
  const [dashboard, setDashboard] = useState(null);
  const [executiveReport, setExecutiveReport] = useState(null);
  const [lancamentos, setLancamentos] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [caminhoes, setCaminhoes] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null);
  const [projectForm, setProjectForm] = useState(initialProjectForm);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [expenseForm, setExpenseForm] = useState(initialExpenseForm);
  const [budgetDraft, setBudgetDraft] = useState({});
  const [loginEmail, setLoginEmail] = useState('admin@empresa.com');
  const [loginPassword, setLoginPassword] = useState('admin123');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  const [expenseError, setExpenseError] = useState('');
  const [fleetForm, setFleetForm] = useState(initialFleetForm);
  const [fleetMessage, setFleetMessage] = useState('');
  const [importStatus, setImportStatus] = useState('');

  const user = sessionUser;
  const canApprove = ['ADMIN', 'APROVADOR'].includes(user?.perfil || 'LANCADOR');
  const canEditBudget = user?.perfil === 'ADMIN';

  const pendingCount = useMemo(
    () => lancamentos.filter((item) => item.status === 'PENDENTE').length,
    [lancamentos]
  );

  async function apiFetch(url, options = {}, canRetry = true) {
    const response = await fetch(url, { ...options, credentials: 'include' });
    if (response.status !== 401 || !canRetry || url.endsWith('/auth/refresh')) {
      return response;
    }

    const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!refreshResponse.ok) {
      setSessionUser(null);
      localStorage.removeItem(SESSION_KEY);
      return response;
    }

    return apiFetch(url, options, false);
  }

  async function bootstrapSession() {
    try {
      const response = await apiFetch(`${API_URL}/auth/session`);
      if (!response.ok) {
        setSessionUser(null);
        localStorage.removeItem(SESSION_KEY);
        return;
      }

      const payload = await response.json();
      if (payload.ok) {
        setSessionUser(payload.user);
        localStorage.setItem(SESSION_KEY, JSON.stringify(payload.user));
      }
    } catch (error) {
      setSessionUser(null);
      localStorage.removeItem(SESSION_KEY);
    }
  }

  async function fetchProtectedData() {
    if (!user) {
      return;
    }

    try {
      const [dashRes, projRes, catsRes, usersRes, reportRes, lancRes, fleetRes] = await Promise.all([
        apiFetch(`${API_URL}/dashboard`),
        apiFetch(`${API_URL}/projetos`),
        apiFetch(`${API_URL}/categorias`),
        apiFetch(`${API_URL}/usuarios`),
        apiFetch(`${API_URL}/relatorios/executivo`),
        apiFetch(`${API_URL}/lancamentos`),
        apiFetch(`${API_URL}/caminhoes`),
      ]);

      const dash = await dashRes.json();
      const proj = await projRes.json();
      const cats = await catsRes.json();
      const users = await usersRes.json();
      const report = await reportRes.json();
      const lanc = await lancRes.json();
      const fleet = await fleetRes.json();

      setDashboard(dash);
      setProjetos(Array.isArray(proj) ? proj : []);
      setCategorias(Array.isArray(cats) ? cats : []);
      setUsuarios(Array.isArray(users) ? users : []);
      setExecutiveReport(report.ok ? report : null);
      setLancamentos(Array.isArray(lanc) ? lanc : []);
      setCaminhoes(Array.isArray(fleet) ? fleet : []);

      if (proj.length && (!selectedProjectId || !proj.some((item) => item.id === selectedProjectId))) {
        setSelectedProjectId(proj[0].id);
      }
    } catch (error) {
      console.error('Erro ao buscar os dados protegidos:', error);
    }
  }

  useEffect(() => {
    bootstrapSession();
  }, []);

  useEffect(() => {
    if (user) {
      fetchProtectedData();
    }
  }, [user]);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectDetail(selectedProjectId);
    }
  }, [selectedProjectId]);

  async function handleLogin(event) {
    event.preventDefault();

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: loginEmail, senha: loginPassword }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || 'Falha no login');
      }

      setLoginError('');
      setSessionUser(payload.user);
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload.user));
      setActiveView('dashboard');
      await fetchProtectedData();
    } catch (error) {
      setLoginError(error.message);
      console.error('Erro ao fazer login:', error);
    }
  }

  async function handleLogout() {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } catch (error) {
      console.error('Erro ao encerrar sessão:', error);
    } finally {
      setSessionUser(null);
      localStorage.removeItem(SESSION_KEY);
      setActiveView('dashboard');
    }
  }

  async function loadProjectDetail(projectId) {
    try {
      const response = await apiFetch(`${API_URL}/projetos/${projectId}`);
      const payload = await response.json();
      if (payload.ok) {
        setProjectDetail(payload.item);
      }
    } catch (error) {
      console.error('Erro ao buscar detalhe do projeto:', error);
    }
  }

  async function exportReport() {
    try {
      const response = await apiFetch(`${API_URL}/relatorios/export`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'relatorio_despesas.csv';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao exportar relatório:', error);
    }
  }

  async function handleExpenseSubmit(event) {
    event.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...expenseForm,
        valor: expenseForm.tipo_medicao === 'GERAL'
          ? Number(expenseForm.valor)
          : Number(expenseForm.quantidade) * Number(expenseForm.valor_unitario),
        quantidade: Number(expenseForm.quantidade),
        valor_unitario: expenseForm.tipo_medicao === 'GERAL' ? Number(expenseForm.valor) : Number(expenseForm.valor_unitario),
        projeto_id: Number(expenseForm.projeto_id),
        categoria_id: Number(expenseForm.categoria_id),
        forma_pagamento_id: expenseForm.forma_pagamento_id ? Number(expenseForm.forma_pagamento_id) : null,
        criado_por: user?.id,
      };

      const response = await apiFetch(`${API_URL}/lancamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Falha ao criar lançamento');
      }

      setExpenseForm({ ...initialExpenseForm, projeto_id: String(expenseForm.projeto_id || 1) });
      setExpenseError('');
      await fetchProtectedData();
    } catch (error) {
      setExpenseError(error.message);
      console.error('Erro ao salvar lançamento:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleTruckPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      setExpenseError('A foto do caminhão deve ter no máximo 4 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setExpenseForm((previous) => ({ ...previous, foto_caminhao: reader.result }));
    reader.readAsDataURL(file);
  }

  async function handleStatus(id, status) {
    if (!canApprove) return;

    await apiFetch(`${API_URL}/lancamentos/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status, usuario_id: user?.id }),
    });

    await fetchProtectedData();
  }

  async function handleBudgetUpdate(projectId) {
    if (!canEditBudget) return;

    const draft = budgetDraft[projectId] || {};
    const projeto = projetos.find((item) => item.id === projectId);
    if (!projeto) return;

    await apiFetch(`${API_URL}/projetos/${projectId}/orcamento`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        orcamento_total: Number(draft.orcamento_total ?? projeto.orcamento_total),
        reserva_total: Number(draft.reserva_total ?? projeto.reserva_total),
        usuario_id: user?.id,
      }),
    });

    await fetchProtectedData();
  }

  async function handleProjectSubmit(event) {
    event.preventDefault();

    try {
      const response = await apiFetch(editingProjectId ? `${API_URL}/projetos/${editingProjectId}` : `${API_URL}/projetos`, {
        method: editingProjectId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          codigo: projectForm.codigo || `PRJ-${Date.now()}`,
          nome: projectForm.nome,
          descricao: projectForm.descricao,
          orcamento_total: Number(projectForm.orcamento_total || 0),
          reserva_total: Number(projectForm.reserva_total || 0),
        }),
      });

      if (!response.ok) {
        throw new Error('Falha ao criar projeto');
      }

      setProjectForm(initialProjectForm);
      setEditingProjectId(null);
      await fetchProtectedData();
    } catch (error) {
      console.error('Erro ao criar projeto:', error);
    }
  }

  function startEditProject(project) {
    setEditingProjectId(project.id);
    setProjectForm({
      codigo: project.codigo || '',
      nome: project.nome || '',
      descricao: project.descricao || '',
      orcamento_total: project.orcamento_total ?? '',
      reserva_total: project.reserva_total ?? '',
    });
    setSelectedProjectId(project.id);
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const csvText = await file.text();
      const response = await apiFetch(`${API_URL}/importar-planilha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ csv: csvText, fileName: file.name }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || 'Falha ao importar planilha');
      }

      setImportStatus(`Importação concluída: ${payload.imported} linhas processadas.`);
      await fetchProtectedData();
    } catch (error) {
      setImportStatus(error.message);
      console.error('Erro ao importar planilha:', error);
    }
  }

  async function handleFleetSubmit(event) {
    event.preventDefault();
    const response = await apiFetch(`${API_URL}/caminhoes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fleetForm, capacidade_m3: Number(fleetForm.capacidade_m3 || 0) }),
    });
    const payload = await response.json();
    setFleetMessage(response.ok ? 'Caminhão cadastrado com sucesso.' : (payload.message || 'Falha ao cadastrar caminhão.'));
    if (response.ok) { setFleetForm(initialFleetForm); await fetchProtectedData(); }
  }

  function handleFleetPhoto(event) {
    const file = event.target.files?.[0];
    if (!file || file.size > 4 * 1024 * 1024) { setFleetMessage('A foto deve ter no máximo 4 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setFleetForm((previous) => ({ ...previous, foto: reader.result }));
    reader.readAsDataURL(file);
  }

  const renderFleet = () => (
    <section className="fleet-screen">
      <div className="panel"><h3>Novo caminhão</h3>
        <form onSubmit={handleFleetSubmit} className="project-form">
          <input required placeholder="Placa" value={fleetForm.placa} onChange={(event) => setFleetForm({ ...fleetForm, placa: event.target.value.toUpperCase() })} />
          <input placeholder="Modelo" value={fleetForm.modelo} onChange={(event) => setFleetForm({ ...fleetForm, modelo: event.target.value })} />
          <input type="number" min="0" step="0.01" placeholder="Capacidade em m³" value={fleetForm.capacidade_m3} onChange={(event) => setFleetForm({ ...fleetForm, capacidade_m3: event.target.value })} />
          <input placeholder="Nome do prestador" value={fleetForm.prestador_nome} onChange={(event) => setFleetForm({ ...fleetForm, prestador_nome: event.target.value })} />
          <input placeholder="CNPJ do prestador" value={fleetForm.prestador_cnpj} onChange={(event) => setFleetForm({ ...fleetForm, prestador_cnpj: event.target.value })} />
          <label className="photo-field">Foto do caminhão<input type="file" accept="image/*" onChange={handleFleetPhoto} /></label>
          <button type="submit">Cadastrar caminhão</button>
        </form>{fleetMessage && <div className="import-status">{fleetMessage}</div>}
      </div>
      <div className="panel"><h3>Frota cadastrada</h3><div className="fleet-grid">
        {caminhoes.map((truck) => <article className="fleet-card" key={truck.id}>{truck.foto && <img src={truck.foto} alt={`Caminhão ${truck.placa}`} />}<strong>{truck.placa}</strong><small>{truck.modelo || 'Modelo não informado'}</small><div className="stat-row"><span>Viagens</span><strong>{truck.qtd_viagens || 0}</strong></div><div className="stat-row"><span>Volume</span><strong>{Number(truck.volume_total || 0).toLocaleString('pt-BR')} m³</strong></div><div className="stat-row"><span>Custo</span><strong>{formatCurrency(truck.custo_total)}</strong></div></article>)}
      </div></div>
    </section>
  );

  const renderDashboard = () => (
    <>
      <section className="metrics">
        <div className="card">
          <span>Gasto Total</span>
          <strong>{formatCurrency(dashboard?.totalGeral || 0)}</strong>
        </div>
        <div className="card success">
          <span>Aprovado</span>
          <strong>{formatCurrency(dashboard?.totalAprovado || 0)}</strong>
        </div>
        <div className="card warning">
          <span>Pendente</span>
          <strong>{formatCurrency(dashboard?.totalPendente || 0)}</strong>
        </div>
        <div className="card danger">
          <span>Rejeitado</span>
          <strong>{formatCurrency(dashboard?.totalRejeitado || 0)}</strong>
        </div>
      </section>

      <section className="panel trend-panel">
        <div className="section-heading">
          <div>
            <h3>Tendência mensal</h3>
            <p className="muted-text">Evolução do valor lançado nos últimos meses.</p>
          </div>
          <span className="chart-legend"><i /> Total lançado</span>
        </div>
        {renderTrendChart()}
      </section>

      <section className="layout-grid">
        <div className="panel form-panel">
          <h3>Novo lançamento</h3>
          <form onSubmit={handleExpenseSubmit} className="expense-form">
            <select value={expenseForm.projeto_id} onChange={(event) => setExpenseForm({ ...expenseForm, projeto_id: event.target.value })}>
              {projetos.map((project) => (
                <option key={project.id} value={project.id}>{project.nome}</option>
              ))}
            </select>

            <select value={expenseForm.categoria_id} onChange={(event) => setExpenseForm({ ...expenseForm, categoria_id: event.target.value })}>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>
              ))}
            </select>

            <select value={expenseForm.tipo_medicao} onChange={(event) => setExpenseForm({ ...expenseForm, tipo_medicao: event.target.value })}>
              <option value="GERAL">Despesa geral</option>
              <option value="ESCAVADEIRA_M3">Escavadeira por m³</option>
              <option value="CAMINHAO_UNIDADE">Caminhão por unidade</option>
            </select>

            <input type="text" placeholder="Descrição" value={expenseForm.descricao} onChange={(event) => setExpenseForm({ ...expenseForm, descricao: event.target.value })} />
            <input type="text" placeholder="Fornecedor" value={expenseForm.fornecedor} onChange={(event) => setExpenseForm({ ...expenseForm, fornecedor: event.target.value })} />
            {expenseForm.tipo_medicao === 'GERAL' ? (
              <input type="number" step="0.01" placeholder="Valor total" value={expenseForm.valor} onChange={(event) => setExpenseForm({ ...expenseForm, valor: event.target.value })} />
            ) : (
              <>
                <input type="number" min="0.01" step="0.01" placeholder="Quantidade" value={expenseForm.quantidade} onChange={(event) => setExpenseForm({ ...expenseForm, quantidade: event.target.value })} />
                <input type="number" min="0.01" step="0.01" placeholder={expenseForm.tipo_medicao === 'ESCAVADEIRA_M3' ? 'Valor por m³' : 'Valor por caminhão'} value={expenseForm.valor_unitario} onChange={(event) => setExpenseForm({ ...expenseForm, valor_unitario: event.target.value })} />
                <div className="calculated-total">Total calculado: {formatCurrency(Number(expenseForm.quantidade || 0) * Number(expenseForm.valor_unitario || 0))}</div>
              </>
            )}

            {expenseForm.tipo_medicao === 'CAMINHAO_UNIDADE' && (
              <div className="truck-fields">
                <input type="text" required placeholder="Placa do caminhão" value={expenseForm.placa_caminhao} onChange={(event) => setExpenseForm({ ...expenseForm, placa_caminhao: event.target.value.toUpperCase() })} />
                <input type="text" required placeholder="Nome do motorista" value={expenseForm.motorista_nome} onChange={(event) => setExpenseForm({ ...expenseForm, motorista_nome: event.target.value })} />
                <input type="text" required placeholder="CPF do motorista" value={expenseForm.motorista_cpf} onChange={(event) => setExpenseForm({ ...expenseForm, motorista_cpf: event.target.value })} />
                <input type="text" required placeholder="CNPJ do prestador" value={expenseForm.prestador_cnpj} onChange={(event) => setExpenseForm({ ...expenseForm, prestador_cnpj: event.target.value })} />
                <label className="photo-field">
                  Foto do caminhão
                  <input type="file" accept="image/*" required onChange={handleTruckPhoto} />
                </label>
                {expenseForm.foto_caminhao && <img className="truck-photo-preview" src={expenseForm.foto_caminhao} alt="Pré-visualização do caminhão" />}
              </div>
            )}
            <input type="date" value={expenseForm.data_lancamento} onChange={(event) => setExpenseForm({ ...expenseForm, data_lancamento: event.target.value })} />
            <select value={expenseForm.status} onChange={(event) => setExpenseForm({ ...expenseForm, status: event.target.value })}>
              <option value="PENDENTE">Pendente</option>
              <option value="APROVADO">Aprovado</option>
              <option value="REJEITADO">Rejeitado</option>
            </select>
            <input type="text" placeholder="Número da nota" value={expenseForm.numero_nota} onChange={(event) => setExpenseForm({ ...expenseForm, numero_nota: event.target.value })} />
            <textarea placeholder="Observações" value={expenseForm.observacoes} onChange={(event) => setExpenseForm({ ...expenseForm, observacoes: event.target.value })} />
            <button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar lançamento'}</button>
            {expenseError && <div className="form-error">{expenseError}</div>}
          </form>
        </div>

        <div className="panel">
          <h3>Fluxo de aprovação</h3>
          <div className="user-list">
            {(dashboard?.usuarios || usuarios).map((usuario) => (
              <div key={usuario.id} className="user-item">
                <div>
                  <strong>{usuario.nome}</strong>
                  <small>{usuario.perfil}</small>
                </div>
                <div className="user-metrics">
                  <span>{usuario.pendentes ?? 0} pendentes</span>
                  <span>{usuario.aprovados ?? 0} aprovados</span>
                </div>
              </div>
            ))}
          </div>

          <h3 className="sub-title">Orçamento por projeto</h3>
          <div className="project-list">
            {projetos.map((projeto) => (
              <div key={projeto.id} className="project-budget-row">
                <div>
                  <strong>{projeto.nome}</strong>
                  <small>{formatCurrency(projeto.gasto_total || 0)} gasto</small>
                </div>
                <div className="budget-controls">
                  <input
                    type="number"
                    step="0.01"
                    value={budgetDraft[projeto.id]?.orcamento_total ?? projeto.orcamento_total}
                    onChange={(event) =>
                      setBudgetDraft((previous) => ({
                        ...previous,
                        [projeto.id]: {
                          ...(previous[projeto.id] || {}),
                          orcamento_total: event.target.value,
                        },
                      }))
                    }
                  />
                  <button type="button" onClick={() => handleBudgetUpdate(projeto.id)} disabled={!canEditBudget}>Salvar</button>
                </div>
              </div>
            ))}
          </div>

          {projectDetail && (
            <div className="project-detail-box">
              <h4>{projectDetail.nome}</h4>
              <p>{projectDetail.descricao}</p>
              <div className="mini-metrics">
                <span>Orçamento: {formatCurrency(projectDetail.orcamento_total)}</span>
                <span>Gasto: {formatCurrency(projectDetail.totalGasto || 0)}</span>
                <span>Pendentes: {projectDetail.pendentes || 0}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="panel table-panel">
        <div className="table-header">
          <h3>Lançamentos</h3>
          <span>{pendingCount} pendentes</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Projeto</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {lancamentos.map((item) => (
              <tr key={item.id}>
                <td>{item.projeto_nome}</td>
                <td>{item.descricao}</td>
                <td>{formatCurrency(item.valor)}</td>
                <td><span className={getStatusClass(item.status)}>{item.status}</span></td>
                <td className="action-buttons">
                  <button type="button" onClick={() => handleStatus(item.id, 'APROVADO')} disabled={!canApprove}>Aprovar</button>
                  <button type="button" onClick={() => handleStatus(item.id, 'REJEITADO')} disabled={!canApprove}>Rejeitar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );

  const renderProjects = () => (
    <section className="project-screen">
      <div className="panel">
        <div className="section-heading">
          <h3>{editingProjectId ? 'Editar projeto' : 'Novo projeto'}</h3>
          {editingProjectId && <button type="button" className="quiet-button" onClick={() => { setEditingProjectId(null); setProjectForm(initialProjectForm); }}>Cancelar edição</button>}
        </div>
        <form onSubmit={handleProjectSubmit} className="project-form">
          <input type="text" placeholder="Código" value={projectForm.codigo} onChange={(event) => setProjectForm({ ...projectForm, codigo: event.target.value })} />
          <input type="text" placeholder="Nome do projeto" value={projectForm.nome} onChange={(event) => setProjectForm({ ...projectForm, nome: event.target.value })} />
          <textarea placeholder="Descrição" value={projectForm.descricao} onChange={(event) => setProjectForm({ ...projectForm, descricao: event.target.value })} />
          <input type="number" step="0.01" placeholder="Orçamento total" value={projectForm.orcamento_total} onChange={(event) => setProjectForm({ ...projectForm, orcamento_total: event.target.value })} />
          <input type="number" step="0.01" placeholder="Reserva" value={projectForm.reserva_total} onChange={(event) => setProjectForm({ ...projectForm, reserva_total: event.target.value })} />
          <button type="submit">Salvar projeto</button>
        </form>
      </div>

      <div className="panel">
        <h3>Portfolio de projetos</h3>
        <div className="project-grid">
          {projetos.map((project) => (
            <div key={project.id} className="project-card">
              <div className="project-card-header">
                <div>
                  <strong>{project.nome}</strong>
                  <small>{project.codigo}</small>
                </div>
                <div className="project-card-actions">
                  <button type="button" onClick={() => setSelectedProjectId(project.id)}>Detalhes</button>
                  <button type="button" onClick={() => startEditProject(project)}>Editar</button>
                </div>
              </div>
              <p>{project.descricao || 'Projeto sem descrição cadastrada.'}</p>
              <div className="stat-row">
                <span>Orçamento</span>
                <strong>{formatCurrency(project.orcamento_total || 0)}</strong>
              </div>
              <div className="stat-row">
                <span>Reserva</span>
                <strong>{formatCurrency(project.reserva_total || 0)}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );

  const renderImport = () => (
    <section className="panel import-panel">
      <h3>Importação de planilha</h3>
      <p>Envie um CSV com as colunas: projeto, categoria, descricao, fornecedor, valor, status, data_lancamento, numero_nota, observacoes.</p>
      <label className="file-input">
        <input type="file" accept=".csv,text/csv" onChange={handleImport} />
      </label>
      {importStatus && <div className="import-status">{importStatus}</div>}
    </section>
  );

  const renderReports = () => (
    <section className="report-screen">
      <div className="report-grid">
        <div className="panel report-card">
          <h3>Resumo executivo</h3>
          <div className="stat-row"><span>Valor total</span><strong>{formatCurrency(executiveReport?.summary?.totalValor || 0)}</strong></div>
          <div className="stat-row"><span>Projetos</span><strong>{executiveReport?.summary?.totalProjetos || 0}</strong></div>
          <div className="stat-row"><span>Categorias</span><strong>{executiveReport?.summary?.totalCategorias || 0}</strong></div>
        </div>

        <div className="panel report-card">
          <h3>Status</h3>
          {Object.entries(executiveReport?.summary?.statusBreakdown || {}).map(([status, total]) => (
            <div key={status} className="stat-row">
              <span>{status}</span>
              <strong>{formatCurrency(total)}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="panel table-panel">
        <h3>Top projetos</h3>
        <table>
          <thead>
            <tr>
              <th>Projeto</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {(executiveReport?.summary?.topProjects || []).map((item) => (
              <tr key={item.nome}>
                <td>{item.nome}</td>
                <td>{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderTrendChart = () => {
    const trend = executiveReport?.tendencia || [];
    const maximum = Math.max(...trend.map((item) => Number(item.total || 0)), 1);

    return (
      <div className="trend-chart" aria-label="Gráfico de tendência mensal">
        {trend.map((item) => (
          <div className="trend-column" key={item.mes}>
            <span className="trend-value">{formatCurrency(item.total)}</span>
            <div className="trend-bar-track">
              <div className="trend-bar" style={{ height: `${Math.max((Number(item.total || 0) / maximum) * 100, 4)}%` }} />
            </div>
            <small>{item.mes}</small>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-box">
          <h1>Financeiro</h1>
        </div>
        <nav className="nav-menu">
          {[
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'projetos', label: 'Projetos' },
            { key: 'frota', label: 'Frota' },
            { key: 'import', label: 'Importação' },
            { key: 'relatorios', label: 'Relatórios' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className={activeView === item.key ? 'nav-button active' : 'nav-button'}
              onClick={() => setActiveView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {user && (
          <button type="button" className="logout-button" onClick={handleLogout}>Sair</button>
        )}
      </aside>

      <main className="content">
        {!user ? (
          <div className="auth-screen">
            <div className="auth-card">
              <h2>Gestão de Despesas por Projeto</h2>
              <p>Controle financeiro, aprovação e relatórios executivos.</p>
              <form onSubmit={handleLogin} className="login-form">
                <label htmlFor="login-email">E-mail</label>
                <input id="login-email" type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
                <label htmlFor="login-password">Senha</label>
                <input id="login-password" type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} />
                <button type="submit">Entrar</button>
              </form>
              {loginError && <div className="error-text">{loginError}</div>}
            </div>
          </div>
        ) : (
          <>
            <header className="topbar">
              <div>
                <h2>Gestão de Despesas por Projeto</h2>
              </div>
              <div className="topbar-actions">
                <span className="user-pill">{user.nome} · {user.perfil}</span>
                <button type="button" className="primary-button small-button" onClick={exportReport}>Exportar CSV</button>
              </div>
            </header>

            {activeView === 'dashboard' && renderDashboard()}
            {activeView === 'projetos' && renderProjects()}
            {activeView === 'frota' && renderFleet()}
            {activeView === 'import' && renderImport()}
            {activeView === 'relatorios' && renderReports()}
          </>
        )}
      </main>
    </div>
  );
}
