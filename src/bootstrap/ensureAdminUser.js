const bcrypt = require('bcryptjs');
const authRepository = require('../repositories/authRepository');

/**
 * If ADMIN_EMAIL and ADMIN_PASSWORD are set: ensure that user exists with is_admin,
 * or mark an existing account with that email as admin. Password is only set on create.
 */
async function ensureAdminUser() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const plain = process.env.ADMIN_PASSWORD;
  if (!email || plain == null || String(plain) === '') {
    if ((process.env.NODE_ENV || 'development') === 'development') {
      console.warn(
        '[admin] Set ADMIN_EMAIL and ADMIN_PASSWORD in .env to create or promote the moderation account.',
      );
    }
    return;
  }

  try {
    const existing = await authRepository.findUserByEmail(email);
    if (existing) {
      await authRepository.setUserIsAdmin(existing.id, true);
      console.log(`[admin] Account ${email} has admin access (report queue).`);
      return;
    }

    const passwordHash = await bcrypt.hash(String(plain), 10);
    let base = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'admin';
    if (base.length > 48) base = base.slice(0, 48);
    let candidate = base;
    for (let n = 0; n < 200; n++) {
      const taken = await authRepository.findUserIdByUsernameKey(candidate, 0);
      if (!taken) break;
      const suffix = String(n + 1);
      candidate = (base.slice(0, Math.max(1, 48 - suffix.length)) + suffix).slice(0, 48);
    }

    await authRepository.createUser({
      email,
      username: candidate,
      password: passwordHash,
      isAdmin: true,
    });
    console.log(`[admin] Created admin account ${email} (username: ${candidate}).`);
  } catch (e) {
    console.error('[admin] ensureAdminUser failed:', e?.message || e);
  }
}

module.exports = { ensureAdminUser };
