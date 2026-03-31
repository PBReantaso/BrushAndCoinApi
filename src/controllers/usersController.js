const usersService = require('../services/usersService');

async function search(req, res, next) {
  try {
    const q = req.query.q ?? '';
    const payload = await usersService.searchUsers(q, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function getProfile(req, res, next) {
  try {
    const payload = await usersService.getPublicProfile(req.params.id, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function follow(req, res, next) {
  try {
    const payload = await usersService.followUser(req.params.id, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function unfollow(req, res, next) {
  try {
    const payload = await usersService.unfollowUser(req.params.id, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function getPosts(req, res, next) {
  try {
    const payload = await usersService.getUserPosts(req.params.id, req.user);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  search,
  getProfile,
  getPosts,
  follow,
  unfollow,
};
