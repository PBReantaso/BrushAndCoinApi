const tokenService = require('../services/tokenService');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const payload = tokenService.verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      isAdmin: Boolean(payload.isAdmin),
    };
    return next();
  } catch (_) {
    return res.status(401).json({ message: 'Invalid or expired access token.' });
  }
}

module.exports = { requireAuth };
