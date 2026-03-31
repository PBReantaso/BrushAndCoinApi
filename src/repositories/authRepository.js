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
    `SELECT id, email, username, password_hash AS password
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email],
  );
  return result.rows[0] || null;
}

async function createUser({ email, password, username }) {
  if (!isPostgresEnabled()) {
    const nextId = memoryStore.users.length + 1;
    const user = { id: nextId, email, username, password };
    memoryStore.users.push(user);
    return user;
  }

  const result = await query(
    'INSERT INTO users (email, username, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, username',
    [email, username, password, 'patron'],
  );
  return result.rows[0];
}

async function findUserById(id) {
  if (!isPostgresEnabled()) {
    return memoryStore.users.find((user) => user.id === id) || null;
  }

  const result = await query(
    `SELECT id, email, username, password_hash AS password
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id],
  );
  return result.rows[0] || null;
}

async function updateUserProfileById(id, { username }) {
  if (!isPostgresEnabled()) {
    const user = memoryStore.users.find((entry) => entry.id === id);
    if (!user) return null;
    user.username = username;
    return { id: user.id, email: user.email, username: user.username };
  }

  const result = await query(
    `UPDATE users
     SET username = $2
     WHERE id = $1
     RETURNING id, email, username`,
    [id, username],
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
  updateUserProfileById,
  deleteUserById,
};
