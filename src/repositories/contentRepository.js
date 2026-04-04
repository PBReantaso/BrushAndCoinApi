const { isPostgresEnabled, query } = require('../config/database');
const { memoryStore } = require('../data/memoryStore');
const authRepository = require('./authRepository');
const followsRepository = require('./followsRepository');

async function canViewerSeeProfilePosts(profileUserId, viewerUserId) {
  const pid = Number(profileUserId);
  const vid = Number(viewerUserId);
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  if (pid === vid) {
    return true;
  }
  if (!(await authRepository.isUserPrivate(pid))) {
    return true;
  }
  if (!Number.isFinite(vid) || vid <= 0) {
    return false;
  }
  return followsRepository.isFollowing(vid, pid);
}

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
        description: row.description || '',
        budget: Number(row.budget || 0),
        deadline: row.deadline || null,
        specialRequirements: row.special_requirements || '',
        isUrgent: row.is_urgent || false,
        referenceImages: row.reference_images || [],
        totalAmount: Number(row.total_amount || 0),
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

async function createProject({
  title,
  clientName,
  status = 'inquiry',
  description = '',
  budget = 0,
  deadline = null,
  specialRequirements = '',
  isUrgent = false,
  referenceImages = [],
  totalAmount = 0,
  milestones = [],
}) {
  if (!isPostgresEnabled()) {
    const nextId = memoryStore.projects.length > 0 ? Math.max(...memoryStore.projects.map(p => p.id)) + 1 : 1;
    const project = {
      id: nextId,
      title,
      clientName,
      status,
      description,
      budget,
      deadline,
      specialRequirements,
      isUrgent,
      referenceImages,
      totalAmount,
      milestones: Array.isArray(milestones) ? milestones : [],
    };
    memoryStore.projects.push(project);
    return project;
  }

  const result = await query(
    `INSERT INTO projects (title, client_name, status)
     VALUES ($1, $2, $3)
     RETURNING id, title, client_name AS "clientName", status`,
    [title, clientName, status],
  );

  const project = result.rows[0];
  project.description = description;
  project.budget = budget;
  project.deadline = deadline;
  project.specialRequirements = specialRequirements;
  project.isUrgent = isUrgent;
  project.referenceImages = referenceImages;
  project.totalAmount = totalAmount;

  if (Array.isArray(milestones) && milestones.length > 0) {
    const values = [];
    const placeholders = [];
    let idx = 1;
    for (const milestone of milestones) {
      const amount = Number(milestone.amount ?? 0);
      const titleM = String(milestone.title ?? '').trim();
      const isReleased = Boolean(milestone.isReleased ?? false);
      values.push(project.id, titleM, amount, isReleased);
      placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3})`);
      idx += 4;
    }
    await query(
      `INSERT INTO project_milestones (project_id, title, amount, is_released) VALUES ${placeholders.join(', ')}`,
      values,
    );
  }

  return project;
}

async function updateProjectStatus(projectId, status) {
  if (!isPostgresEnabled()) {
    const project = memoryStore.projects.find((p) => p.id === projectId);
    if (!project) return null;
    project.status = status;
    return project;
  }

  const result = await query(
    `UPDATE projects SET status = $1 WHERE id = $2
     RETURNING id, title, client_name AS "clientName", status`,
    [status, projectId],
  );

  return result.rows[0] || null;
}

async function listConversations() {
  if (!isPostgresEnabled()) {
    return memoryStore.conversations;
  }

  const result = await query(
    'SELECT id, name, last_message AS "lastMessage", last_message_date AS "lastMessageDate" FROM conversations ORDER BY id ASC',
  );
  return result.rows;
}

async function listConversationsByUser(userId) {
  if (!isPostgresEnabled()) {
    if (!userId) return [];

    const participantConversations = memoryStore.conversationParticipants
      .filter((cp) => cp.userId === userId)
      .map((cp) => cp.conversationId);

    const uniqueConversationIds = [...new Set(participantConversations)];

    return uniqueConversationIds
      .map((conversationId) => {
        const conversation = memoryStore.conversations.find((c) => c.id === conversationId);
        if (!conversation) return null;

        // Find other participants (excluding current user)
        const otherParticipants = memoryStore.conversationParticipants
          .filter((cp) => cp.conversationId === conversationId && cp.userId !== userId)
          .map((cp) => memoryStore.users.find((u) => u.id === cp.userId))
          .filter((u) => u != null);

        let otherName = conversation.name;
        if (otherParticipants.length > 0) {
          const otherUser = otherParticipants[0];
          otherName = otherUser.username || otherUser.email || otherName;
        }

        // Prevent current username appearing as the conversation title
        const currentUser = memoryStore.users.find((u) => u.id === userId);
        const currentUsername = currentUser
          ? currentUser.username || (currentUser.email || '').split('@')[0]
          : null;

        if (currentUsername && otherName === currentUsername) {
          const fallback = otherParticipants
            .map((ou) => ou.username || (ou.email || '').split('@')[0])
            .find((n) => n && n !== currentUsername);
          if (fallback) {
            otherName = fallback;
          }
        }

        const conversationMessages = (memoryStore.messages || []).filter(
          (m) => Number(m.conversationId) === conversationId,
        );
        const lastMessageEntry = conversationMessages.length > 0
          ? conversationMessages.reduce((a, b) =>
              new Date(a.createdAt).getTime() >= new Date(b.createdAt).getTime() ? a : b,
            )
          : null;
        const readEntry = (memoryStore.conversationReads || []).find(
          (r) => Number(r.conversationId) === conversationId && Number(r.userId) === userId,
        );
        const hasUnreadMessages = Boolean(
          lastMessageEntry &&
            Number(lastMessageEntry.senderId) !== userId &&
            (!readEntry ||
              new Date(lastMessageEntry.createdAt).getTime() >
                new Date(readEntry.lastReadAt).getTime()),
        );

        return {
          id: conversation.id,
          name: otherName,
          lastMessage: conversation.lastMessage,
          lastMessageDate: conversation.lastMessageDate,
          hasUnreadMessages,
        };
      })
      .filter((item) => item != null);
  }

  if (!userId) {
    // If userId is null/undefined, return empty list
    return [];
  }

  const result = await query(
    `WITH last_per_conv AS (
      SELECT DISTINCT ON (conversation_id)
        conversation_id,
        sender_id,
        created_at
      FROM messages
      ORDER BY conversation_id, created_at DESC
    )
    SELECT DISTINCT
      c.id,
      COALESCE(NULLIF(u_other.username, ''), split_part(u_other.email, '@', 1), c.name) AS name,
      c.last_message AS "lastMessage",
      c.last_message_date AS "lastMessageDate",
      CASE
        WHEN lp.sender_id IS NOT NULL
          AND lp.sender_id <> $1
          AND (
            NOT EXISTS (
              SELECT 1 FROM conversation_reads cr
              WHERE cr.conversation_id = c.id AND cr.user_id = $1
            )
            OR lp.created_at > (
              SELECT cr.last_read_at FROM conversation_reads cr
              WHERE cr.conversation_id = c.id AND cr.user_id = $1
            )
          )
        THEN true
        ELSE false
      END AS "hasUnreadMessages"
    FROM conversations c
    INNER JOIN conversation_participants cp_me ON c.id = cp_me.conversation_id AND cp_me.user_id = $1
    INNER JOIN conversation_participants cp_other ON c.id = cp_other.conversation_id AND cp_other.user_id != $1
    INNER JOIN users u_other ON u_other.id = cp_other.user_id
    LEFT JOIN last_per_conv lp ON lp.conversation_id = c.id
    WHERE NOT EXISTS (
      SELECT 1 FROM conversation_participants cp_check
      WHERE cp_check.conversation_id = c.id
        AND cp_check.user_id NOT IN ($1, cp_other.user_id)
    )
    ORDER BY c.last_message_date DESC NULLS LAST, c.id DESC`,
    [userId],
  );
  return result.rows;
}

async function listMessages(conversationId) {
  if (!isPostgresEnabled()) {
    const cid = Number(conversationId);
    const rows = (memoryStore.messages || []).filter((m) => Number(m.conversationId) === cid);
    return rows.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }

  const result = await query(
    'SELECT id, conversation_id AS "conversationId", sender_id AS "senderId", content, created_at AS "createdAt" FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId],
  );
  return result.rows;
}

async function createMessage({ conversationId, senderId, content }) {
  if (!isPostgresEnabled()) {
    const id = (memoryStore.messages?.length ? Math.max(...memoryStore.messages.map((m) => m.id)) : 0) + 1;
    const msg = {
      id,
      conversationId: Number(conversationId),
      senderId: Number(senderId),
      content: String(content),
      createdAt: new Date().toISOString(),
    };
    memoryStore.messages.push(msg);
    return msg;
  }

  const result = await query(
    'INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3) RETURNING id, conversation_id AS "conversationId", sender_id AS "senderId", content, created_at AS "createdAt"',
    [conversationId, senderId, content],
  );
  return result.rows[0];
}

async function upsertConversationRead(conversationId, userId) {
  const cid = Number(conversationId);
  const uid = Number(userId);
  if (!Number.isFinite(cid) || cid <= 0 || !Number.isFinite(uid) || uid <= 0) {
    return;
  }
  const now = new Date().toISOString();
  if (!isPostgresEnabled()) {
    if (!memoryStore.conversationReads) memoryStore.conversationReads = [];
    const idx = memoryStore.conversationReads.findIndex(
      (r) => Number(r.conversationId) === cid && Number(r.userId) === uid,
    );
    const row = { conversationId: cid, userId: uid, lastReadAt: now };
    if (idx >= 0) memoryStore.conversationReads[idx] = row;
    else memoryStore.conversationReads.push(row);
    return;
  }
  await query(
    `INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (conversation_id, user_id)
     DO UPDATE SET last_read_at = CURRENT_TIMESTAMP`,
    [cid, uid],
  );
}

async function unreadMessagesCountForUser(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return 0;

  if (!isPostgresEnabled()) {
    const convIds = [
      ...new Set(
        (memoryStore.conversationParticipants || [])
          .filter((cp) => Number(cp.userId) === uid)
          .map((cp) => Number(cp.conversationId)),
      ),
    ];
    let count = 0;
    for (const cid of convIds) {
      const msgs = (memoryStore.messages || []).filter((m) => Number(m.conversationId) === cid);
      if (msgs.length === 0) continue;
      const last = msgs.reduce((a, b) =>
        new Date(a.createdAt).getTime() >= new Date(b.createdAt).getTime() ? a : b,
      );
      if (Number(last.senderId) === uid) continue;
      const read = (memoryStore.conversationReads || []).find(
        (r) => Number(r.conversationId) === cid && Number(r.userId) === uid,
      );
      if (!read || new Date(last.createdAt).getTime() > new Date(read.lastReadAt).getTime()) {
        count += 1;
      }
    }
    return count;
  }

  const result = await query(
    `WITH last_per_conv AS (
       SELECT DISTINCT ON (conversation_id)
         conversation_id,
         sender_id,
         created_at
       FROM messages
       ORDER BY conversation_id, id DESC
     )
     SELECT COUNT(*)::int AS c
     FROM last_per_conv lp
     INNER JOIN conversation_participants cp
       ON cp.conversation_id = lp.conversation_id AND cp.user_id = $1
     WHERE lp.sender_id <> $1
       AND (
         NOT EXISTS (
           SELECT 1 FROM conversation_reads cr
           WHERE cr.conversation_id = lp.conversation_id AND cr.user_id = $1
         )
         OR lp.created_at > (
           SELECT cr.last_read_at FROM conversation_reads cr
           WHERE cr.conversation_id = lp.conversation_id AND cr.user_id = $1
         )
       )`,
    [uid],
  );
  const row = result.rows[0];
  return row && row.c != null ? Number(row.c) : 0;
}

async function updateConversationLastMessage(conversationId, lastMessage) {
  if (!isPostgresEnabled()) {
    // Update in-memory
    const convo = memoryStore.conversations.find(c => c.id === conversationId);
    if (convo) {
      convo.lastMessage = lastMessage;
      convo.lastMessageDate = new Date().toISOString();
    }
    return;
  }

  await query(
    'UPDATE conversations SET last_message = $1, last_message_date = CURRENT_TIMESTAMP WHERE id = $2',
    [lastMessage, conversationId],
  );
}

async function findConversationBetweenUsers(userId1, userId2) {
  if (!isPostgresEnabled()) {
    // For in-memory, return null to allow creating new conversations
    return null;
  }

  const result = await query(
    `SELECT c.id,
      COALESCE(NULLIF(u_other.username, ''), split_part(u_other.email, '@', 1)) AS name,
      c.last_message AS "lastMessage",
      c.last_message_date AS "lastMessageDate"
     FROM conversations c
     INNER JOIN conversation_participants cp_current
       ON c.id = cp_current.conversation_id AND cp_current.user_id = $1
     INNER JOIN conversation_participants cp_other
       ON c.id = cp_other.conversation_id AND cp_other.user_id = $2
     INNER JOIN users u_other ON u_other.id = $2
     LIMIT 1`,
    [userId1, userId2],
  );
  return result.rows[0];
}

async function isUserInConversation(conversationId, userId) {
  if (!isPostgresEnabled()) {
    return memoryStore.conversationParticipants.some(
      (cp) => cp.conversationId === conversationId && cp.userId === userId,
    );
  }

  const result = await query(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2 LIMIT 1',
    [conversationId, userId],
  );
  return result.rows.length > 0;
}

async function listConversationParticipantIdsExcluding(conversationId, excludeUserId) {
  const cid = Number(conversationId);
  const ex = Number(excludeUserId);
  if (!Number.isFinite(cid) || cid <= 0 || !Number.isFinite(ex) || ex <= 0) {
    return [];
  }

  if (!isPostgresEnabled()) {
    return memoryStore.conversationParticipants
      .filter((cp) => cp.conversationId === cid && cp.userId !== ex)
      .map((cp) => cp.userId);
  }

  const result = await query(
    'SELECT user_id AS id FROM conversation_participants WHERE conversation_id = $1 AND user_id != $2',
    [cid, ex],
  );
  return result.rows.map((r) => r.id);
}

async function findConversationById(conversationId) {
  if (!isPostgresEnabled()) {
    return memoryStore.conversations.find(c => c.id === conversationId) || null;
  }

  const result = await query(
    'SELECT id, name, last_message AS "lastMessage", last_message_date AS "lastMessageDate" FROM conversations WHERE id = $1 LIMIT 1',
    [conversationId],
  );
  return result.rows[0] || null;
}

async function findConversationByIdForUser(conversationId, userId) {
  if (!isPostgresEnabled()) {
    const conversation = memoryStore.conversations.find(c => c.id === conversationId);
    if (!conversation) return null;

    const otherParticipant = memoryStore.conversationParticipants.find(
      (cp) => cp.conversationId === conversationId && cp.userId !== userId,
    );

    let otherName = conversation.name;
    if (otherParticipant) {
      const otherUser = memoryStore.users.find((u) => u.id === otherParticipant.userId);
      if (otherUser) {
        otherName = otherUser.username || otherUser.email || otherName;
      }
    }

    return {
      id: conversation.id,
      name: otherName,
      lastMessage: conversation.lastMessage,
      lastMessageDate: conversation.lastMessageDate,
    };
  }

  const result = await query(
    `SELECT
      c.id,
      COALESCE(NULLIF(u_other.username, ''), split_part(u_other.email, '@', 1)) AS name,
      c.last_message AS "lastMessage",
      c.last_message_date AS "lastMessageDate"
    FROM conversations c
    INNER JOIN conversation_participants cp_current ON c.id = cp_current.conversation_id AND cp_current.user_id = $1
    INNER JOIN conversation_participants cp_other ON c.id = cp_other.conversation_id AND cp_other.user_id != $1
    INNER JOIN users u_other ON u_other.id = cp_other.user_id
    WHERE c.id = $2
    LIMIT 1`,
    [userId, conversationId],
  );
  return result.rows[0] || null;
}

async function createConversation(userId1, userId2) {
  if (!isPostgresEnabled()) {
    // For in-memory, create a new conversation
    const nextId = memoryStore.conversations.length > 0 
      ? Math.max(...memoryStore.conversations.map(c => c.id)) + 1 
      : 1;

    const otherUser = memoryStore.users.find((u) => u.id === userId2);
    const otherName = otherUser
      ? otherUser.username || (otherUser.email || '').split('@')[0] || 'User'
      : 'User';

    const conversation = {
      id: nextId,
      name: otherName,
      lastMessage: null,
      lastMessageDate: null,
    };
    memoryStore.conversations.push(conversation);
    
    // Add participants to conversation
    memoryStore.conversationParticipants.push(
      { conversationId: nextId, userId: userId1 },
      { conversationId: nextId, userId: userId2 }
    );
    
    return conversation;
  }

  // Get usernames
  const usersResult = await query(
    'SELECT id, username FROM users WHERE id IN ($1, $2)',
    [userId1, userId2],
  );
  const user1 = usersResult.rows.find(u => u.id === userId1);
  const user2 = usersResult.rows.find(u => u.id === userId2);
  const name = user2?.username || 'User';

  // Create conversation
  const convResult = await query(
    'INSERT INTO conversations (name) VALUES ($1) RETURNING id, name',
    [name],
  );
  const conversation = convResult.rows[0];

  // Add participants
  await query(
    'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
    [conversation.id, userId1, userId2],
  );

  return { id: conversation.id, name: conversation.name };
}

async function listEvents() {
  if (!isPostgresEnabled()) {
    return memoryStore.events;
  }

  const result = await query(
    `SELECT
      id,
      title,
      category,
      to_char(event_date, 'YYYY-MM-DD') AS "eventDate",
      to_char(event_time, 'HH24:MI') AS "eventTime",
      venue,
      location_text AS "locationText",
      latitude,
      longitude,
      description,
      additional_info AS "additionalInfo",
      image_url AS "imageUrl",
      schedules,
      created_by AS "createdBy",
      created_at AS "createdAt"
    FROM events
    ORDER BY event_date ASC, event_time ASC, id DESC`,
  );
  return result.rows;
}

async function createEvent({
  title,
  category,
  eventDate,
  eventTime,
  venue,
  locationText,
  latitude,
  longitude,
  description,
  additionalInfo,
  imageUrl,
  schedules,
  createdBy,
}) {
  if (!isPostgresEnabled()) {
    const nextId = (memoryStore.events.at(-1)?.id ?? 0) + 1;
    const event = {
      id: nextId,
      title,
      category,
      eventDate,
      eventTime,
      venue,
      locationText,
      latitude,
      longitude,
      description,
      additionalInfo,
      imageUrl: imageUrl ?? null,
      schedules,
      createdBy,
      createdAt: new Date().toISOString(),
    };
    memoryStore.events.push(event);
    if (createdBy != null) {
      await addEventParticipant(nextId, createdBy);
    }
    return event;
  }

  const result = await query(
    `INSERT INTO events (
      title, category, event_date, event_time, venue, location_text,
      latitude, longitude, description, additional_info, image_url, schedules, created_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11, $12::jsonb, $13
    )
    RETURNING
      id,
      title,
      category,
      to_char(event_date, 'YYYY-MM-DD') AS "eventDate",
      to_char(event_time, 'HH24:MI') AS "eventTime",
      venue,
      location_text AS "locationText",
      latitude,
      longitude,
      description,
      additional_info AS "additionalInfo",
      image_url AS "imageUrl",
      schedules,
      created_by AS "createdBy",
      created_at AS "createdAt"`,
    [
      title,
      category,
      eventDate,
      eventTime,
      venue,
      locationText,
      latitude,
      longitude,
      description,
      additionalInfo,
      imageUrl ?? null,
      JSON.stringify(schedules ?? []),
      createdBy,
    ],
  );

  const row = result.rows[0];
  if (row && createdBy != null) {
    await addEventParticipant(row.id, createdBy);
  }
  return row;
}

async function addEventParticipant(eventId, userId) {
  const eid = Number(eventId);
  const uid = Number(userId);
  if (!Number.isFinite(eid) || eid <= 0 || !Number.isFinite(uid) || uid <= 0) {
    return false;
  }
  if (!isPostgresEnabled()) {
    if (!memoryStore.eventParticipants) memoryStore.eventParticipants = [];
    const exists = memoryStore.eventParticipants.some(
      (p) => Number(p.eventId) === eid && Number(p.userId) === uid,
    );
    if (exists) return true;
    memoryStore.eventParticipants.push({
      eventId: eid,
      userId: uid,
      joinedAt: new Date().toISOString(),
    });
    return true;
  }
  await query(
    `INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [eid, uid],
  );
  return true;
}

