/**
 * Telemetry public API (Prompt 25; design/06): the typed event bus + sinks, the
 * pure tick-diff derivation and audits, the store-side instrumentation helpers,
 * and the headless batch-sim harness. Local-first, no PII; the remote sink is a
 * stub nothing depends on.
 */

export {
  TelemetryBus,
  ConsoleSink,
  LocalSink,
  RemoteSink,
} from './bus';
export type {
  TelemetryEventMap,
  TelemetryEventName,
  TelemetryEvent,
  AnyTelemetryEvent,
  TelemetrySink,
  OddsSurface,
} from './bus';

export {
  deriveTickEvents,
  fairnessReport,
  auditOfflineFreeze,
  FAIRNESS_MIN_SAMPLES,
  SESSION_END_FLAG,
} from './derive';
export type {
  DerivedEvent,
  FairnessReport,
  FairnessSurfaceReport,
  OfflineFreezeAudit,
} from './derive';

export {
  telemetry,
  localSink,
  resetTelemetrySession,
  trackSessionStart,
  trackRunStarted,
  trackDeal,
  trackFront,
  trackOfflineSettled,
  trackReturnToAllocate,
  trackBorrow,
  trackRepay,
  trackBribe,
  trackOfficialHired,
  trackShipmentLaunched,
  trackRunEnded,
  trackCardChoice,
  trackTick,
  isD1ReturnProxy,
} from './instrument';

export { runBatchSim, simulateRun, hasFirstMove, COCAINE_SHARE_TARGET } from './simulation';
export type { BatchSimReport, BatchSimOptions, SimRunReport, TradeMix } from './simulation';
