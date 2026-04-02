const fs = require('fs/promises');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run migrations.');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    // Clear demo conversations that users shouldn't see
    await client.query(`
      DELETE FROM messages WHERE conversation_id IN (
        SELECT id FROM conversations WHERE name IN ('Ana Santos', 'Local Café', 'Event Organizer', 'Demo Chat')
      );
      DELETE FROM conversation_participants WHERE conversation_id IN (
        SELECT id FROM conversations WHERE name IN ('Ana Santos', 'Local Café', 'Event Organizer', 'Demo Chat')
      );
      DELETE FROM conversations WHERE name IN ('Ana Santos', 'Local Café', 'Event Organizer', 'Demo Chat');
    `);
    console.log('Cleared demo conversations');

    // Handle username conflicts before applying migrations
    await client.query(`
      -- Drop the unique constraint if it exists
      DROP INDEX IF EXISTS users_username_lower_unique;
      
      -- Update existing users to have unique usernames
      UPDATE users SET username = LOWER(SPLIT_PART(email, '@', 1)) || '_' || id::text 
      WHERE username IS NULL OR TRIM(username) = '';
      
      -- Ensure all usernames are unique by appending ID to duplicates
      UPDATE users SET username = username || '_' || id::text 
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(username)) ORDER BY id) as rn
          FROM users 
          WHERE TRIM(COALESCE(username, '')) <> ''
        ) t WHERE rn > 1
      );
    `);
    console.log('Handled username conflicts');

    const migrationsDir = path.resolve(__dirname, '../db/migrations');
    const files = (await fs.readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, 'utf8');
      await client.query(sql);
      console.log(`Applied migration: ${file}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
