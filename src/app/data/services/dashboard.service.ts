import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, timer, of, combineLatest } from 'rxjs';
import { switchMap, catchError, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

// ─── Phase 3: Data Tally Types ────────────────────────────────────────────────

export interface SalesTotals {
  orderedUnits:    number;
  orderedRevenue:  number;
  shippedUnits:    number;
  shippedRevenue:  number;
  shippedCogs:     number;
  customerReturns: number;
  currency:        string;
}

export interface SalesAggregateRow {
  startDate: string;
  endDate: string;
  customerReturns: number;
  orderedRevenueAmount: number;
  orderedRevenueCurrency: string;
  orderedUnits: number;
  shippedCogsAmount: number;
  shippedCogsCurrency: string;
  shippedRevenueAmount: number;
  shippedRevenueCurrency: string;
  shippedUnits: number;
}

export interface SalesSummaryResult {
  period:          { startDate: string; endDate: string };
  dailyAggregates: SalesAggregateRow[];
  summaryRows?:    SalesAggregateRow[];
  totals:          SalesTotals;
  rowCount:        number;
  totalRowCount?:   number;
  summaryRowCount?: number;
}

export interface InventorySnapshotSummary {
  totalAsins:           number;
  totalSellableUnits:   number;
  totalUnsellableUnits: number;
  avgOosRatePct:        number;
  totalOpenPoUnits:     number;
}

export interface ForecastSnapshotResult {
  startDate:              string;
  endDate:                string;
  totalAsins:             number;
  totalMeanForecastUnits: number;
  totalP70Units:          number;
  totalP80Units:          number;
  totalP90Units:          number;
  rows:                   any[];
}

export interface InventorySnapshotResult {
  period:    { startDate: string; endDate: string };
  records:   any[];
  summary:   InventorySnapshotSummary;
  rowCount:  number;
}

// ─── Sync Stage ───────────────────────────────────────────────────────────────

export enum SyncStage {
  IDLE               = 'IDLE',
  REQUESTING_REPORT  = 'REQUESTING_REPORT',
  REPORT_IN_QUEUE    = 'REPORT_IN_QUEUE',
  REPORT_IN_PROGRESS = 'REPORT_IN_PROGRESS',
  FETCHING_DOCUMENT  = 'FETCHING_DOCUMENT',
  DOWNLOADING_REPORT = 'DOWNLOADING_REPORT',
  PARSING_REPORT     = 'PARSING_REPORT',
  UPSERTING_DATABASE = 'UPSERTING_DATABASE',
  COMPLETED          = 'COMPLETED',
  FAILED             = 'FAILED',
}

// ─── Sync Status ──────────────────────────────────────────────────────────────

export interface ReportSyncStatus {
  reportType: 'sales' | 'inventory' | 'forecast';
  isSyncing: boolean;
  currentStage: SyncStage;
  lastSyncStartedAt:  string | null;
  lastSyncFinishedAt: string | null;
  lastSyncStatus: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS' | 'IDLE';
  lastError: string | null;
  stageTimestamps: Record<string, string>;
  lastSyncPeriod: { startDate: string; endDate: string } | null;
  lastSyncPeriods?: SchedulerWeekRange[] | null;
  nextScheduledAt: string;
}

export interface CombinedSyncStatus {
  sales:     ReportSyncStatus;
  inventory: ReportSyncStatus;
  forecast:  ReportSyncStatus;
}

// ─── Pipeline Step ────────────────────────────────────────────────────────────

export interface PipelineStep {
  label: string;
  desc:  string;
  time:  string;
  icon:  string;
  state: 'completed' | 'progress' | 'pending' | 'error';
}

// ─── Phase 2: Quota / Health ──────────────────────────────────────────────────

export interface QuotaGroup {
  group:              string;
  status:             'OK' | 'COOLDOWN' | 'UNKNOWN';
  consecutive429s:    number;
  lastSuccess:        string | null;
  last429:            string | null;
  cooldownUntil:      string | null;
  nextAllowedAt:      string | null;
  rateLimitHeader:    string | null;
  calculatedMinDelay: string | null;
}

export interface SchedulerWeekRange {
  amazonYear: number;
  weekNumber: number;
  label: string;
  startDate: string;
  endDate: string;
}

export interface SchedulerStatus {
  enabled: boolean;
  dayOfWeek: number;
  dayLabel: string;
  timeOfDay: string;
  timezone: string;
  scheduleLabel: string;
  nextScheduledAt: string | null;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  lastRunStatus: 'NEVER' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  lastRunError: string | null;
  lastRunWeekRanges: SchedulerWeekRange[] | null;
  updatedAt: string | null;
}

export type SalesSchedulerStatus = SchedulerStatus;
export type InventorySchedulerStatus = SchedulerStatus;

export interface SystemHealth {
  timestamp:   string;
  apiHealth: {
    status:         'OK' | 'COOLDOWN';
    total429Errors: number;
    message:        string;
  };
  rateLimiters: {
    createReport:      string;
    getReport:         string;
    getReportDocument: string;
    concurrency:       string;
  };
  quotaGroups: QuotaGroup[];
  salesScheduler: SalesSchedulerStatus;
  inventoryScheduler: InventorySchedulerStatus;
}

// ─── Pipeline Definitions ─────────────────────────────────────────────────────

const PIPELINE_DEFS: { stage: SyncStage; label: string; desc: string; icon: string }[] = [
  { stage: SyncStage.REQUESTING_REPORT,  label: 'REQUEST',  desc: 'Amazon createReport call', icon: 'pi pi-send' },
  { stage: SyncStage.REPORT_IN_QUEUE,    label: 'QUEUE',    desc: 'Waiting in SP-API queue', icon: 'pi pi-list' },
  { stage: SyncStage.REPORT_IN_PROGRESS, label: 'PROGRESS', desc: 'Amazon generating data', icon: 'pi pi-refresh' },
  { stage: SyncStage.FETCHING_DOCUMENT,  label: 'METADATA', desc: 'Fetching document info', icon: 'pi pi-tag' },
  { stage: SyncStage.DOWNLOADING_REPORT, label: 'DOWNLOAD', desc: 'Streaming from S3', icon: 'pi pi-download' },
  { stage: SyncStage.PARSING_REPORT,     label: 'PARSE',    desc: 'Gunzip & JSON parse', icon: 'pi pi-file' },
  { stage: SyncStage.UPSERTING_DATABASE, label: 'UPSERT',   desc: 'Bulk database write', icon: 'pi pi-database' },
  { stage: SyncStage.COMPLETED,          label: 'DONE',     desc: 'Sync cycle finished', icon: 'pi pi-check-circle' },
];

const defaultStatus = (reportType: 'sales' | 'inventory' | 'forecast'): ReportSyncStatus => ({
  reportType, isSyncing: false,
  currentStage: SyncStage.IDLE,
  lastSyncStartedAt: null, lastSyncFinishedAt: null,
  lastSyncStatus: 'IDLE', lastError: null,
  stageTimestamps: {}, lastSyncPeriod: null, nextScheduledAt: '',
});

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DashboardService {

  private combinedSubject = new BehaviorSubject<CombinedSyncStatus>({
    sales:     defaultStatus('sales'),
    inventory: defaultStatus('inventory'),
    forecast:  defaultStatus('forecast'),
  });

  private healthSubject = new BehaviorSubject<SystemHealth | null>(null);

  constructor(private http: HttpClient) {
    this.startStatusPolling();   // every 5s — sync status
    this.startHealthPolling();   // every 15s — quota health (less frequent)
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  private startStatusPolling(): void {
    timer(0, 5000).pipe(
      switchMap(() =>
        this.http.get<CombinedSyncStatus>(`${environment.apiUrl}/sync/status`).pipe(
          catchError(err => { console.error('[Status poll]', err); return of(null); }),
        ),
      ),
      tap(s => { if (s) this.combinedSubject.next(s); }),
    ).subscribe();
  }

  private startHealthPolling(): void {
    timer(500, 15000).pipe(
      switchMap(() =>
        this.http.get<SystemHealth>(`${environment.apiUrl}/sync/health`).pipe(
          catchError(err => { console.error('[Health poll]', err); return of(null); }),
        ),
      ),
      tap(h => { if (h) this.healthSubject.next(h); }),
    ).subscribe();
  }

  // ── Observables ───────────────────────────────────────────────────────────

  getCombinedStatus(): Observable<CombinedSyncStatus> { return this.combinedSubject.asObservable(); }
  getSystemHealth():   Observable<SystemHealth | null>  { return this.healthSubject.asObservable(); }

  refreshStatus(): Observable<CombinedSyncStatus> {
    return this.http.get<CombinedSyncStatus>(`${environment.apiUrl}/sync/status`).pipe(
      tap(s => this.combinedSubject.next(s)),
    );
  }

  refreshHealth(): Observable<SystemHealth> {
    return this.http.get<SystemHealth>(`${environment.apiUrl}/sync/health`).pipe(
      tap(h => this.healthSubject.next(h)),
    );
  }

  // ── Manual Triggers ───────────────────────────────────────────────────────

  triggerSalesSync(startDate: string, endDate: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/sync/manual/sales`, { startDate, endDate });
  }

  triggerInventorySync(startDate: string, endDate: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/sync/manual/inventory`, { startDate, endDate });
  }

  triggerForecastSync(startDate: string, endDate: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/sync/manual/forecast`, { startDate, endDate });
  }

  getSalesSchedulerStatus(): Observable<SalesSchedulerStatus> {
    return this.http.get<SalesSchedulerStatus>(`${environment.apiUrl}/sync/scheduler/sales`);
  }

  updateSalesSchedulerSettings(payload: {
    enabled: boolean;
    dayOfWeek: number;
    timeOfDay: string;
    timezone: string;
  }): Observable<SalesSchedulerStatus> {
    return this.http.put<SalesSchedulerStatus>(`${environment.apiUrl}/sync/scheduler/sales`, payload);
  }

  getInventorySchedulerStatus(): Observable<InventorySchedulerStatus> {
    return this.http.get<InventorySchedulerStatus>(`${environment.apiUrl}/sync/scheduler/inventory`);
  }

  updateInventorySchedulerSettings(payload: {
    enabled: boolean;
    dayOfWeek: number;
    timeOfDay: string;
    timezone: string;
  }): Observable<InventorySchedulerStatus> {
    return this.http.put<InventorySchedulerStatus>(`${environment.apiUrl}/sync/scheduler/inventory`, payload);
  }

  // ── Cancellation ──────────────────────────────────────────────────────────

  /** POST /sync/cancel/sales — cooperative cancel of an in-flight sales sync. */
  cancelSalesSync(): Observable<{ cancelled: boolean; message: string }> {
    return this.http.post<{ cancelled: boolean; message: string }>(
      `${environment.apiUrl}/sync/cancel/sales`, {},
    );
  }

  /** POST /sync/cancel/inventory — cooperative cancel of an in-flight inventory sync. */
  cancelInventorySync(): Observable<{ cancelled: boolean; message: string }> {
    return this.http.post<{ cancelled: boolean; message: string }>(
      `${environment.apiUrl}/sync/cancel/inventory`, {},
    );
  }

  // ── Phase 3: Data Tally ───────────────────────────────────────────────────

  /**
   * GET /reports/sales/summary?startDate=...&endDate=...
   * Returns aggregate totals for the period — use to verify against portal.
   */
  getSalesSummary(startDate: string, endDate: string): Observable<SalesSummaryResult> {
    return this.http.get<SalesSummaryResult>(
      `${environment.apiUrl}/reports/sales/summary`,
      { params: { startDate, endDate } },
    );
  }

  /**
   * GET /reports/inventory/snapshot?startDate=...&endDate=...
   * Returns per-ASIN inventory data + summary for the period.
   */
  getInventorySnapshot(startDate: string, endDate: string): Observable<InventorySnapshotResult> {
    return this.http.get<InventorySnapshotResult>(
      `${environment.apiUrl}/reports/inventory/snapshot`,
      { params: { startDate, endDate } },
    );
  }

  getForecastSnapshot(startDate: string, endDate: string): Observable<ForecastSnapshotResult> {
    return this.http.get<ForecastSnapshotResult>(
      `${environment.apiUrl}/reports/forecast/snapshot`,
      { params: { startDate, endDate } },
    );
  }

  getSalesByAsin(startDate: string, endDate: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${environment.apiUrl}/reports/sales/by-asin`,
      { params: { startDate, endDate } },
    );
  }

  getInventoryByAsin(startDate: string, endDate: string): Observable<any[]> {
    return this.http.get<any[]>(
      `${environment.apiUrl}/reports/inventory/by-asin`,
      { params: { startDate, endDate } },
    );
  }

  /** Last completed Amazon Sunday→Saturday week. */
  getLastCompletedWeekDates(): { startDate: string; endDate: string } {
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const currentWeekStart = new Date(todayUtc);
    currentWeekStart.setUTCDate(todayUtc.getUTCDate() - todayUtc.getUTCDay());
    const weekStart = new Date(currentWeekStart);
    weekStart.setUTCDate(currentWeekStart.getUTCDate() - 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    return {
      startDate: weekStart.toISOString().split('T')[0],
      endDate:   weekEnd.toISOString().split('T')[0],
    };
  }

  // ── Pipeline Builder ──────────────────────────────────────────────────────

  buildPipeline(status: ReportSyncStatus): PipelineStep[] {
    const stageList = PIPELINE_DEFS.map(d => d.stage);
    const currentIdx = stageList.indexOf(status.currentStage);

    return PIPELINE_DEFS.map(({ stage, label, desc, icon }) => {
      const idx = stageList.indexOf(stage);
      const ts  = status.stageTimestamps?.[stage];
      const time = ts
        ? new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '--:--:--';

      let state: 'completed' | 'progress' | 'pending' | 'error';
      if      (status.lastSyncStatus === 'FAILED' && status.currentStage === stage) state = 'error';
      else if (status.lastSyncStatus === 'SUCCESS') state = 'completed';
      else if (status.currentStage === stage)       state = 'progress';
      else if (currentIdx === -1 || idx > currentIdx) state = 'pending';
      else                                          state = 'completed';

      return { label, desc, time, icon, state };
    });
  }

  // ── Formatters ────────────────────────────────────────────────────────────

  formatNextRun(iso: string): string {
    if (!iso) return 'Unknown';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) + ' UTC';
  }

  formatLastRun(iso: string | null): string {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  formatTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
