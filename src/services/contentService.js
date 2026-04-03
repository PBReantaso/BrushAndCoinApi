const authRepository = require('../repositories/authRepository');
const contentRepository = require('../repositories/contentRepository');
const followsRepository = require('../repositories/followsRepository');
const notificationsService = require('./notificationsService');

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

async function getMessages(user) {
  const conversations = await contentRepository.listConversationsByUser(user?.id);
  return { conversations };
}

async function getConversationMessages(conversationId, user) {
  if (!user?.id) {
    const error = new Error('User not authenticated.');
    error.statusCode = 401;
    throw error;
  }

  const isParticipant = await contentRepository.isUserInConversation(conversationId, user.id);
  if (!isParticipant) {
    const error = new Error('Forbidden: not participant in this conversation.');
    error.statusCode = 403;
    throw error;
  }

  const messages = await contentRepository.listMessages(conversationId);
  await contentRepository.upsertConversationRead(conversationId, user.id);
  return { messages };
}

async function getUnreadMessagesCount(user) {
  if (!user?.id) {
    const error = new Error('User not authenticated.');
    error.statusCode = 401;
    throw error;
  }
  const count = await contentRepository.unreadMessagesCountForUser(user.id);
  return { count };
}

async function sendMessage(conversationId, input, user) {
  if (!user?.id) {
    const error = new Error('User not authenticated.');
    error.statusCode = 401;
    throw error;
  }

  const isParticipant = await contentRepository.isUserInConversation(conversationId, user.id);
  if (!isParticipant) {
    const error = new Error('Forbidden: not participant in this conversation.');
    error.statusCode = 403;
    throw error;
  }

  const content = String(input?.content ?? '').trim();
  if (!content) {
    const error = new Error('Message content is required.');
    error.statusCode = 400;
    throw error;
  }

  const message = await contentRepository.createMessage({
    conversationId,
    senderId: user.id,
    content,
  });

  // Update conversation's last message
  await contentRepository.updateConversationLastMessage(conversationId, content);

  const recipientIds = await contentRepository.listConversationParticipantIdsExcluding(
    conversationId,
    user.id,
  );
  notificationsService.notifyNewMessage(recipientIds, user, content, {
    conversationId: Number(conversationId),
  });
  notificationsService.notifyMentionsInText(content, user, 'message', {
    conversationId: Number(conversationId),
  });

  return { message };
}

async function startConversation(input, user) {
  const otherUserId = input?.otherUserId;
  if (!otherUserId || typeof otherUserId !== 'number') {
    const error = new Error('Other user ID is required.');
    error.statusCode = 400;
    throw error;
  }

  const viewerId = Number(user?.id);
  if ((await authRepository.isUserPrivate(otherUserId)) && viewerId !== otherUserId) {
    const allowed = await followsRepository.isFollowing(viewerId, otherUserId);
    if (!allowed) {
      const error = new Error(
        'This account is private. Follow them to send a message.',
      );
      error.statusCode = 403;
      throw error;
    }
  }

  // Check if conversation already exists
  let conversation = await contentRepository.findConversationBetweenUsers(user?.id, otherUserId);
  if (!conversation) {
    // Create new conversation
    conversation = await contentRepository.createConversation(user?.id, otherUserId);
  }

  return { conversation };
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

  if (user?.id) {
    notificationsService.notifyFollowersNewEvent(user, created);
  }

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

  if (user?.id) {
    notificationsService.notifyFollowersEventUpdated(user, updated);
  }

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

async function getEventParticipants(eventId, user) {
  const id = Number(eventId);
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid event id.');
    error.statusCode = 400;
    throw error;
  }
  const event = await contentRepository.findEventById(id);
  if (!event) {
    const error = new Error('Event not found.');
    error.statusCode = 404;
    throw error;
  }
  const viewerId = Number(user?.id) || 0;
  const participants = await contentRepository.listEventParticipants(id);
  const joinedByMe = viewerId > 0 && participants.some((p) => Number(p.userId) === viewerId);
  return { participants, joinedByMe };
}

async function joinEvent(eventId, user) {
  const id = Number(eventId);
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid event id.');
    error.statusCode = 400;
    throw error;
  }
  const viewerId = Number(user?.id);
  if (!Number.isFinite(viewerId) || viewerId <= 0) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }
  const event = await contentRepository.findEventById(id);
  if (!event) {
    const error = new Error('Event not found.');
    error.statusCode = 404;
    throw error;
  }
  if (Number(event.createdBy) === viewerId) {
    const error = new Error('Organizers are already listed as participants.');
    error.statusCode = 400;
    throw error;
  }
  const already = await contentRepository.isUserEventParticipant(id, viewerId);
  if (already) {
    return { success: true, alreadyJoined: true };
  }
  await contentRepository.addEventParticipant(id, viewerId);
  return { success: true, alreadyJoined: false };
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

async function getTaggedPosts(rawTag, user) {
  const userId = Number(user?.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }
  const tag = String(rawTag ?? '').trim();
  if (!tag) {
    const error = new Error('Tag is required.');
    error.statusCode = 400;
    throw error;
  }
  const posts = await contentRepository.listPostsByTag(userId, tag);
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

  const mentionText = `${title}\n${String(input?.description ?? '')}`;
  notificationsService.notifyMentionsInText(mentionText, user, 'post', { postId: post.id });

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
  const inserted = await contentRepository.likePost(id, userId);
  if (inserted) {
    const ownerId = visible.userId;
    notificationsService.notifyPostLiked(ownerId, user, id);
  }
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
  notificationsService.notifyPostComment(visible.userId, user, id);
  notificationsService.notifyMentionsInText(comment, user, 'comment', { postId: id });
  return { success: true };
}

async function getPostComments(postId, user) {
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
  const comments = await contentRepository.listPostComments(id);
  return { comments };
}

module.exports = {
  getDashboard,
  getArtists,
  getProjects,
  getMessages,
  getConversationMessages,
  getUnreadMessagesCount,
  startConversation,
  sendMessage,
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventParticipants,
  joinEvent,
  getFeedPosts,
  getMyPosts,
  getTaggedPosts,
  createPost,
  likePost,
  unlikePost,
  commentOnPost,
  getPostComments,
};
