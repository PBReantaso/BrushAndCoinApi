const contentService = require('../services/contentService');

async function dashboard(req, res, next) {
  try {
    const payload = await contentService.getDashboard();
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function artists(req, res, next) {
  try {
    const payload = await contentService.getArtists();
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function projects(req, res, next) {
  try {
    const payload = await contentService.getProjects();
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function messages(req, res, next) {
  try {
    const payload = await contentService.getMessages();
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  dashboard,
  artists,
  projects,
  messages,
};
