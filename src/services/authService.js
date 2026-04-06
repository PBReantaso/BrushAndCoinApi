const authRepository = require('../repositories/authRepository');
const followsRepository = require('../repositories/followsRepository');
const bcrypt = require('bcryptjs');
const tokenService = require('./tokenService');

function tokenPayloadForUser(user) {
  if (!user) {
    return { sub: 0, email: '', username: '', isAdmin: false };
  }
  return {
    sub: user.id,
    email: user.email,
    username: user.username ?? '',
    isAdmin: Boolean(user.isAdmin),
  };
}

const USERNAME_MAX_LEN = 48;
const NAME_MAX_LEN = 80;
const AVATAR_URL_MAX_LEN = 400000;
const TIPS_URL_MAX_LEN = 2000;
const SOCIAL_LINK_MAX_LEN = 500;

function sanitizeSocialLinksBody(raw) {
  const d = { facebook: '', instagram: '', twitter: '', website: '' };
  if (!raw || typeof raw !== 'object') {
    return d;
  }
  for (const k of Object.keys(d)) {
    let v = String(raw[k] ?? '').trim();
    if (v.length > SOCIAL_LINK_MAX_LEN) {
      v = v.slice(0, SOCIAL_LINK_MAX_LEN);
    }
    d[k] = v;
  }
  return d;
}

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
  const payload = tokenPayloadForUser({ ...created, isAdmin: false });
  const accessToken = tokenService.issueAccessToken(payload);
  const refreshToken = tokenService.issueRefreshToken(payload);
  return {
    accessToken,
    refreshToken,
    user: {
      id: created.id,
      email: created.email,
      username: created.username,
      isAdmin: false,
    },
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

  const payload = tokenPayloadForUser(user);
  const accessToken = tokenService.issueAccessToken(payload);
  const refreshToken = tokenService.issueRefreshToken(payload);
  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      isAdmin: Boolean(user.isAdmin),
    },
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

  const dbUser = await authRepository.findUserById(Number(payload.sub));
  if (!dbUser) {
    const error = new Error('User no longer exists.');
    error.statusCode = 401;
    throw error;
  }
  const accessToken = tokenService.issueAccessToken(tokenPayloadForUser(dbUser));
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
      firstName: dbUser?.firstName != null ? String(dbUser.firstName) : '',
      lastName: dbUser?.lastName != null ? String(dbUser.lastName) : '',
      avatarUrl: dbUser?.avatarUrl ?? null,
      socialLinks: sanitizeSocialLinksBody(dbUser?.socialLinks),
      tipsEnabled: Boolean(dbUser?.tipsEnabled),
      tipsUrl: dbUser?.tipsUrl ?? null,
      isPrivate: Boolean(dbUser?.isPrivate),
      followerCount,
      followingCount,
      isAdmin: Boolean(dbUser?.isAdmin),
    },
  };
}

async function updateProfile({
  userId,
  username,
  isPrivate,
  firstName,
  lastName,
  avatarUrl,
  socialLinks,
  tipsEnabled,
  tipsUrl,
}) {
  if (!userId) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }

  const hasUsername = username != null && String(username).trim() !== '';
  const hasPrivate = typeof isPrivate === 'boolean';
  const hasFirstName = firstName !== undefined;
  const hasLastName = lastName !== undefined;
  const hasAvatarUrl = avatarUrl !== undefined;
  const hasSocialLinks = socialLinks !== undefined;
  const hasTipsEnabled = typeof tipsEnabled === 'boolean';
  const hasTipsUrl = tipsUrl !== undefined;

  if (
    !hasUsername &&
    !hasPrivate &&
    !hasFirstName &&
    !hasLastName &&
    !hasAvatarUrl &&
    !hasSocialLinks &&
    !hasTipsEnabled &&
    !hasTipsUrl
  ) {
    const error = new Error(
      'Provide at least one profile field to update.',
    );
    error.statusCode = 400;
    throw error;
  }

  const dbUser = await authRepository.findUserById(userId);
  if (!dbUser) {
    const error = new Error('User not found.');
    error.statusCode = 404;
    throw error;
  }

  let nextUsername = String(dbUser.username ?? '').trim();
  if (hasUsername) {
    nextUsername = String(username).trim();
    if (!nextUsername) {
      const error = new Error('Username cannot be empty.');
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
  }

  if (hasFirstName && String(firstName).length > NAME_MAX_LEN) {
    const error = new Error(`First name must be at most ${NAME_MAX_LEN} characters.`);
    error.statusCode = 400;
    throw error;
  }
  if (hasLastName && String(lastName).length > NAME_MAX_LEN) {
    const error = new Error(`Last name must be at most ${NAME_MAX_LEN} characters.`);
    error.statusCode = 400;
    throw error;
  }
  if (hasAvatarUrl && avatarUrl != null && String(avatarUrl).length > AVATAR_URL_MAX_LEN) {
    const error = new Error('Profile photo is too large. Try a smaller image.');
    error.statusCode = 400;
    throw error;
  }
  if (hasTipsUrl && tipsUrl != null && String(tipsUrl).length > TIPS_URL_MAX_LEN) {
    const error = new Error(`Tips link must be at most ${TIPS_URL_MAX_LEN} characters.`);
    error.statusCode = 400;
    throw error;
  }

  const updated = await authRepository.updateUserProfileById(userId, {
    username: hasUsername ? nextUsername : undefined,
    isPrivate: hasPrivate ? isPrivate : undefined,
    firstName: hasFirstName ? String(firstName).trim() : undefined,
    lastName: hasLastName ? String(lastName).trim() : undefined,
    avatarUrl: hasAvatarUrl ? avatarUrl : undefined,
    socialLinks: hasSocialLinks ? sanitizeSocialLinksBody(socialLinks) : undefined,
    tipsEnabled: hasTipsEnabled ? tipsEnabled : undefined,
    tipsUrl: hasTipsUrl ? tipsUrl : undefined,
  });
  if (!updated) {
    const error = new Error('User not found.');
    error.statusCode = 404;
    throw error;
  }

  const payload = tokenPayloadForUser(updated);
  const accessToken = tokenService.issueAccessToken(payload);
  const refreshToken = tokenService.issueRefreshToken(payload);

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
