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
    const payload = authService.me(req.user);
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
};
