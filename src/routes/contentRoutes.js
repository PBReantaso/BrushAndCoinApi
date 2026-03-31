const express = require('express');
const contentController = require('../controllers/contentController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/dashboard', requireAuth, contentController.dashboard);
router.get('/artists', requireAuth, contentController.artists);
router.get('/projects', requireAuth, contentController.projects);
router.get('/messages', requireAuth, contentController.messages);
router.get('/events', requireAuth, contentController.events);
router.post('/events', requireAuth, contentController.createEvent);
router.put('/events/:id', requireAuth, contentController.updateEvent);
router.delete('/events/:id', requireAuth, contentController.deleteEvent);
router.get('/posts/feed', requireAuth, contentController.feedPosts);
router.get('/posts/mine', requireAuth, contentController.myPosts);
router.post('/posts', requireAuth, contentController.createPost);
router.post('/posts/:id/likes', requireAuth, contentController.likePost);
router.delete('/posts/:id/likes', requireAuth, contentController.unlikePost);
router.post('/posts/:id/comments', requireAuth, contentController.commentOnPost);

module.exports = { contentRoutes: router };