async function listEventParticipants(eventId) {
  const eid = Number(eventId);
  if (!Number.isFinite(eid) || eid <= 0) {
    return [];
  }
  if (!isPostgresEnabled()) {
    const event = memoryStore.events.find((ev) => Number(ev.id) === eid);
    const creatorId = event?.createdBy != null ? Number(event.createdBy) : null;
    const rows = (memoryStore.eventParticipants || []).filter((p) => Number(p.eventId) === eid);
    const byUser = new Map();
    for (const p of rows) {
      const uid = Number(p.userId);
      const u = memoryStore.users.find((x) => Number(x.id) === uid);
      const username = u?.username || (u?.email || '').split('@')[0] || 'User';
      byUser.set(uid, {
        userId: uid,
        username,
        isOrganizer: creatorId != null && uid === creatorId,
      });
    }
    if (creatorId != null && !byUser.has(creatorId)) {
      const u = memoryStore.users.find((x) => Number(x.id) === creatorId);
      const username = u?.username || (u?.email || '').split('@')[0] || 'Organizer';
      byUser.set(creatorId, {
        userId: creatorId,
        username,
        isOrganizer: true,
      });
    }
    const out = [...byUser.values()];
    out.sort((a, b) => {
      if (a.isOrganizer !== b.isOrganizer) return a.isOrganizer ? -1 : 1;
      return a.username.localeCompare(b.username);
    });
    return out;
  }

  const result = await query(
    `SELECT
      ep.user_id AS "userId",
      COALESCE(NULLIF(u.username, ''), split_part(u.email, '@', 1)) AS "username",
      (ep.user_id = e.created_by) AS "isOrganizer"
    FROM event_participants ep
    JOIN users u ON u.id = ep.user_id
    JOIN events e ON e.id = ep.event_id
    WHERE ep.event_id = $1
    ORDER BY CASE WHEN ep.user_id = e.created_by THEN 0 ELSE 1 END, ep.joined_at ASC`,
    [eid],
  );
  return result.rows;
}

