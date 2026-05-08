const discoveryService = require('../services/discoveryService');

async function searchPosts(req, res) {
  try {
    const result = await discoveryService.searchPosts(req.query, req.user);
    res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message || 'Failed to search posts.' });
  }
}

async function recommendations(req, res) {
  try {
    const result = await discoveryService.recommendations(req.query, req.user);
    res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message || 'Failed to load recommendations.' });
  }
}

async function mySavedSearches(req, res) {
  try {
    const result = await discoveryService.listMySavedSearches(req.query, req.user);
    res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message || 'Failed to load saved searches.' });
  }
}

async function saveMySearch(req, res) {
  try {
    const result = await discoveryService.saveMySearch(req.body, req.user);
    res.status(201).json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message || 'Failed to save search.' });
  }
}

async function deleteMySavedSearch(req, res) {
  try {
    const result = await discoveryService.deleteMySavedSearch(req.params.id, req.user);
    res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message || 'Failed to delete saved search.' });
  }
}

module.exports = {
  searchPosts,
  recommendations,
  mySavedSearches,
  saveMySearch,
  deleteMySavedSearch,
};

