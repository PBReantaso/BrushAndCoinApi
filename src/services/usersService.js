const authRepository = require('../repositories/authRepository');
const contentRepository = require('../repositories/contentRepository');
const followsRepository = require('../repositories/followsRepository');
const notificationsService = require('./notificationsService');

async function searchUsers(rawQuery, currentUser) {
  const excludeUserId = Number(currentUser?.id) || 0;
  const users = await authRepository.searchUsersByQuery(rawQuery, {
    excludeUserId,
    limit: 24,
  });
  return { users };
}

async function getPublicProfile(userId, viewer) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid user id.');
    error.statusCode = 400;
    throw error;
  }
  const user = await authRepository.findPublicUserById(id);
  if (!user) {
    const error = new Error('User not found.');
    error.statusCode = 404;
    throw error;
  }

  const viewerId = Number(viewer?.id) || 0;
  const [followerCount, followingCount] = await Promise.all([
    followsRepository.followerCount(id),
    followsRepository.followingCount(id),
  ]);

  let isFollowing = false;
  if (viewerId > 0 && viewerId !== id) {
    isFollowing = await followsRepository.isFollowing(viewerId, id);
  }

  const isPrivate = Boolean(user.isPrivate);
  const isLocked = isPrivate && viewerId !== id && !isFollowing;

  return {
    user: {
      ...user,
      followerCount,
      followingCount,
      isFollowing,
      isLocked,
    },
  };
}

async function followUser(targetUserId, viewer) {
  const id = Number(targetUserId);
  const viewerId = Number(viewer?.id) || 0;
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid user id.');
    error.statusCode = 400;
    throw error;
  }
  if (!viewerId) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }
  if (viewerId === id) {
    const error = new Error('You cannot follow yourself.');
    error.statusCode = 400;
    throw error;
  }
  const exists = await authRepository.findPublicUserById(id);
  if (!exists) {
    const error = new Error('User not found.');
    error.statusCode = 404;
    throw error;
  }
  const didInsert = await followsRepository.follow(viewerId, id);
  if (didInsert) {
    notificationsService.notifyNewFollower(id, viewer);
  }
  const [followerCount, followingCount] = await Promise.all([
    followsRepository.followerCount(id),
    followsRepository.followingCount(id),
  ]);
  return { followerCount, followingCount, isFollowing: true };
}

async function unfollowUser(targetUserId, viewer) {
  const id = Number(targetUserId);
  const viewerId = Number(viewer?.id) || 0;
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid user id.');
    error.statusCode = 400;
    throw error;
  }
  if (!viewerId) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }
  await followsRepository.unfollow(viewerId, id);
  const [followerCount, followingCount] = await Promise.all([
    followsRepository.followerCount(id),
    followsRepository.followingCount(id),
  ]);
  return { followerCount, followingCount, isFollowing: false };
}

async function getFollowersList(profileUserId, viewer) {
  const id = Number(profileUserId);
  const viewerId = Number(viewer?.id) || 0;
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid user id.');
    error.statusCode = 400;
    throw error;
  }
  const exists = await authRepository.findPublicUserById(id);
  if (!exists) {
    const error = new Error('User not found.');
    error.statusCode = 404;
    throw error;
  }
  if (
    id !== viewerId
    && (await authRepository.isUserPrivate(id))
    && !(await followsRepository.isFollowing(viewerId, id))
  ) {
    const error = new Error('This list is only visible to followers.');
    error.statusCode = 403;
    throw error;
  }
  const users = await followsRepository.listFollowers(id);
  return { users };
}

async function getFollowingList(profileUserId, viewer) {
  const id = Number(profileUserId);
  const viewerId = Number(viewer?.id) || 0;
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid user id.');
    error.statusCode = 400;
    throw error;
  }
  const exists = await authRepository.findPublicUserById(id);
  if (!exists) {
    const error = new Error('User not found.');
    error.statusCode = 404;
    throw error;
  }
  if (
    id !== viewerId
    && (await authRepository.isUserPrivate(id))
    && !(await followsRepository.isFollowing(viewerId, id))
  ) {
    const error = new Error('This list is only visible to followers.');
    error.statusCode = 403;
    throw error;
  }
  const users = await followsRepository.listFollowing(id);
  return { users };
}

async function getUserPosts(profileUserId, viewer) {
  const id = Number(profileUserId);
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid user id.');
    error.statusCode = 400;
    throw error;
  }
  const exists = await authRepository.findPublicUserById(id);
  if (!exists) {
    const error = new Error('User not found.');
    error.statusCode = 404;
    throw error;
  }
  const viewerId = Number(viewer?.id) || 0;
  const posts = await contentRepository.listPostsForProfile(id, viewerId);
  return { posts };
}

module.exports = {
  searchUsers,
  getPublicProfile,
  getUserPosts,
  followUser,
  unfollowUser,
  getFollowersList,
  getFollowingList,
};
