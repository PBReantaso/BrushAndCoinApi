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

async function createPost(req, res, next) {
  try {
    const payload = await contentService.createPost(req.body ?? {}, req.user);
    res.status(201).json(payload);
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

module.exports = {
  dashboard,
  artists,
  projects,
  messages,
  events,
  createEvent,
  updateEvent,
  deleteEvent,
  feedPosts,
  myPosts,
  createPost,
  likePost,
  unlikePost,
  commentOnPost,
};
