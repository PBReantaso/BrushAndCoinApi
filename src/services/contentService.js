const authRepository = require('../repositories/authRepository');
const contentRepository = require('../repositories/contentRepository');
const followsRepository = require('../repositories/followsRepository');
const commissionsRepository = require('../repositories/commissionsRepository');
const notificationsService = require('./notificationsService');
const commissionsService = require('./commissionsService');

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

async function getCommissions(user) {
  return commissionsService.listCommissions(user);
}

async function createCommission(input, user) {
  const payload = await commissionsService.createCommission(input, user);
  return payload;
}

async function updateCommissionStatus(commissionId, status, user) {
  return commissionsService.updateCommissionStatus(commissionId, { status }, user);
}

async function getMessages(user) {
  const conversations = await contentRepository.listConversationsByUser(user?.id);
  const normalized = conversations.map((c) => {
    const hasUnread = Boolean(c.hasUnreadMessages);
    return { ...c, hasUnreadMessages: hasUnread, hasRead: !hasUnread };
  });
  return { conversations: normalized };
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

  const convo = await contentRepository.findConversationById(conversationId);
  const commId = convo?.commissionId != null ? Number(convo.commissionId) : null;
  if (Number.isFinite(commId) && commId > 0) {
    await commissionsRepository.markCommissionThreadViewed(commId, user.id);
  }

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

  const convoMeta = await contentRepository.findConversationById(conversationId);
  const linkedCommissionId =
    convoMeta?.commissionId != null ? Number(convoMeta.commissionId) : null;
  if (Number.isFinite(linkedCommissionId) && linkedCommissionId > 0) {
    const comm = await commissionsRepository.findCommissionById(linkedCommissionId);
    if (comm && String(comm.status) === 'completed') {
      const error = new Error('This commission is completed. Messaging is closed.');
      error.statusCode = 403;
      throw error;
    }
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

  if (Number.isFinite(linkedCommissionId) && linkedCommissionId > 0) {
    await commissionsRepository.applyCommissionThreadMessage(
      linkedCommissionId,
      content,
      user.id,
    );
  }

  return { message };
}

async function startConversation(input, user) {
  const otherUserId = Number(input?.otherUserId);
  if (!Number.isFinite(otherUserId) || otherUserId <= 0) {
    const error = new Error('Other user ID is required.');
    error.statusCode = 400;
    throw error;
  }

  const viewerId = Number(user?.id);
  const commissionIdRaw = input?.commissionId;
  const commissionId =
    commissionIdRaw != null && commissionIdRaw !== '' ? Number(commissionIdRaw) : null;

  if (Number.isFinite(commissionId) && commissionId > 0) {
    const comm = await commissionsRepository.findCommissionById(commissionId);
    if (!comm) {
      const error = new Error('Commission not found.');
      error.statusCode = 404;
      throw error;
    }
    if (Number(comm.patronId) !== viewerId && Number(comm.artistId) !== viewerId) {
      const error = new Error('Forbidden.');
      error.statusCode = 403;
      throw error;
    }
    const expectedOther = Number(comm.patronId) === viewerId ? Number(comm.artistId) : Number(comm.patronId);
    if (expectedOther !== otherUserId) {
      const error = new Error('Other user does not match this commission.');
      error.statusCode = 400;
      throw error;
    }
    let conv = await contentRepository.findConversationByCommissionId(commissionId);
    if (!conv) {
      await contentRepository.createCommissionConversation(
        Number(comm.patronId),
        Number(comm.artistId),
        commissionId,
      );
      conv = await contentRepository.findConversationByCommissionId(commissionId);
    }
    if (!conv?.id) {
      const error = new Error('Could not open commission chat.');
      error.statusCode = 500;
      throw error;
    }
    const shaped = await contentRepository.findConversationByIdForUser(conv.id, viewerId);
    return { conversation: shaped };
  }

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

  let conversation = await contentRepository.findConversationBetweenUsers(user?.id, otherUserId);
  if (!conversation) {
    conversation = await contentRepository.createConversation(user?.id, otherUserId);
  }

  const shaped = await contentRepository.findConversationByIdForUser(conversation.id, viewerId);
  return { conversation: shaped };
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

async function createMerchandiseItem(input, user) {
  const userId = Number(user?.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }
  const title = String(input?.title ?? '').trim();
  if (!title) {
    const error = new Error('Merchandise title is required.');
    error.statusCode = 400;
    throw error;
  }
  const imageUrl = input?.imageUrl == null ? null : String(input.imageUrl).trim();
  const description = String(input?.description ?? '').trim();
  const item = await contentRepository.createMerchandise({
    userId,
    title,
    description,
    imageUrl: imageUrl || null,
  });
  if (!item) {
    const error = new Error('Could not create merchandise.');
    error.statusCode = 400;
    throw error;
  }
  return { merchandise: item };
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

async function updatePost(postId, input, user) {
  const id = Number(postId);
  const userId = Number(user?.id);
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid post id.');
    error.statusCode = 400;
    throw error;
  }
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

  const description = String(input?.description ?? '');

  const post = await contentRepository.updatePostByOwner(id, userId, title, description);
  if (!post) {
    const error = new Error('Post not found.');
    error.statusCode = 404;
    throw error;
  }

  const mentionText = `${title}\n${description}`;
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
  getCommissions,
  createCommission,
  updateCommissionStatus,
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
  createMerchandiseItem,
  createPost,
  updatePost,
  likePost,
  unlikePost,
  commentOnPost,
  getPostComments,
};
