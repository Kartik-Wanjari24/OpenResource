// OpenResource - Member 2 Storage Adapter Entry Point
import dotenv from 'dotenv';
import type { IStorageAdapter } from '../types/storage.interface.js';
import { InMemoryStorageAdapter } from './memory.adapter.js';
import { PostgresStorageAdapter } from './postgres.adapter.js';
import { AppError, ErrorCode } from '../utils/errors.js';

dotenv.config();

export type StorageMode = 'memory' | 'postgres';

export class StorageAdapter {
  private static activeAdapter: IStorageAdapter | null = null;
  private static forcedMode: StorageMode | null = null;

  /**
   * Determine active storage mode based on environment variables or explicit configuration
   */
  public static getMode(): StorageMode {
    if (this.forcedMode) {
      return this.forcedMode;
    }
    const envMode = process.env.STORAGE_MODE?.toLowerCase();
    if (envMode === 'postgres') return 'postgres';
    if (envMode === 'memory') return 'memory';

    // If DATABASE_URL is defined, default to postgres mode
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') {
      return 'postgres';
    }

    return 'memory';
  }

  /**
   * Explicitly set storage mode for testing or runtime configuration
   */
  public static setMode(mode: StorageMode | null): void {
    if (this.forcedMode !== mode) {
      this.forcedMode = mode;
      this.activeAdapter = null;
    }
  }

  /**
   * Retrieve active storage adapter instance (singleton)
   */
  public static getInstance(): IStorageAdapter {
    if (!this.activeAdapter) {
      const mode = this.getMode();

      if (mode === 'postgres') {
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl || dbUrl.trim() === '') {
          throw new AppError(
            500,
            ErrorCode.INTERNAL_ERROR,
            'Storage configured as postgres mode, but DATABASE_URL environment variable is missing.'
          );
        }

        try {
          this.activeAdapter = PostgresStorageAdapter.getInstance({
            connectionString: dbUrl,
          });
          console.log('[StorageAdapter] Initialized PostgreSQL persistence mode');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new AppError(
            500,
            ErrorCode.INTERNAL_ERROR,
            `Failed to initialize PostgreSQL storage: ${message}`
          );
        }
      } else {
        this.activeAdapter = InMemoryStorageAdapter.getInstance();
      }
    }

    return this.activeAdapter;
  }

  /**
   * Set custom adapter instance (e.g. for mocked unit testing)
   */
  public static setInstance(adapter: IStorageAdapter | null): void {
    this.activeAdapter = adapter;
  }

  /**
   * Cleanly close active connections
   */
  public static async close(): Promise<void> {
    if (this.activeAdapter && typeof this.activeAdapter.close === 'function') {
      await this.activeAdapter.close();
    }
    this.activeAdapter = null;
    this.forcedMode = null;
  }
}

export { InMemoryStorageAdapter, PostgresStorageAdapter };
export type { IStorageAdapter };
