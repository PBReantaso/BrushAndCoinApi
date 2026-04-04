# Database Migrations

This directory contains all database migrations for the Brush & Coin API.

## Structure

- **schema/** — DDL migrations (CREATE TABLE, ALTER TABLE, indexes, constraints)
- **data/** — DML migrations (INSERT, UPDATE, seed data for reference tables)
- **run-migrations.js** — Main migration runner script

## Migration Files

Name migrations with the format: `NNN_descriptive_name.sql`

- **NNN** — Three-digit sequential number (001, 002, 003, etc.)
- **descriptive_name** — Brief description of the change

### Examples

**Schema migrations:**
```
001_init_users_table.sql
002_create_projects_table.sql
003_add_username_to_users.sql
```

**Data migrations:**
```
001_seed_roles.sql
002_seed_default_categories.sql
```

## Running Migrations

```bash
npm run migrate
```

This will:
1. Run all numbered schema migrations in order
2. Run all numbered data migrations in order
3. Maintain an internal tracking table to avoid re-running migrations

## Adding a New Migration

1. Schema change → Create `schema/NNN_description.sql`
2. Reference data → Create `data/NNN_description.sql`
3. Run `npm run migrate` to execute

## Best Practices

- **Keep migrations idempotent**: Use `CREATE TABLE IF NOT EXISTS`, `DROP IF EXISTS`, etc.
- **Be descriptive**: Use clear SQL comments for complex changes
- **Test locally**: Always test migrations on a local database first
- **One logical change per file**: Don't combine unrelated DDL/DML
- **Include rollback comments**: Document how to manually undo if needed

## Current Structure

The migration runner reads from both directories and executes in order:
1. All schema migrations (001, 002, 003, ...)
2. All data migrations (001, 002, 003, ...)

This ensures tables exist before seed data is inserted.