async function isUserEventParticipant(eventId, userId) {
  const eid = Number(eventId);
  const uid = Number(userId);
  if (!Number.isFinite(eid) || !Number.isFinite(uid)) {
    return false;
  }
  if (!isPostgresEnabled()) {
    return (memoryStore.eventParticipants || []).some(
      (p) => Number(p.eventId) === eid && Number(p.userId) === uid,
    );
  }
  const result = await query(
    'SELECT 1 FROM event_participants WHERE event_id = $1 AND user_id = $2 LIMIT 1',
    [eid, uid],
  );
  return result.rows.length > 0;
}

async function findEventById(eventId) {
  if (!isPostgresEnabled()) {
    return memoryStore.events.find((e) => e.id === eventId) || null;
  }

  const result = await query(
    `SELECT
      id,
      title,
      category,
      to_char(event_date, 'YYYY-MM-DD') AS "eventDate",
      to_char(event_time, 'HH24:MI') AS "eventTime",
      venue,
      location_text AS "locationText",
      latitude,
      longitude,
      description,
      additional_info AS "additionalInfo",
      image_url AS "imageUrl",
      schedules,
      created_by AS "createdBy",
      created_at AS "createdAt"
    FROM events
    WHERE id = $1
    LIMIT 1`,
    [eventId],
  );
  return result.rows[0] || null;
}

