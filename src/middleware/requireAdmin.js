const authRepository = require('../repositories/authRepository');

/**
 * After [requireAuth]. Verifies the user is marked admin in the database (not only JWT),
 * so promotion/revocation works without forcing a new login.
 */
async function requireAdmin(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const dbUser = await authRepository.findUserById(Number(req.user.id));
    if (!dbUser || !dbUser.isAdmin) {
      return res.status(403).json({ message: 'Admin access required.' });
    }
    req.user.isAdmin = true;
    return next();
  } catch (e) {
    return next(e);
  }
}

module.exports = { requireAdmin };
