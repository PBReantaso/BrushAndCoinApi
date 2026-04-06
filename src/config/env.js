const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: process.env.ENV_FILE || path.resolve(process.cwd(), '.env'),
});

if (
  (process.env.NODE_ENV || 'development') === 'development' &&
  !String(process.env.ADMIN_EMAIL || '').trim()
) {
  console.warn(
    '[env] ADMIN_EMAIL (and ADMIN_PASSWORD) are not set. No moderation account will be bootstrapped — set them in .env to enable the report queue admin user.',
  );
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
};

module.exports = { env };
