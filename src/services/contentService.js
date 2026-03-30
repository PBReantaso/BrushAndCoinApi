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

module.exports = {
  getDashboard,
  getArtists,
  getProjects,
  getMessages,
};
