const express = require('express');
const discoveryController = require('../controllers/discoveryController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/discover/posts', requireAuth, discoveryController.searchPosts);
router.get('/discover/recommendations', requireAuth, discoveryController.recommendations);
router.get('/discover/saved-searches', requireAuth, discoveryController.mySavedSearches);
router.post('/discover/saved-searches', requireAuth, discoveryController.saveMySearch);
router.delete('/discover/saved-searches/:id', requireAuth, discoveryController.deleteMySavedSearch);

module.exports = { discoveryRoutes: router };