async function updateEventById(eventId, payload) {
  if (!isPostgresEnabled()) {
    const idx = memoryStore.events.findIndex((e) => e.id === eventId);
    if (idx === -1) return null;
    memoryStore.events[idx] = {
      ...memoryStore.events[idx],
      ...payload,
      id: eventId,
      createdBy: memoryStore.events[idx].createdBy,
      createdAt: memoryStore.events[idx].createdAt,
    };
    return memoryStore.events[idx];
  }

  const result = await query(
    `UPDATE events SET
      title = $2,
      category = $3,
      event_date = $4,
      event_time = $5,
      venue = $6,
      location_text = $7,
      latitude = $8,
      longitude = $9,
      description = $10,
      additional_info = $11,
      image_url = $12,
      schedules = $13::jsonb
    WHERE id = $1
    RETURNING
      id,
      title,
      category,
      to_char(event_date, 'YYYY-MM-DD') AS "eventDate",
      to_char(event_time, 'HH24:MI') AS "eventTime",
      venue,
      location_text AS "locationText",
      latitude,
      longitude,
      description,
      additional_info AS "additionalInfo",
      image_url AS "imageUrl",
      schedules,
      created_by AS "createdBy",
      created_at AS "createdAt"`,
    [
      eventId,
      payload.title,
      payload.category,
      payload.eventDate,
      payload.eventTime,
      payload.venue,
      payload.locationText,
      payload.latitude,
      payload.longitude,
      payload.description,
      payload.additionalInfo,
      payload.imageUrl ?? null,
      JSON.stringify(payload.schedules ?? []),
    ],
  );
  return result.rows[0] || null;
}

