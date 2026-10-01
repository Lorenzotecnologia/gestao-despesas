const bcrypt = require('bcryptjs');

async function hashPassword(password) {
  return bcrypt.hash(password || '', 10);
}

async function verifyPassword(password, storedHash) {
  if (!password || !storedHash) {
    return false;
  }

  return bcrypt.compare(password, storedHash);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
