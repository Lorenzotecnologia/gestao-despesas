const ROLE_PERMISSIONS = {
  ADMIN: {
    approve: true,
    editBudget: true,
    createExpense: true,
  },
  APROVADOR: {
    approve: true,
    editBudget: false,
    createExpense: true,
  },
  LANCADOR: {
    approve: false,
    editBudget: false,
    createExpense: true,
  },
};

function normalizeProfile(profile = 'LANCADOR') {
  return String(profile).trim().toUpperCase();
}

function canApproveStatus(profile, status) {
  const normalizedProfile = normalizeProfile(profile);
  if (!['APROVADO', 'REJEITADO'].includes(String(status || '').toUpperCase())) {
    return false;
  }

  return Boolean(ROLE_PERMISSIONS[normalizedProfile]?.approve);
}

function canEditBudget(profile) {
  return Boolean(ROLE_PERMISSIONS[normalizeProfile(profile)]?.editBudget);
}

function getUserDisplayName(user) {
  const nome = user?.nome || 'Usuário';
  const perfil = normalizeProfile(user?.perfil || 'LANCADOR');
  return `${nome} (${perfil})`;
}

module.exports = {
  ROLE_PERMISSIONS,
  normalizeProfile,
  canApproveStatus,
  canEditBudget,
  getUserDisplayName,
};
