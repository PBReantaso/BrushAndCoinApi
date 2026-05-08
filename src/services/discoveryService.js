const discoveryRepository = require('../repositories/discoveryRepository');

function _asPositiveInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

async function searchPosts(rawQuery, currentUser) {
  const userId = Number(currentUser?.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }
  const payload = {
    q: String(rawQuery.q ?? '').trim(),
    category: rawQuery.category,
    commissionOnly: rawQuery.commissionOnly,
    minPrice: rawQuery.minPrice,
    maxPrice: rawQuery.maxPrice,
    sort: rawQuery.sort,
    limit: _asPositiveInt(rawQuery.limit, 30),
  };
  const posts = await discoveryRepository.searchPostsForDiscovery(userId, payload);
  return { posts };
}

async function recommendations(rawQuery, currentUser) {
  const userId = Number(currentUser?.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }
  return discoveryRepository.getDiscoveryRecommendations(userId, {
    limitUsers: _asPositiveInt(rawQuery.limitUsers, 8),
    limitTags: _asPositiveInt(rawQuery.limitTags, 12),
  });
}

async function listMySavedSearches(rawQuery, currentUser) {
  const userId = Number(currentUser?.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }
  const searches = await discoveryRepository.listSavedSearches(
    userId,
    _asPositiveInt(rawQuery.limit, 50),
  );
  return { searches };
}

async function saveMySearch(body, currentUser) {
  const userId = Number(currentUser?.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }
  const name = String(body?.name ?? '').trim();
  if (!name) {
    const error = new Error('Search name is required.');
    error.statusCode = 400;
    throw error;
  }
  const search = await discoveryRepository.createSavedSearch(userId, {
    name,
    query: String(body?.query ?? '').trim(),
    filters: body?.filters && typeof body.filters === 'object' ? body.filters : {},
  });
  return { search };
}

async function deleteMySavedSearch(savedSearchId, currentUser) {
  const userId = Number(currentUser?.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }
  const id = Number(savedSearchId);
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error('Invalid saved search id.');
    error.statusCode = 400;
    throw error;
  }
  const ok = await discoveryRepository.deleteSavedSearch(userId, id);
  if (!ok) {
    const error = new Error('Saved search not found.');
    error.statusCode = 404;
    throw error;
  }
  return { success: true };
}

module.exports = {
  searchPosts,
  recommendations,
  listMySavedSearches,
  saveMySearch,
  deleteMySavedSearch,
};

