const authService = require('../services/authService');

async function signup(req, res, next) {
  try {
    const payload = await authService.signup(req.body ?? {});
    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const payload = await authService.login(req.body ?? {});
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function refresh(req, res, next) {
  try {
    const payload = await authService.refresh(req.body ?? {});
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function me(req, res, next) {
  try {
    const payload = await authService.me(req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function deleteAccount(req, res, next) {
  try {
    const userId = req.user?.id;
    const { password } = req.body ?? {};
    const payload = await authService.deleteAccount({ userId, password });
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    const userId = req.user?.id;
    const body = req.body ?? {};
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
    const payload = await authService.updateProfile({
      userId,
      username: body.username,
      isPrivate: typeof body.isPrivate === 'boolean' ? body.isPrivate : undefined,
      firstName: has('firstName') ? body.firstName : undefined,
      lastName: has('lastName') ? body.lastName : undefined,
      avatarUrl: has('avatarUrl') ? body.avatarUrl : undefined,
      socialLinks: has('socialLinks') ? body.socialLinks : undefined,
      tipsEnabled: typeof body.tipsEnabled === 'boolean' ? body.tipsEnabled : undefined,
      tipsUrl: has('tipsUrl') ? body.tipsUrl : undefined,
    });
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  signup,
  login,
  refresh,
  me,
  updateProfile,
  deleteAccount,
};
