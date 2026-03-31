const authRepository = require('../repositories/authRepository');
const bcrypt = require('bcryptjs');
const tokenService = require('./tokenService');

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
  const created = await authRepository.createUser({ email, password: passwordHash });
  const accessToken = tokenService.issueAccessToken({
    sub: created.id,
    email: created.email,
  });
  const refreshToken = tokenService.issueRefreshToken({
    sub: created.id,
    email: created.email,
  });
  return {
    accessToken,
    refreshToken,
    user: { id: created.id, email: created.email },
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
  });
  const refreshToken = tokenService.issueRefreshToken({
    sub: user.id,
    email: user.email,
  });
  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email },
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
  });
  return { accessToken };
}

function me(user) {
  return {
    user: {
      id: user.id,
      email: user.email,
    },
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
  deleteAccount,
};
