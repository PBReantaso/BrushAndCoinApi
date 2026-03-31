const { isPostgresEnabled, query } = require('../config/database');
const { memoryStore } = require('../data/memoryStore');

async function findUserByEmail(email) {
  if (!isPostgresEnabled()) {
    return (
      memoryStore.users.find(
        (user) => user.email.toLowerCase() === String(email).toLowerCase(),
      ) || null
    );
  }

  const result = await query(
    'SELECT id, email, password_hash AS password FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
    [email],
  );
  return result.rows[0] || null;
}

async function createUser({ email, password }) {
  if (!isPostgresEnabled()) {
    const nextId = memoryStore.users.length + 1;
    const user = { id: nextId, email, password };
    memoryStore.users.push(user);
    return user;
  }

  const result = await query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email',
    [email, password, 'patron'],
  );
  return result.rows[0];
}

async function findUserById(id) {
  if (!isPostgresEnabled()) {
    return memoryStore.users.find((user) => user.id === id) || null;
  }

  const result = await query(
    'SELECT id, email, password_hash AS password FROM users WHERE id = $1 LIMIT 1',
    [id],
  );
  return result.rows[0] || null;
}

async function deleteUserById(id) {
  if (!isPostgresEnabled()) {
    const index = memoryStore.users.findIndex((user) => user.id === id);
    if (index !== -1) {
      memoryStore.users.splice(index, 1);
    }
    return;
  }

  await query('DELETE FROM users WHERE id = $1', [id]);
}

module.exports = {
  findUserByEmail,
  createUser,
  findUserById,
  deleteUserById,
};
