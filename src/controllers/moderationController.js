const moderationService = require('../services/moderationService');

async function myEnforcementHistory(req, res, next) {
  try {
    const payload = await moderationService.listMyEnforcementHistory(req.user, req.query ?? {});
    res.json(payload);
  } catch (e) {
    next(e);
  }
}

async function myAppeals(req, res, next) {
  try {
    const payload = await moderationService.listMyAppeals(req.user, req.query ?? {});
    res.json(payload);
  } catch (e) {
    next(e);
  }
}

async function submitMyAppeal(req, res, next) {
  try {
    const payload = await moderationService.submitMyAppeal(req.user, req.body ?? {});
    res.status(201).json(payload);
  } catch (e) {
    next(e);
  }
}

async function adminActions(req, res, next) {
  try {
    const payload = await moderationService.listAdminModerationActions(req.query ?? {});
    res.json(payload);
  } catch (e) {
    next(e);
  }
}

async function adminAppeals(req, res, next) {
  try {
    const merged = { ...(req.query ?? {}), ...(req.body ?? {}) };
    const payload = await moderationService.listAdminAppeals(merged);
    res.json(payload);
  } catch (e) {
    next(e);
  }
}

async function resolveAdminAppeal(req, res, next) {
  try {
    const payload = await moderationService.resolveAdminAppeal(
      req.params.id,
      req.body ?? {},
      req.user,
    );
    res.json(payload);
  } catch (e) {
    next(e);
  }
}

module.exports = {
  myEnforcementHistory,
  myAppeals,
  submitMyAppeal,
  adminActions,
  adminAppeals,
  resolveAdminAppeal,
};

