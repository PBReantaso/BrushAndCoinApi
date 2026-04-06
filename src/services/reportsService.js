const authRepository = require('../repositories/authRepository');
const contentRepository = require('../repositories/contentRepository');
const reportsRepository = require('../repositories/reportsRepository');

async function reportPost(input, user) {
  const userId = Number(user?.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }

  const postId = Number(input?.postId);
  if (!Number.isFinite(postId) || postId <= 0) {
    const error = new Error('Invalid post id.');
    error.statusCode = 400;
    throw error;
  }

  const post = await contentRepository.findPostVisibleToUser(postId, userId);
  if (!post) {
    const error = new Error('Post not found.');
    error.statusCode = 404;
    throw error;
  }
  if (Number(post.userId) === userId) {
    const error = new Error('You cannot report your own post.');
    error.statusCode = 400;
    throw error;
  }

  const reason = input?.reason == null ? null : String(input.reason);
  const { alreadyReported } = await reportsRepository.addReport({
    reporterId: userId,
    targetKind: 'post',
    targetId: postId,
    reason,
  });
  return { success: true, alreadyReported };
}

async function reportUser(input, user) {
  const userId = Number(user?.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }

  const targetUserId = Number(input?.userId);
  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    const error = new Error('Invalid user id.');
    error.statusCode = 400;
    throw error;
  }
  if (targetUserId === userId) {
    const error = new Error('You cannot report your own account.');
    error.statusCode = 400;
    throw error;
  }

  const target = await authRepository.findUserById(targetUserId);
  if (!target) {
    const error = new Error('User not found.');
    error.statusCode = 404;
    throw error;
  }

  const reason = input?.reason == null ? null : String(input.reason);
  const { alreadyReported } = await reportsRepository.addReport({
    reporterId: userId,
    targetKind: 'user',
    targetId: targetUserId,
    reason,
  });
  return { success: true, alreadyReported };
}

module.exports = {
  reportPost,
  reportUser,
};
