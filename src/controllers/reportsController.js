const reportsService = require('../services/reportsService');

async function reportPost(req, res, next) {
  try {
    const payload = await reportsService.reportPost(req.body ?? {}, req.user);
    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
}

async function reportUser(req, res, next) {
  try {
    const payload = await reportsService.reportUser(req.body ?? {}, req.user);
    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  reportPost,
  reportUser,
};
