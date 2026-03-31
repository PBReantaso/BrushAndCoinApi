const contentRepository = require('../repositories/contentRepository');

async function getDashboard() {
  const projects = await contentRepository.listProjects();
  return { projects };
}

async function getArtists() {
  const artists = await contentRepository.listArtists();
  return { artists };
}

async function getProjects() {
  const projects = await contentRepository.listProjects();
  return { projects };
}

async function getMessages() {
  const conversations = await contentRepository.listConversations();
  return { conversations };
}

async function getEvents() {
  const events = await contentRepository.listEvents();
  return { events };
}

async function createEvent(input, user) {
  const title = String(input?.title ?? '').trim();
  if (!title) {
    const error = new Error('Event title is required.');
    error.statusCode = 400;
    throw error;
  }

  const eventDate = String(input?.eventDate ?? '').trim();
  const eventTime = String(input?.eventTime ?? '').trim();
  if (!eventDate || !eventTime) {
    const error = new Error('Event date and time are required.');
    error.statusCode = 400;
    throw error;
  }

  const created = await contentRepository.createEvent({
    title,
    category: String(input?.category ?? 'Art'),
    eventDate,
    eventTime,
    venue: String(input?.venue ?? ''),
    locationText: String(input?.locationText ?? ''),
    latitude: input?.latitude == null ? null : Number(input.latitude),
    longitude: input?.longitude == null ? null : Number(input.longitude),
    description: String(input?.description ?? ''),
    additionalInfo: String(input?.additionalInfo ?? ''),
    imageUrl: input?.imageUrl == null ? null : String(input.imageUrl),
    schedules: Array.isArray(input?.schedules) ? input.schedules : [],
    createdBy: user?.id ?? null,
  });

  return { event: created };
}

async function updateEvent(eventId, input, user) {
  const id = Number(eventId);
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid event id.');
    error.statusCode = 400;
    throw error;
  }

  const existing = await contentRepository.findEventById(id);
  if (!existing) {
    const error = new Error('Event not found.');
    error.statusCode = 404;
    throw error;
  }
  if (!user?.id || Number(existing.createdBy) !== Number(user.id)) {
    const error = new Error('You can only edit your own events.');
    error.statusCode = 403;
    throw error;
  }

  const title = String(input?.title ?? '').trim();
  if (!title) {
    const error = new Error('Event title is required.');
    error.statusCode = 400;
    throw error;
  }

  const updated = await contentRepository.updateEventById(id, {
    title,
    category: String(input?.category ?? existing.category ?? 'Art'),
    eventDate: String(input?.eventDate ?? existing.eventDate ?? ''),
    eventTime: String(input?.eventTime ?? existing.eventTime ?? ''),
    venue: String(input?.venue ?? existing.venue ?? ''),
    locationText: String(input?.locationText ?? existing.locationText ?? ''),
    latitude:
      input?.latitude == null ? existing.latitude ?? null : Number(input.latitude),
    longitude:
      input?.longitude == null ? existing.longitude ?? null : Number(input.longitude),
    description: String(input?.description ?? existing.description ?? ''),
    additionalInfo: String(input?.additionalInfo ?? existing.additionalInfo ?? ''),
    imageUrl: input?.imageUrl == null ? existing.imageUrl ?? null : String(input.imageUrl),
    schedules: Array.isArray(input?.schedules) ? input.schedules : existing.schedules ?? [],
  });

  return { event: updated };
}

async function deleteEvent(eventId, user) {
  const id = Number(eventId);
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid event id.');
    error.statusCode = 400;
    throw error;
  }

  const existing = await contentRepository.findEventById(id);
  if (!existing) {
    const error = new Error('Event not found.');
    error.statusCode = 404;
    throw error;
  }
  if (!user?.id || Number(existing.createdBy) !== Number(user.id)) {
    const error = new Error('You can only delete your own events.');
    error.statusCode = 403;
    throw error;
  }

  await contentRepository.deleteEventById(id);
  return { success: true };
}

async function getFeedPosts(user) {
  const userId = Number(user?.id);
  const posts = await contentRepository.listFeedPosts(userId);
  return { posts };
}

async function getMyPosts(user) {
  const userId = Number(user?.id);
  const posts = await contentRepository.listMyPosts(userId);
  return { posts };
}

async function createPost(input, user) {
  const userId = Number(user?.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }

  const title = String(input?.title ?? '').trim();
  if (!title) {
    const error = new Error('Post title is required.');
    error.statusCode = 400;
    throw error;
  }

  const post = await contentRepository.createPost({
    userId,
    title,
    description: String(input?.description ?? ''),
    category: String(input?.category ?? ''),
    price: Number(input?.price ?? 0),
    isCommissionAvailable: Boolean(input?.isCommissionAvailable ?? false),
    tags: Array.isArray(input?.tags) ? input.tags : [],
    imageUrl: input?.imageUrl == null ? null : String(input.imageUrl),
  });

  return { post };
}

async function likePost(postId, user) {
  const id = Number(postId);
  const userId = Number(user?.id);
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid post id.');
    error.statusCode = 400;
    throw error;
  }
  const visible = await contentRepository.findPostVisibleToUser(id, userId);
  if (!visible) {
    const error = new Error('Post not found.');
    error.statusCode = 404;
    throw error;
  }
  await contentRepository.likePost(id, userId);
  return { success: true };
}

async function unlikePost(postId, user) {
  const id = Number(postId);
  const userId = Number(user?.id);
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid post id.');
    error.statusCode = 400;
    throw error;
  }
  const visible = await contentRepository.findPostVisibleToUser(id, userId);
  if (!visible) {
    const error = new Error('Post not found.');
    error.statusCode = 404;
    throw error;
  }
  await contentRepository.unlikePost(id, userId);
  return { success: true };
}

async function commentOnPost(postId, input, user) {
  const id = Number(postId);
  const userId = Number(user?.id);
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid post id.');
    error.statusCode = 400;
    throw error;
  }
  const comment = String(input?.comment ?? '').trim();
  if (!comment) {
    const error = new Error('Comment is required.');
    error.statusCode = 400;
    throw error;
  }
  const visible = await contentRepository.findPostVisibleToUser(id, userId);
  if (!visible) {
    const error = new Error('Post not found.');
    error.statusCode = 404;
    throw error;
  }
  await contentRepository.addPostComment(id, userId, comment);
  return { success: true };
}

module.exports = {
  getDashboard,
  getArtists,
  getProjects,
  getMessages,
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getFeedPosts,
  getMyPosts,
  createPost,
  likePost,
  unlikePost,
  commentOnPost,
};
