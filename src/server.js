const { app } = require('./app');
const { env } = require('./config/env');
const { isPostgresEnabled } = require('./config/database');

app.listen(env.port, () => {
  const storage = isPostgresEnabled() ? 'PostgreSQL' : 'in-memory fallback';
  console.log(`BrushAndCoin API running on http://localhost:${env.port} (${storage})`);
});
