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

async function commissions(req, res, next) {
  try {
    const payload = await contentService.getCommissions(req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function createCommission(req, res, next) {
  try {
    const payload = await contentService.createCommission(req.body ?? {}, req.user);
    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
}

async function updateCommissionStatus(req, res, next) {
  try {
    const commissionId = Number(req.params.id);
    const status = String(req.body?.status ?? '').trim();
    const payload = await contentService.updateCommissionStatus(commissionId, status, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function messages(req, res, next) {
  try {
    const payload = await contentService.getMessages(req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function unreadMessagesCount(req, res, next) {
  try {
    const payload = await contentService.getUnreadMessagesCount(req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function getConversationMessages(req, res, next) {
  try {
    const conversationId = Number(req.params.id);
    const payload = await contentService.getConversationMessages(conversationId, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function sendMessage(req, res, next) {
  try {
    const conversationId = Number(req.params.id);
    const payload = await contentService.sendMessage(conversationId, req.body ?? {}, req.user);
    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
}

async function startConversation(req, res, next) {
  try {
    const payload = await contentService.startConversation(req.body ?? {}, req.user);
    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
}

async function events(req, res, next) {
  try {
    const payload = await contentService.getEvents();
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function createEvent(req, res, next) {
  try {
    const payload = await contentService.createEvent(req.body ?? {}, req.user);
    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
}

async function updateEvent(req, res, next) {
  try {
    const payload = await contentService.updateEvent(
      req.params.id,
      req.body ?? {},
      req.user,
    );
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function deleteEvent(req, res, next) {
  try {
    const payload = await contentService.deleteEvent(req.params.id, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function eventParticipants(req, res, next) {
  try {
    const payload = await contentService.getEventParticipants(req.params.id, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function joinEvent(req, res, next) {
  try {
    const payload = await contentService.joinEvent(req.params.id, req.user);
    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
}

async function feedPosts(req, res, next) {
  try {
    const payload = await contentService.getFeedPosts(req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function myPosts(req, res, next) {
  try {
    const payload = await contentService.getMyPosts(req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function taggedPosts(req, res, next) {
  try {
    const payload = await contentService.getTaggedPosts(req.query.tag, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function createMerchandise(req, res, next) {
  try {
    const payload = await contentService.createMerchandiseItem(req.body ?? {}, req.user);
    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
}

async function createPost(req, res, next) {
  try {
    const payload = await contentService.createPost(req.body ?? {}, req.user);
    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
}

async function updatePost(req, res, next) {
  try {
    const payload = await contentService.updatePost(req.params.id, req.body ?? {}, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function deletePost(req, res, next) {
  try {
    const payload = await contentService.deletePost(req.params.id, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function likePost(req, res, next) {
  try {
    const payload = await contentService.likePost(req.params.id, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function unlikePost(req, res, next) {
  try {
    const payload = await contentService.unlikePost(req.params.id, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function commentOnPost(req, res, next) {
  try {
    const payload = await contentService.commentOnPost(req.params.id, req.body ?? {}, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function postComments(req, res, next) {
  try {
    const payload = await contentService.getPostComments(req.params.id, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  dashboard,
  artists,
  projects,
  commissions,
  createCommission,
  updateCommissionStatus,
  messages,
  unreadMessagesCount,
  getConversationMessages,
  sendMessage,
  startConversation,
  events,
  createEvent,
  updateEvent,
  deleteEvent,
  eventParticipants,
  joinEvent,
  feedPosts,
  myPosts,
  taggedPosts,
  createMerchandise,
  createPost,
  updatePost,
  deletePost,
  likePost,
  unlikePost,
  commentOnPost,
  postComments,
};
