#!/usr/bin/env node

/**
 * Enhanced Database Migration Runner
 * 
 * Supports:
 * - Schema migrations (db/migrations/schema/)
 * - Data migrations (db/migrations/data/)
 * - Legacy migrations in root (db/migrations/*.sql)
 * - Idempotent execution tracking
 */

const fs = require('fs/promises');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const MIGRATIONS_PATH = path.join(__dirname, '../db/migrations');
const SCHEMA_PATH = path.join(MIGRATIONS_PATH, 'schema');
const DATA_PATH = path.join(MIGRATIONS_PATH, 'data');

// Migration tracking table
const TRACKING_TABLE = 'schema_migrations';

/**
 * Initialize migration tracking table
 */
async function initTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      executed_at TIMESTAMPTZ DEFAULT NOW(),
      type TEXT DEFAULT 'legacy'
    )
  `);
}

/**
 * Read and sort migration files
 */
async function readMigrationFiles(dir) {
  try {
    const files = await fs.readdir(dir);
    return files
      .filter(f => f.endsWith('.sql'))
      .sort((a, b) => {
        const numA = parseInt(a.split('_')[0]);
        const numB = parseInt(b.split('_')[0]);
        return numA - numB;
      });
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

/**
 * Check if migration has been executed
 */
async function isMigrationExecuted(client, filename) {
  const result = await client.query(
    `SELECT 1 FROM ${TRACKING_TABLE} WHERE filename = $1`,
    [filename]
  );
  return result.rows.length > 0;
}

/**
 * Record migration execution
 */
async function recordMigration(client, filename, type = 'legacy') {
  await client.query(
    `INSERT INTO ${TRACKING_TABLE} (filename, type) VALUES ($1, $2)
     ON CONFLICT (filename) DO NOTHING`,
    [filename, type]
  );
}

/**
 * Execute a single migration file
 */
async function executeMigration(client, filePath, filename, type) {
  const sql = await fs.readFile(filePath, 'utf-8');
  console.log(`  → ${filename} (${type})`);
  
  // Split by semicolon to handle multiple statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    await client.query(statement);
  }

  await recordMigration(client, filename, type);
}

/**
 * Run all migrations
 */
async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    console.log('🔄 Initializing migration tracking...');
    await initTrackingTable(client);

    console.log('\n📋 Running schema migrations...');
    const schemaMigrations = await readMigrationFiles(SCHEMA_PATH);
    for (const file of schemaMigrations) {
      const executed = await isMigrationExecuted(client, file);
      if (!executed) {
        await executeMigration(client, path.join(SCHEMA_PATH, file), file, 'schema');
      } else {
        console.log(`  ✓ ${file} (already executed)`);
      }
    }

    console.log('\n📋 Running data migrations...');
    const dataMigrations = await readMigrationFiles(DATA_PATH);
    for (const file of dataMigrations) {
      const executed = await isMigrationExecuted(client, file);
      if (!executed) {
        await executeMigration(client, path.join(DATA_PATH, file), file, 'data');
      } else {
        console.log(`  ✓ ${file} (already executed)`);
      }
    }

    console.log('\n📋 Running legacy migrations...');
    const legacyMigrations = await readMigrationFiles(MIGRATIONS_PATH);
    const legacyRoot = legacyMigrations.filter(f => 
      !f.includes('schema') && !f.includes('data') && f.endsWith('.sql')
    );
    
    for (const file of legacyRoot) {
      const executed = await isMigrationExecuted(client, file);
      if (!executed) {
        await executeMigration(client, path.join(MIGRATIONS_PATH, file), file, 'legacy');
      } else {
        console.log(`  ✓ ${file} (already executed)`);
      }
    }

    console.log('\n✅ Migrations completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  runMigrations().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runMigrations };
