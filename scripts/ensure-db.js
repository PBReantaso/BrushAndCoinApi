require('dotenv').config();
const { Client } = require('pg');

function buildAdminConnectionString(databaseUrl) {
  const url = new URL(databaseUrl);
  const dbName = (url.pathname || '/').replace(/^\//, '') || 'brushandcoin';
  const adminUrl = `${url.protocol}//${url.username}:${url.password}@${url.hostname}:${url.port || 5432}/postgres`;
  return { dbName, adminUrl };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing.');
  }

  const { dbName, adminUrl } = buildAdminConnectionString(databaseUrl);
  const client = new Client({
    connectionString: adminUrl,
    ssl: false,
  });

  await client.connect();
  try {
    const check = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (check.rowCount > 0) {
      console.log(`DB_ALREADY_EXISTS ${dbName}`);
      return;
    }

    const safeName = dbName.replace(/"/g, '');
    await client.query(`CREATE DATABASE "${safeName}"`);
    console.log(`DB_CREATED ${dbName}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`DB_CREATE_ERR ${error.message}`);
  process.exit(1);
});
