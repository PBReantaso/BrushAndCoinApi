# Migration Quick Start

## Overview

The migration system has two separate migration tracks:

1. **Schema migrations** (`db/migrations/schema/`)
   - Database structure changes (CREATE TABLE, ALTER TABLE, indexes, constraints)
   - Execute first

2. **Data migrations** (`db/migrations/data/`)
   - Reference data, seed data, lookup tables
   - Execute after schema migrations

3. **Legacy migrations** (`db/migrations/`)
   - Existing migrations in the root (for backward compatibility)

## Running Migrations

```bash
npm run migrate
```

This command:
- Reads `db/migrations/schema/` migrations
- Reads `db/migrations/data/` migrations
- Reads legacy `.sql` files in `db/migrations/`
- Tracks which have been executed in the `schema_migrations` table
- Skips already-executed migrations
- Executes only new migrations in order

## Creating a New Schema Migration

Create a file: `db/migrations/schema/NNN_description.sql`

```sql
-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
```

**Naming convention:** `NNN_descriptive_name.sql`
- NNN = 3-digit number (001, 002, 003...)
- descriptive_name = brief description of change

## Creating a New Data Migration

Create a file: `db/migrations/data/NNN_description.sql`

```sql
-- Seed role types
INSERT INTO roles (name, description)
VALUES 
  ('artist', 'Artists can post and take commissions'),
  ('patron', 'Patrons can view and commission artists')
ON CONFLICT (name) DO NOTHING;
```

## Important Notes

✅ **Always use IF NOT EXISTS / IF EXISTS** to make migrations idempotent
✅ **Use ON CONFLICT DO NOTHING** for seed data inserts
✅ **Keep migrations small and focused** — one logical change per file
✅ **Test migrations locally** before pushing to production
✅ **Never modify executed migrations** — create new ones for changes
✅ **Add comments** explaining the purpose of the migration

## Viewing Migration History

Check which migrations have been executed:

```sql
SELECT * FROM schema_migrations ORDER BY executed_at;
```

## Troubleshooting

**Error: "Unknown column" or "Table doesn't exist"**
- Verify schema migrations execute before data migrations
- Check file names are numbered correctly (001, 002, 003...)

**Migration ran twice**
- Check the migration filename in `schema_migrations` table
- The migration tracking prevents re-execution

**Need to revert a migration**
- Currently, migrations are forward-only
- Create a new migration file to undo the change
- Example: `003_undo_previous_change.sql`

## File Organization

```
db/
├── migrations/
│   ├── schema/                    # DDL migrations
│   │   ├── 001_init_users.sql
│   │   ├── 002_create_projects.sql
│   │   └── README.md
│   ├── data/                      # DML migrations  
│   │   ├── 001_seed_roles.sql
│   │   ├── 002_seed_categories.sql
│   │   └── README.md
│   ├── 001_init.sql              # Legacy migrations
│   ├── 002_seed.sql
│   ├── ...
│   └── README.md
└── schema.sql                     # Optional: Full schema dump
```

---

For more details, see `README.md` in the migrations folder.