async function deleteEventById(eventId) {
  if (!isPostgresEnabled()) {
    const idx = memoryStore.events.findIndex((e) => e.id === eventId);
    if (idx !== -1) memoryStore.events.splice(idx, 1);
    return;
  }
  await query('DELETE FROM events WHERE id = $1', [eventId]);
}

function _normalizeTag(rawTag) {
  return String(rawTag ?? '').trim().replace(/^#/, '').toLowerCase();
}

async function listFeedPosts(userId) {
  if (!isPostgresEnabled()) {
    const followed = new Set(
      memoryStore.follows
        .filter((f) => f.followerId === userId)
        .map((f) => f.followedId),
    );
    return memoryStore.posts
      .filter((p) => p.userId === userId || followed.has(p.userId))
      .map((p) => {
        const likeCount = memoryStore.postLikes.filter((l) => l.postId === p.id).length;
        const commentCount = memoryStore.postComments.filter((c) => c.postId === p.id).length;
        const likedByMe = memoryStore.postLikes.some(
          (l) => l.postId === p.id && l.userId === userId,
        );
        const author = memoryStore.users.find((u) => Number(u.id) === Number(p.userId));
        return {
          ...p,
          likeCount,
          commentCount,
          likedByMe,
          authorAvatarUrl: author?.avatarUrl ?? null,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const result = await query(
    `SELECT
      p.id,
      p.user_id AS "userId",
      COALESCE(NULLIF(u.username, ''), split_part(u.email, '@', 1)) AS "authorName",
      u.avatar_url AS "authorAvatarUrl",
      p.title,
      p.description,
      p.category,
      p.price,
      p.is_commission_available AS "isCommissionAvailable",
      p.tags,
      p.image_url AS "imageUrl",
      p.created_at AS "createdAt",
      COALESCE(lc.like_count, 0)::int AS "likeCount",
      COALESCE(cc.comment_count, 0)::int AS "commentCount",
      EXISTS(
        SELECT 1 FROM post_likes pl
        WHERE pl.post_id = p.id AND pl.user_id = $1
      ) AS "likedByMe"
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS like_count
      FROM post_likes
      GROUP BY post_id
    ) lc ON lc.post_id = p.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS comment_count
      FROM post_comments
      GROUP BY post_id
    ) cc ON cc.post_id = p.id
    WHERE p.user_id = $1
      OR p.user_id IN (
        SELECT followed_id FROM follows WHERE follower_id = $1
      )
    ORDER BY p.created_at DESC`,
    [userId],
  );
  return result.rows;
}

async function listPostsByTag(userId, rawTag) {
  const tag = _normalizeTag(rawTag);
  if (!tag) return [];

  if (!isPostgresEnabled()) {
    const followed = new Set(
      memoryStore.follows
        .filter((f) => Number(f.followerId) === Number(userId))
        .map((f) => Number(f.followedId)),
    );
    return memoryStore.posts
      .filter((p) => {
        const authorId = Number(p.userId);
        if (authorId === Number(userId)) return true;
        const author = memoryStore.users.find((u) => Number(u.id) === authorId);
        const priv = Boolean(author?.isPrivate);
        if (!priv) return true;
        return followed.has(authorId);
      })
      .filter((p) => {
        const tags = Array.isArray(p.tags) ? p.tags : [];
        return tags.some((t) => _normalizeTag(t) === tag);
      })
      .map((p) => {
        const likeCount = memoryStore.postLikes.filter((l) => l.postId === p.id).length;
        const commentCount = memoryStore.postComments.filter((c) => c.postId === p.id).length;
        const likedByMe = memoryStore.postLikes.some(
          (l) => l.postId === p.id && l.userId === userId,
        );
        const author = memoryStore.users.find((u) => Number(u.id) === Number(p.userId));
        return {
          ...p,
          likeCount,
          commentCount,
          likedByMe,
          authorAvatarUrl: author?.avatarUrl ?? null,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const result = await query(
    `SELECT
      p.id,
      p.user_id AS "userId",
      COALESCE(NULLIF(u.username, ''), split_part(u.email, '@', 1)) AS "authorName",
      u.avatar_url AS "authorAvatarUrl",
      p.title,
      p.description,
      p.category,
      p.price,
      p.is_commission_available AS "isCommissionAvailable",
      p.tags,
      p.image_url AS "imageUrl",
      p.created_at AS "createdAt",
      COALESCE(lc.like_count, 0)::int AS "likeCount",
      COALESCE(cc.comment_count, 0)::int AS "commentCount",
      EXISTS(
        SELECT 1 FROM post_likes pl
        WHERE pl.post_id = p.id AND pl.user_id = $1
      ) AS "likedByMe"
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS like_count
      FROM post_likes
      GROUP BY post_id
    ) lc ON lc.post_id = p.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS comment_count
      FROM post_comments
      GROUP BY post_id
    ) cc ON cc.post_id = p.id
    WHERE (
      p.user_id = $1
      OR EXISTS (
        SELECT 1 FROM users u2
        WHERE u2.id = p.user_id AND COALESCE(u2.is_private, FALSE) = FALSE
      )
      OR EXISTS (
        SELECT 1 FROM follows f2
        WHERE f2.follower_id = $1 AND f2.followed_id = p.user_id
      )
    )
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(p.tags, '[]'::jsonb)) AS tag_item
      WHERE LOWER(TRIM(LEADING '#' FROM tag_item)) = $2
    )
    ORDER BY p.created_at DESC`,
    [userId, tag],
  );
  return result.rows;
}

async function listMyPosts(userId) {
  if (!isPostgresEnabled()) {
    return memoryStore.posts
      .filter((p) => p.userId === userId)
      .map((p) => {
        const likeCount = memoryStore.postLikes.filter((l) => l.postId === p.id).length;
        const commentCount = memoryStore.postComments.filter((c) => c.postId === p.id).length;
        const likedByMe = memoryStore.postLikes.some(
          (l) => l.postId === p.id && l.userId === userId,
        );
        const author = memoryStore.users.find((u) => Number(u.id) === Number(p.userId));
        return {
          ...p,
          likeCount,
          commentCount,
          likedByMe,
          authorAvatarUrl: author?.avatarUrl ?? null,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const result = await query(
    `SELECT
      p.id,
      p.user_id AS "userId",
      COALESCE(NULLIF(u.username, ''), split_part(u.email, '@', 1)) AS "authorName",
      u.avatar_url AS "authorAvatarUrl",
      p.title,
      p.description,
      p.category,
      p.price,
      p.is_commission_available AS "isCommissionAvailable",
      p.tags,
      p.image_url AS "imageUrl",
      p.created_at AS "createdAt",
      COALESCE(lc.like_count, 0)::int AS "likeCount",
      COALESCE(cc.comment_count, 0)::int AS "commentCount",
      EXISTS(
        SELECT 1 FROM post_likes pl
        WHERE pl.post_id = p.id AND pl.user_id = $1
      ) AS "likedByMe"
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS like_count
      FROM post_likes
      GROUP BY post_id
    ) lc ON lc.post_id = p.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS comment_count
      FROM post_comments
      GROUP BY post_id
    ) cc ON cc.post_id = p.id
    WHERE p.user_id = $1
    ORDER BY p.created_at DESC`,
    [userId],
  );
  return result.rows;
}

async function listPostsForProfile(profileUserId, viewerUserId) {
  if (!(await canViewerSeeProfilePosts(profileUserId, viewerUserId))) {
    return [];
  }

  if (!isPostgresEnabled()) {
    return memoryStore.posts
      .filter((p) => p.userId === profileUserId)
      .map((p) => {
        const likeCount = memoryStore.postLikes.filter((l) => l.postId === p.id).length;
        const commentCount = memoryStore.postComments.filter((c) => c.postId === p.id).length;
        const likedByMe = memoryStore.postLikes.some(
          (l) => l.postId === p.id && l.userId === viewerUserId,
        );
        const author = memoryStore.users.find((u) => Number(u.id) === Number(p.userId));
        return {
          ...p,
          likeCount,
          commentCount,
          likedByMe,
          authorAvatarUrl: author?.avatarUrl ?? null,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const result = await query(
    `SELECT
      p.id,
      p.user_id AS "userId",
      COALESCE(NULLIF(u.username, ''), split_part(u.email, '@', 1)) AS "authorName",
      u.avatar_url AS "authorAvatarUrl",
      p.title,
      p.description,
      p.category,
      p.price,
      p.is_commission_available AS "isCommissionAvailable",
      p.tags,
      p.image_url AS "imageUrl",
      p.created_at AS "createdAt",
      COALESCE(lc.like_count, 0)::int AS "likeCount",
      COALESCE(cc.comment_count, 0)::int AS "commentCount",
      EXISTS(
        SELECT 1 FROM post_likes pl
        WHERE pl.post_id = p.id AND pl.user_id = $2
      ) AS "likedByMe"
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS like_count
      FROM post_likes
      GROUP BY post_id
    ) lc ON lc.post_id = p.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS comment_count
      FROM post_comments
      GROUP BY post_id
    ) cc ON cc.post_id = p.id
    WHERE p.user_id = $1
    ORDER BY p.created_at DESC`,
    [profileUserId, viewerUserId],
  );
  return result.rows;
}

async function createPost({
  userId,
  title,
  description,
  category,
  price,
  isCommissionAvailable,
  tags,
  imageUrl,
}) {
  if (!isPostgresEnabled()) {
    const nextId = (memoryStore.posts.at(-1)?.id ?? 0) + 1;
    const authorUser = memoryStore.users.find((u) => u.id === userId);
    const post = {
      id: nextId,
      userId,
      authorName: authorUser?.username ?? authorUser?.email ?? 'User',
      authorAvatarUrl: authorUser?.avatarUrl ?? null,
      title,
      description,
      category,
      price,
      isCommissionAvailable,
      tags,
      imageUrl: imageUrl ?? null,
      createdAt: new Date().toISOString(),
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
    };
    memoryStore.posts.push(post);
    return post;
  }

  const result = await query(
    `INSERT INTO posts (
      user_id, title, description, category, price, is_commission_available, tags, image_url
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7::jsonb, $8
    )
    RETURNING
      id,
      user_id AS "userId",
      (
        SELECT COALESCE(NULLIF(username, ''), split_part(email, '@', 1))
        FROM users
        WHERE id = $1
      ) AS "authorName",
      (
        SELECT avatar_url FROM users WHERE id = $1
      ) AS "authorAvatarUrl",
      title,
      description,
      category,
      price,
      is_commission_available AS "isCommissionAvailable",
      tags,
      image_url AS "imageUrl",
      created_at AS "createdAt",
      0::int AS "likeCount",
      0::int AS "commentCount",
      FALSE AS "likedByMe"`,
    [
      userId,
      title,
      description,
      category,
      price,
      isCommissionAvailable,
      JSON.stringify(tags ?? []),
      imageUrl ?? null,
    ],
  );
  return result.rows[0];
}

async function findPostVisibleToUser(postId, userId) {
  if (!isPostgresEnabled()) {
    const post = memoryStore.posts.find((p) => p.id === postId);
    if (!post) return null;
    const author = memoryStore.users.find((u) => u.id === post.userId);
    const authorPrivate = Boolean(author?.isPrivate);
    const followsAuthor = memoryStore.follows.some(
      (f) => f.followerId === userId && f.followedId === post.userId,
    );
    const visible =
      post.userId === userId || !authorPrivate || followsAuthor;
    return visible ? post : null;
  }

  const result = await query(
    `SELECT p.id, p.user_id AS "userId"
     FROM posts p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = $1
       AND (
         p.user_id = $2
         OR COALESCE(u.is_private, FALSE) = FALSE
         OR EXISTS (
           SELECT 1 FROM follows f
           WHERE f.follower_id = $2 AND f.followed_id = p.user_id
         )
       )
     LIMIT 1`,
    [postId, userId],
  );
  return result.rows[0] || null;
}

async function likePost(postId, userId) {
  if (!isPostgresEnabled()) {
    const exists = memoryStore.postLikes.some((l) => l.postId === postId && l.userId === userId);
    if (exists) {
      return false;
    }
    memoryStore.postLikes.push({ postId, userId, createdAt: new Date().toISOString() });
    return true;
  }
  const result = await query(
    `INSERT INTO post_likes (post_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (post_id, user_id) DO NOTHING
     RETURNING post_id`,
    [postId, userId],
  );
  return result.rowCount > 0;
}

async function unlikePost(postId, userId) {
  if (!isPostgresEnabled()) {
    const idx = memoryStore.postLikes.findIndex((l) => l.postId === postId && l.userId === userId);
    if (idx !== -1) memoryStore.postLikes.splice(idx, 1);
    return;
  }
  await query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
}

async function addPostComment(postId, userId, comment) {
  if (!isPostgresEnabled()) {
    const nextId = (memoryStore.postComments.at(-1)?.id ?? 0) + 1;
    memoryStore.postComments.push({
      id: nextId,
      postId,
      userId,
      comment,
      createdAt: new Date().toISOString(),
    });
    return;
  }
  await query(
    `INSERT INTO post_comments (post_id, user_id, comment)
     VALUES ($1, $2, $3)`,
    [postId, userId, comment],
  );
}

async function listPostComments(postId) {
  if (!isPostgresEnabled()) {
    return memoryStore.postComments
      .filter((c) => c.postId === postId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((c) => {
        const user = memoryStore.users.find((u) => u.id === c.userId);
        const authorName = user?.username || user?.email || 'User';
        return {
          id: c.id,
          postId: c.postId,
          userId: c.userId,
          authorName,
          authorAvatarUrl: user?.avatarUrl ?? null,
          comment: c.comment,
          createdAt: c.createdAt,
        };
      });
  }

  const result = await query(
    `SELECT
      c.id,
      c.post_id AS "postId",
      c.user_id AS "userId",
      COALESCE(NULLIF(u.username, ''), split_part(u.email, '@', 1)) AS "authorName",
      u.avatar_url AS "authorAvatarUrl",
      c.comment,
      c.created_at AS "createdAt"
    FROM post_comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.post_id = $1
    ORDER BY c.created_at ASC, c.id ASC`,
    [postId],
  );
  return result.rows;
}

module.exports = {
  listArtists,
  listProjects,
  createProject,
  updateProjectStatus,
  listConversations,
  listConversationsByUser,
  listMessages,
  createMessage,
  upsertConversationRead,
  unreadMessagesCountForUser,
  updateConversationLastMessage,
  isUserInConversation,
  findConversationBetweenUsers,
  findConversationById,
  findConversationByIdForUser,
  createConversation,
  listConversationParticipantIdsExcluding,
  listEvents,
  createEvent,
  addEventParticipant,
  listEventParticipants,
  isUserEventParticipant,
  findEventById,
  updateEventById,
  deleteEventById,
  listFeedPosts,
  listMyPosts,
  listPostsByTag,
  listPostsForProfile,
  createPost,
  findPostVisibleToUser,
  likePost,
  unlikePost,
  addPostComment,
  listPostComments,
};
