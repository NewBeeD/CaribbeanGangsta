/**
 * Zustand store bridging the pure engine <-> React, plus save/load and
 * leaderboard adapters. Leaderboard adapters arrive in Prompt 23.
 */

export {
  useGameStore,
  useGameState,
  useOfflineReport,
  AUTOSAVE_SLOT,
} from './gameStore';
export type { GameStore, BuildStashIntent } from './gameStore';

export {
  LocalSaveStore,
  CloudSaveStore,
  NotImplementedError,
  migrateEnvelope,
  MIGRATIONS,
} from './persistence';
export type {
  SaveStore,
  SlotMeta,
  Migration,
  LocalSaveStoreOptions,
} from './persistence';

export {
  META_VERSION,
  emptyMeta,
  bankScore,
  LocalMetaProgressStore,
  CloudMetaProgressStore,
} from './metaProgress';
export type {
  MetaProgress,
  MetaProgressStore,
  LocalMetaProgressStoreOptions,
} from './metaProgress';
