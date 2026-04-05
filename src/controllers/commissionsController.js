const commissionsService = require('../services/commissionsService');

async function listCommissions(req, res, next) {
  try {
    const payload = await commissionsService.listCommissions(req.user);
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
}

async function getCommission(req, res, next) {
  try {
    const payload = await commissionsService.getCommission(req.params.id, req.user);
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
}

async function markCommissionViewed(req, res, next) {
  try {
    const payload = await commissionsService.markCommissionViewed(req.params.id, req.user);
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
}

async function createCommission(req, res, next) {
  try {
    const payload = await commissionsService.createCommission(req.body ?? {}, req.user);
    return res.status(201).json(payload);
  } catch (err) {
    return next(err);
  }
}

async function updateCommissionStatus(req, res, next) {
  try {
    const payload = await commissionsService.updateCommissionStatus(
      req.params.id,
      req.body ?? {},
      req.user,
    );
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listCommissions,
  getCommission,
  markCommissionViewed,
  createCommission,
  updateCommissionStatus,
};
