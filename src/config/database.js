const { Pool } = require('pg');
const { env } = require('./env');

let pool;

function isPostgresEnabled() {
  return Boolean(env.databaseUrl);
}

function getPool() {
  if (!isPostgresEnabled()) {
    throw new Error('DATABASE_URL is not configured.');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: env.databaseUrl,
      ssl:
        env.nodeEnv === 'production'
          ? {
              rejectUnauthorized: false,
            }
          : false,
    });
  }

  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function probeConnection() {
  if (!isPostgresEnabled()) {
    return true;
  }
  try {
    await query('SELECT 1');
    return true;
  } catch (_) {
    return false;
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

module.exports = {
  isPostgresEnabled,
  getPool,
  query,
  closePool,
  probeConnection,
};
