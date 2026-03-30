const { isPostgresEnabled, query } = require('../config/database');
const { memoryStore } = require('../data/memoryStore');

async function listArtists() {
  if (!isPostgresEnabled()) {
    return memoryStore.artists;
  }

  const result = await query(
    'SELECT id, name, location, rating FROM artists ORDER BY id ASC',
  );
  return result.rows;
}

async function listProjects() {
  if (!isPostgresEnabled()) {
    return memoryStore.projects;
  }

  const result = await query(
    `SELECT 
      p.id,
      p.title,
      p.client_name AS "clientName",
      p.status,
      pm.title AS milestone_title,
      pm.amount AS milestone_amount,
      pm.is_released AS milestone_released
    FROM projects p
    LEFT JOIN project_milestones pm ON pm.project_id = p.id
    ORDER BY p.id ASC, pm.id ASC`,
  );

  const projectMap = new Map();
  for (const row of result.rows) {
    if (!projectMap.has(row.id)) {
      projectMap.set(row.id, {
        id: row.id,
        title: row.title,
        clientName: row.clientName,
        status: row.status,
        milestones: [],
      });
    }

    if (row.milestone_title) {
      projectMap.get(row.id).milestones.push({
        title: row.milestone_title,
        amount: Number(row.milestone_amount),
        isReleased: row.milestone_released,
      });
    }
  }

  return Array.from(projectMap.values());
}

async function listConversations() {
  if (!isPostgresEnabled()) {
    return memoryStore.conversations;
  }

  const result = await query(
    'SELECT id, name FROM conversations ORDER BY id ASC',
  );
  return result.rows;
}

module.exports = {
  listArtists,
  listProjects,
  listConversations,
};
