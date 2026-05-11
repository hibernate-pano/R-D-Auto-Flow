/**
 * WorkflowRunner — persistent, resilient stage executor with lease/heartbeat/crash-recovery.
 *
 * Architecture:
 * - A background loop polls for flows in "running" state that need processing.
 * - Each stage execution is wrapped with a lease: the runner writes lease_owner + lease_expires_at
 *   before executing, and clears them on completion.
 * - A heartbeat ticker extends lease_expires_at every HEARTBEAT_INTERVAL_MS while stages run.
 * - On startup, recoverStaleStages() finds stages left running by a crashed predecessor and
 *   transitions them to failed + waiting_manual_action so operators can retry.
 * - Only one runner instance processes a given stage at a time (enforced by lease uniqueness).
 */

import type { FlowStore } from "../types.js";
import type { RuntimeContext } from "../types.js";
import type { FlowRun, StageRun } from "@rdaf/domain";
import { nowIso } from "@rdaf/domain";
import { createLogger } from "../telemetry/logger.js";

const LEASE_TIMEOUT_MS = 30_000; // 30 seconds
const HEARTBEAT_INTERVAL_MS = 10_000; // every 10 seconds
const POLL_INTERVAL_MS = 2_000;
const STALE_GRACE_MS = 5_000; // extra time after lease expiry before marking stale

