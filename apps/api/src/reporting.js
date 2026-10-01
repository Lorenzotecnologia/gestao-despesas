function parseCsvLine(line = '') {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsvImportRows(csvText = '') {
  if (!csvText || typeof csvText !== 'string') {
    return [];
  }

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, '_'));
  const rows = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const values = parseCsvLine(lines[lineIndex]);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });

    if (!Object.values(row).some((value) => String(value).trim() !== '')) {
      continue;
    }

    rows.push(row);
  }

  return rows;
}

function buildExecutiveSummary(rows = []) {
  const totals = rows.reduce(
    (acc, row) => {
      const valor = Number(row.valor ?? 0);
      const status = String(row.status || 'PENDENTE').toUpperCase();
      const projeto = String(row.projeto || 'Sem projeto').trim() || 'Sem projeto';
      const categoria = String(row.categoria || 'Outros').trim() || 'Outros';

      acc.totalValor += valor;
      acc.statusBreakdown[status] = (acc.statusBreakdown[status] || 0) + valor;
      acc.projects[projeto] = (acc.projects[projeto] || 0) + valor;
      acc.categories[categoria] = (acc.categories[categoria] || 0) + valor;
      return acc;
    },
    { totalValor: 0, statusBreakdown: {}, projects: {}, categories: {} }
  );

  const topProjects = Object.entries(totals.projects)
    .map(([nome, total]) => ({ nome, total }))
    .sort((left, right) => right.total - left.total)
    .slice(0, 5);

  const categoryBreakdown = Object.entries(totals.categories)
    .map(([nome, total]) => ({ nome, total }))
    .sort((left, right) => right.total - left.total);

  const uniqueProjects = new Set(rows.map((row) => String(row.projeto || 'Sem projeto').trim() || 'Sem projeto'));

  return {
    totalValor: Number(totals.totalValor || 0),
    totalProjetos: uniqueProjects.size,
    totalCategorias: categoryBreakdown.length,
    statusBreakdown: totals.statusBreakdown,
    topProjects,
    categoryBreakdown,
  };
}

module.exports = {
  parseCsvImportRows,
  buildExecutiveSummary,
};
