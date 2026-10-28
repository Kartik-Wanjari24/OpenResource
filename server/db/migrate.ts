import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
import { KNOWN_PERSONAS } from '../middleware/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(customPool?: pg.Pool): Promise<{ applied: string[]; alreadyApplied: string[] }> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl && !customPool) {
    throw new Error(
      'DATABASE_URL environment variable is missing. Cannot run PostgreSQL migrations without a configured database URL.'
    );
  }

  const pool = customPool || new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  try {
    // 1. Create migration tracker table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Discover migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found at: ${migrationsDir}`);
    }

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    // 3. Apply pending migrations
    for (const file of migrationFiles) {
      const checkRes = await client.query('SELECT version FROM schema_migrations WHERE version = $1', [file]);
      if (checkRes.rows.length > 0) {
        alreadyApplied.push(file);
        continue;
      }

      console.log(`[DB Migrate] Applying migration: ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
        console.log(`[DB Migrate] ✓ Migration applied successfully: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[DB Migrate] ✕ Migration failed for ${file}. Rolled back transaction.`, err);
        throw err;
      }
    }

    // 4. Seed Canonical Initial Personas & Lab Resources (Idempotent)
    await seedCanonicalData(client);

    return { applied, alreadyApplied };
  } finally {
    client.release();
    if (!customPool) {
      await pool.end();
    }
  }
}

async function seedCanonicalData(client: pg.PoolClient): Promise<void> {
  // Seed Users
  for (const user of Object.values(KNOWN_PERSONAS)) {
    await client.query(
      `
      INSERT INTO users (id, name, email, role, phone, student_id, badges)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        badges = EXCLUDED.badges;
    `,
      [user.id, user.name, user.email, user.role, user.phone || null, user.studentId || null, user.badges || []]
    );
  }

  // Seed Resources
  const defaultResources = [
    {
      id: 'res_3d_prusa',
      name: '3D Printer - Prusa MK4',
      ownerId: 'demo_lab_owner',
      category: 'THREE_D_PRINTING',
      weeklyUsageCap: 10,
      requiredBadgeIds: ['badge_safety_101', 'badge_3d_basics'],
    },
    {
      id: 'res_laser_epilog',
      name: 'Laser Cutter - Epilog Fusion Pro',
      ownerId: 'demo_lab_owner',
      category: 'LASER_CUTTING',
      weeklyUsageCap: 5,
      requiredBadgeIds: ['badge_safety_101', 'badge_laser_cert'],
    },
    {
      id: 'res_cnc_tormach',
      name: 'CNC Mill - Tormach 1100',
      ownerId: 'demo_lab_owner',
      category: 'CNC_MACHINING',
      weeklyUsageCap: 8,
      requiredBadgeIds: ['badge_safety_101', 'badge_cnc_basics'],
    },
    {
      id: 'res_3d_bambu',
      name: '3D Printer - Bambu Lab X1',
      ownerId: 'demo_lab_owner',
      category: 'THREE_D_PRINTING',
      weeklyUsageCap: 15,
      requiredBadgeIds: ['badge_safety_101', 'badge_3d_basics'],
    },
    {
      id: 'res_elec_bench',
      name: 'Electronics Lab Bench',
      ownerId: 'demo_lab_owner',
      category: 'ELECTRONICS_LAB',
      weeklyUsageCap: 20,
      requiredBadgeIds: ['badge_safety_101'],
    },
  ];

  for (const res of defaultResources) {
    await client.query(
      `
      INSERT INTO resources (id, name, owner_id, category, weekly_usage_cap, required_badge_ids)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        weekly_usage_cap = EXCLUDED.weekly_usage_cap,
        required_badge_ids = EXCLUDED.required_badge_ids;
    `,
      [res.id, res.name, res.ownerId, res.category, res.weeklyUsageCap, res.requiredBadgeIds]
    );
  }
}

// Run CLI directly if executed
const isDirectCli = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('server/db/migrate.ts');
if (isDirectCli) {
  runMigrations()
    .then(({ applied, alreadyApplied }) => {
      console.log(`[DB Migrate] Migration run complete. Applied: ${applied.length}, Skipped: ${alreadyApplied.length}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[DB Migrate] Fatal migration error:', err);
      process.exit(1);
    });
}
