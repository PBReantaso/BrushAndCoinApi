const authRepository = require('../repositories/authRepository');
const followsRepository = require('../repositories/followsRepository');
const bcrypt = require('bcryptjs');
const tokenService = require('./tokenService');

const USERNAME_MAX_LEN = 48;

function baseUsernameFromEmail(email) {
  const local = String(email).split('@')[0] || 'user';
  const cleaned = local.trim().replace(/[^a-zA-Z0-9_]/g, '');
  return cleaned || 'user';
}

async function allocateSignupUsername(email) {
  let base = baseUsernameFromEmail(email);
  if (base.length > USERNAME_MAX_LEN) {
    base = base.slice(0, USERNAME_MAX_LEN);
  }
  let candidate = base;
  let n = 0;
  for (;;) {
    const exists = await authRepository.findUserIdByUsernameKey(candidate, 0);
    if (!exists) {
      return candidate;
    }
    n += 1;
    const suffix = String(n);
    const maxBase = Math.max(1, USERNAME_MAX_LEN - suffix.length);
    candidate = base.slice(0, maxBase) + suffix;
  }
}

async function signup({ email, password }) {
  if (!email || !password) {
    const error = new Error('Email and password are required.');
    error.statusCode = 400;
    throw error;
  }

  const existingUser = await authRepository.findUserByEmail(email);
  if (existingUser) {
    const error = new Error('Email is already registered.');
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const username = await allocateSignupUsername(email);
  const created = await authRepository.createUser({
    email,
    username,
    password: passwordHash,
  });
  const accessToken = tokenService.issueAccessToken({
    sub: created.id,
    email: created.email,
    username: created.username,
  });
  const refreshToken = tokenService.issueRefreshToken({
    sub: created.id,
    email: created.email,
    username: created.username,
  });
  return {
    accessToken,
    refreshToken,
    user: { id: created.id, email: created.email, username: created.username },
  };
}

async function login({ email, password }) {
  if (!email || !password) {
    const error = new Error('Email and password are required.');
    error.statusCode = 400;
    throw error;
  }

  const user = await authRepository.findUserByEmail(email);
  const isValid = await _isPasswordValid(password, user?.password);
  if (!user || !isValid) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  const accessToken = tokenService.issueAccessToken({
    sub: user.id,
    email: user.email,
    username: user.username,
  });
  const refreshToken = tokenService.issueRefreshToken({
    sub: user.id,
    email: user.email,
    username: user.username,
  });
  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, username: user.username },
  };
}

async function refresh({ refreshToken }) {
  if (!refreshToken) {
    const error = new Error('Refresh token is required.');
    error.statusCode = 400;
    throw error;
  }

  let payload;
  try {
    payload = tokenService.verifyRefreshToken(refreshToken);
  } catch (_) {
    const error = new Error('Invalid refresh token.');
    error.statusCode = 401;
    throw error;
  }

  const accessToken = tokenService.issueAccessToken({
    sub: payload.sub,
    email: payload.email,
    username: payload.username,
  });
  return { accessToken };
}

async function me(user) {
  const userId = Number(user.id);
  const dbUser = await authRepository.findUserById(userId);
  const [followerCount, followingCount] = await Promise.all([
    followsRepository.followerCount(userId),
    followsRepository.followingCount(userId),
  ]);
  return {
    user: {
      id: dbUser?.id ?? userId,
      email: dbUser?.email ?? user.email,
      username: dbUser?.username ?? user.username ?? '',
      followerCount,
      followingCount,
    },
  };
}

async function updateProfile({ userId, username }) {
  if (!userId) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }
  const nextUsername = String(username ?? '').trim();
  if (!nextUsername) {
    const error = new Error('Username is required.');
    error.statusCode = 400;
    throw error;
  }
  if (nextUsername.length > USERNAME_MAX_LEN) {
    const error = new Error(`Username must be at most ${USERNAME_MAX_LEN} characters.`);
    error.statusCode = 400;
    throw error;
  }

  const taken = await authRepository.findUserIdByUsernameKey(nextUsername, userId);
  if (taken) {
    const error = new Error('Username is already taken.');
    error.statusCode = 409;
    throw error;
  }

  const updated = await authRepository.updateUserProfileById(userId, {
    username: nextUsername,
  });
  if (!updated) {
    const error = new Error('User not found.');
    error.statusCode = 404;
    throw error;
  }

  const accessToken = tokenService.issueAccessToken({
    sub: updated.id,
    email: updated.email,
    username: updated.username,
  });
  const refreshToken = tokenService.issueRefreshToken({
    sub: updated.id,
    email: updated.email,
    username: updated.username,
  });

  return {
    accessToken,
    refreshToken,
    user: updated,
  };
}

async function deleteAccount({ userId, password }) {
  if (!userId || !password) {
    const error = new Error('Password is required to delete account.');
    error.statusCode = 400;
    throw error;
  }

  const user = await authRepository.findUserById(userId);
  const isValid = await _isPasswordValid(password, user?.password);
  if (!user || !isValid) {
    const error = new Error('Invalid password.');
    error.statusCode = 401;
    throw error;
  }

  await authRepository.deleteUserById(userId);
  return { success: true };
}

async function _isPasswordValid(inputPassword, storedPassword) {
  if (!storedPassword) {
    return false;
  }
  if (storedPassword.startsWith('$2')) {
    return bcrypt.compare(inputPassword, storedPassword);
  }
  return inputPassword === storedPassword;
}

module.exports = {
  signup,
  login,
  refresh,
  me,
  updateProfile,
  deleteAccount,
};