export class WorkflowRunner {
  private readonly store: FlowStore;
  private readonly log = createLogger("workflow-runner");
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly context: RuntimeContext) {
    this.store = context.store;
  }

  /** Start the background runner loop and heartbeat. */
  start(): void {
    if (this.stopped) return;
    void this.recoverStaleStages();
    this.startHeartbeat();
    void this.pollLoop();
  }

  /** Stop the runner gracefully. */
  stop(): void {
    this.stopped = true;
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ── Crash recovery ──────────────────────────────────────────────────────────

  /**
   * On startup, find all stage runs left in "running" state whose lease has expired.
   * These are orphaned from a crashed predecessor runner.
   *
   * Recovery: transition stage to "failed" + flow to "waiting_manual_action" with
   * a special error code so operators can retry.
   */
  private async recoverStaleStages(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_GRACE_MS).toISOString();

    const flows = await this.store.listFlowsAsync();
    for (const flow of flows) {
      if (flow.overallStatus !== "running") continue;
      const stageRuns = await this.store.listStageRunsAsync(flow.id);
      for (const sr of stageRuns) {
        if (sr.status !== "running") continue;
        if (!sr.leaseExpiresAt) continue;
        // Treat as stale only if lease expired before (now - grace)
        if (new Date(sr.leaseExpiresAt) > new Date(cutoff)) continue;

        const recovered: StageRun = {
          ...sr,
          status: "failed",
          finishedAt: nowIso(),
          durationMs: Math.max(1, Date.now() - Date.parse(sr.startedAt)),
          errorCode: "RUNNER_CRASHED",
          errorMessage: "Stage was left running after runner crash. Lease expired.",
          leaseOwner: null,
          leaseExpiresAt: null,
          lastHeartbeatAt: nowIso(),
        };
        await this.store.saveStageRunAsync(flow.id, recovered);

        const updatedFlow: FlowRun = {
          ...flow,
          overallStatus: "waiting_manual_action",
          manualActionRequired: true,
          manualActionType: "retry_stage",
          blockingReasonCode: "RUNNER_CRASHED",
          blockingReasonMessage: "Stage runner crashed during execution. Please retry.",
          updatedAt: nowIso(),
        };
        await this.store.saveFlowAsync(updatedFlow);
        this.log.warn({ flowId: flow.id, stageName: sr.stageName }, "recovered stale stage");
      }
    }
  }

  // ── Heartbeat ───────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Periodically extend lease_expires_at for all currently-executing stages.
   * Prevents lease expiry during long-running connector calls.
   */
  private async sendHeartbeat(): Promise<void> {
    const flows = await this.store.listFlowsAsync();
    for (const flow of flows) {
      if (flow.overallStatus !== "running") continue;
      const stageRuns = await this.store.listStageRunsAsync(flow.id);
      for (const sr of stageRuns) {
        if (sr.status !== "running" || !sr.leaseOwner) continue;
        const updated: StageRun = {
          ...sr,
          leaseExpiresAt: new Date(Date.now() + LEASE_TIMEOUT_MS).toISOString(),
          lastHeartbeatAt: nowIso(),
        };
        await this.store.saveStageRunAsync(flow.id, updated);
      }
    }
  }

  // ── Main polling loop ──────────────────────────────────────────────────────

  private async pollLoop(): Promise<void> {
    if (this.stopped) return;

    try {
      await this.pickUpRunnableFlow();
    } catch (err) {
      this.log.error({ err }, "poll error");
    }

    if (!this.stopped) {
      this.pollTimer = setTimeout(() => void this.pollLoop(), POLL_INTERVAL_MS);
    }
  }

  /**
   * Find one "running" flow that is not blocked on manual action,
   * acquire its lease, execute its current stage, release lease.
   */
  private async pickUpRunnableFlow(): Promise<void> {
    const flows = await this.store.listFlowsAsync();
    const runnable = flows.find(
      (f) =>
        f.overallStatus === "running" &&
        !f.manualActionRequired &&
        f.currentStage !== "completed",
    );

    if (!runnable) return;
    await this.executeWithLease(runnable);
  }

  // ── Lease-guarded stage execution ──────────────────────────────────────────

  private async executeWithLease(flow: FlowRun): Promise<void> {
    const stageRuns = await this.store.listStageRunsAsync(flow.id);
    const latestForStage = stageRuns
      .filter((sr) => sr.stageName === flow.currentStage)
      .sort((a, b) => b.attemptNo - a.attemptNo)[0];

    // Skip if another runner holds a live lease.
    if (
      latestForStage &&
      latestForStage.status === "running" &&
      latestForStage.leaseOwner &&
      latestForStage.leaseExpiresAt &&
      new Date(latestForStage.leaseExpiresAt) > new Date()
    ) {
      return;
    }

    const now = nowIso();
    const leaseHolder = `runner:${process.pid}`;
    const attemptNo = latestForStage ? latestForStage.attemptNo : 1;
    const stageRun: StageRun = {
      id: latestForStage?.id ?? `tmp-${Date.now()}`,
      stageName: flow.currentStage,
      status: "running",
      attemptNo,
      startedAt: latestForStage?.startedAt ?? now,
      finishedAt: null,
      durationMs: null,
      errorCode: null,
      errorMessage: null,
      requiresManualAction: false,
      manualActionType: null,
      leaseOwner: leaseHolder,
      leaseExpiresAt: new Date(Date.now() + LEASE_TIMEOUT_MS).toISOString(),
      lastHeartbeatAt: now,
    };

    await this.store.saveStageRunAsync(flow.id, stageRun);

    // Verify we won the lease race.
    const refetch = await this.store.listStageRunsAsync(flow.id);
    const refetchStage = refetch
      .filter((sr) => sr.stageName === flow.currentStage)
      .sort((a, b) => b.attemptNo - a.attemptNo)[0];

    if (
      refetchStage &&
      refetchStage.leaseOwner !== leaseHolder &&
      refetchStage.leaseExpiresAt &&
      new Date(refetchStage.leaseExpiresAt) > new Date()
    ) {
      // Lost the race — another runner got it first.
      return;
    }

    try {
      await this.runStageForFlow(flow.id);
    } finally {
      // Release the lease.
      const postExec = await this.store.listStageRunsAsync(flow.id);
      const myStage = postExec
        .filter((sr) => sr.stageName === flow.currentStage)
        .sort((a, b) => b.attemptNo - a.attemptNo)[0];

      if (myStage && myStage.leaseOwner === leaseHolder) {
        await this.store.saveStageRunAsync(flow.id, {
          ...myStage,
          leaseOwner: null,
          leaseExpiresAt: null,
        });
      }
    }
  }

  /**
   * Run the current stage for a flow. Delegates to FlowService.
   */
  private async runStageForFlow(flowRunId: string): Promise<void> {
    // Import here to avoid circular dependency at module load time.
    const { FlowService } = await import("../flow-service.js");
    const service = new FlowService(this.context);
    await service.executeStageForRunner(flowRunId);
  }
}
