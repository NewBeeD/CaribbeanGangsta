/**
 * Zustand store bridging the pure engine <-> React, plus save/load, cross-run
 * meta, and leaderboard adapters (local-first; remote is a drop-in stub).
 */

export {
  useGameStore,
  useGameState,
  useOfflineReport,
  useMeta,
  useRunEnd,
  AUTOSAVE_SLOT,
} from './gameStore';
export type { GameStore, BuildStashIntent, RunEndSummary } from './gameStore';

export {
  LEADERBOARD_VERSION,
  LEADERBOARD_MAX_ENTRIES,
  seasonKey,
  entryFromRunEnd,
  MemoryStorage,
  LocalLeaderboard,
  RemoteLeaderboard,
} from './leaderboard';
export type {
  Leaderboard,
  LeaderboardBoard,
  LeaderboardEntry,
  KeyValueStorage,
  LocalLeaderboardOptions,
} from './leaderboard';

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
