const express = require('express');
const usersController = require('../controllers/usersController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/search', requireAuth, usersController.search);
router.post('/:id/follow', requireAuth, usersController.follow);
router.delete('/:id/follow', requireAuth, usersController.unfollow);
router.get('/:id/posts', requireAuth, usersController.getPosts);
router.get('/:id', requireAuth, usersController.getProfile);

module.exports = { usersRoutes: router };
