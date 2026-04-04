const { app } = require('./app');
const { env } = require('./config/env');
const { isPostgresEnabled, probeConnection } = require('./config/database');

async function startServer() {
  if (isPostgresEnabled()) {
    const ok = await probeConnection();
    if (!ok) {
      // Allow local development to continue without a configured database.
      env.databaseUrl = '';
      console.warn('PostgreSQL connection failed. Falling back to in-memory storage.');
    }
  }

  app.listen(env.port, '0.0.0.0', () => {
    const storage = isPostgresEnabled() ? 'PostgreSQL' : 'in-memory fallback';
    console.log(`BrushAndCoin API running on http://0.0.0.0:${env.port} (${storage})`);
  });
}

startServer();
