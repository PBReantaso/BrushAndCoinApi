const express = require('express');
const contentController = require('../controllers/contentController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/dashboard', requireAuth, contentController.dashboard);
router.get('/artists', requireAuth, contentController.artists);
router.get('/projects', requireAuth, contentController.projects);
router.get('/commissions', requireAuth, contentController.commissions);
router.post('/commissions', requireAuth, contentController.createCommission);
router.put('/commissions/:id/status', requireAuth, contentController.updateCommissionStatus);
router.get('/messages', requireAuth, contentController.messages);
router.get('/messages/unread-count', requireAuth, contentController.unreadMessagesCount);
router.get('/messages/:id', requireAuth, contentController.getConversationMessages);
router.post('/messages/:id', requireAuth, contentController.sendMessage);
router.post('/conversations/start', requireAuth, contentController.startConversation);
router.get('/events', requireAuth, contentController.events);
router.post('/events', requireAuth, contentController.createEvent);
router.get('/events/:id/participants', requireAuth, contentController.eventParticipants);
router.post('/events/:id/join', requireAuth, contentController.joinEvent);
router.put('/events/:id', requireAuth, contentController.updateEvent);
router.delete('/events/:id', requireAuth, contentController.deleteEvent);
router.get('/posts/feed', requireAuth, contentController.feedPosts);
router.get('/posts/mine', requireAuth, contentController.myPosts);
router.get('/posts/tagged', requireAuth, contentController.taggedPosts);
router.post('/posts', requireAuth, contentController.createPost);
router.post('/posts/:id/likes', requireAuth, contentController.likePost);
router.delete('/posts/:id/likes', requireAuth, contentController.unlikePost);
router.post('/posts/:id/comments', requireAuth, contentController.commentOnPost);
router.get('/posts/:id/comments', requireAuth, contentController.postComments);

module.exports = { contentRoutes: router };
