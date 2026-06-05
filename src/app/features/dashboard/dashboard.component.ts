import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, Observable, finalize } from 'rxjs';
import { ChartModule } from 'primeng/chart';
import { TimelineModule } from 'primeng/timeline';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import {
  DashboardService,
  CombinedSyncStatus,
  ReportSyncStatus,
  PipelineStep,
  SystemHealth,
  QuotaGroup,
  SalesSummaryResult,
  InventorySnapshotResult,
  ForecastSnapshotResult,
  SalesAggregateRow,
  SalesTotals,
} from '../../data/services/dashboard.service';
import { SyncTimelineComponent, SyncReportMeta } from './components/sync-timeline/sync-timeline.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule, DatePipe,
    ChartModule, TimelineModule, ProgressSpinnerModule,
    MessageModule, ButtonModule, ToastModule, TagModule, TooltipModule,
    SyncTimelineComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls:  ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  combined$: Observable<CombinedSyncStatus>;
  health$:   Observable<SystemHealth | null>;

  salesPipeline:     PipelineStep[] = [];
  inventoryPipeline: PipelineStep[] = [];
  forecastPipeline:  PipelineStep[] = [];

  isSalesRequesting     = false;
  isInventoryRequesting = false;
  isForecastRequesting  = false;

  isStoppingSales       = false;
  isStoppingInventory   = false;

  // ── Today ─────────────────────────────────────────────────────────────────
  todayStr = new Date().toISOString().split('T')[0];

  // ── Sales Manual Sync ─────────────────────────────────────────────────────
  salesSyncStart = '';
  salesSyncEnd   = '';

  // ── Inventory Manual Sync ─────────────────────────────────────────────────
  inventorySyncStart = '';
  inventorySyncEnd   = '';

  // ── Tally ─────────────────────────────────────────────────────────────────
  tallyStartDate    = '';
  tallyEndDate      = '';
  salesTally:       SalesSummaryResult      | null = null;
  salesTallyDisplayTotals: SalesTotals | null = null;
  salesTallyTotalRowCount = 0;
  salesTallySummaryRowCount = 0;
  inventoryTally:   InventorySnapshotResult | null = null;
  forecastTally:    ForecastSnapshotResult  | null = null;
  isFetchingTally   = false;
  tallyError:       string | null = null;

  salesAsinRows:     any[] = [];
  inventoryAsinRows: any[] = [];
  showAsinTable     = false;

  chartData:    any;
  chartOptions: any;

  private subs = new Subscription();

  constructor(
    private dashboardService: DashboardService,
    private messageService: MessageService,
  ) {
    this.combined$ = this.dashboardService.getCombinedStatus();
    this.health$   = this.dashboardService.getSystemHealth();
  }

  ngOnInit(): void {
    this.subs.add(
      this.combined$.subscribe(combined => {
        this.salesPipeline     = this.dashboardService.buildPipeline(combined.sales);
        this.inventoryPipeline = this.dashboardService.buildPipeline(combined.inventory);
        if (combined.forecast) {
          this.forecastPipeline = this.dashboardService.buildPipeline(combined.forecast);
        }
      }),
    );
    this.initChart();

    this.salesSyncStart     = '';
    this.salesSyncEnd       = '';
    this.inventorySyncStart = '';
    this.inventorySyncEnd   = '';

    const { startDate, endDate } = this.dashboardService.getLastCompletedWeekDates();
    this.tallyStartDate = startDate;
    this.tallyEndDate   = endDate;
  }

  // ── Date validation ───────────────────────────────────────────────────────

  syncDateError(start: string, end: string): string | null {
    if (!start || !end) return null;
    if (start > this.todayStr) return '• Start date is in the future';
    if (end   > this.todayStr) return '• End date cannot exceed today';
    if (start > end)           return '• Start date must be before end date';
    return null;
  }

  getAmazonWeekNumber(dateStr: string): number {
    if (!dateStr) return 0;
    const date = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
    const weekStart = new Date(date);
    weekStart.setUTCDate(date.getUTCDate() - date.getUTCDay());

    let amazonYear = date.getUTCFullYear();
    let yearStart = this.firstSundayOnOrAfterJanOne(amazonYear);
    if (date < yearStart) {
      amazonYear -= 1;
      yearStart = this.firstSundayOnOrAfterJanOne(amazonYear);
    }

    const diffDays = Math.floor((weekStart.getTime() - yearStart.getTime()) / 86_400_000);
    return Math.floor(diffDays / 7) + 1;
  }

  private firstSundayOnOrAfterJanOne(year: number): Date {
    const janOne = new Date(Date.UTC(year, 0, 1));
    const daysUntilSunday = (7 - janOne.getUTCDay()) % 7;
    janOne.setUTCDate(janOne.getUTCDate() + daysUntilSunday);
    return janOne;
  }

  buildSyncReportMeta(status: ReportSyncStatus, name: string, path: string): SyncReportMeta {
    let mappedStatus: 'COMPLETED' | 'RUNNING' | 'FAILED' | 'PENDING' = 'PENDING';
    if (status.lastSyncStatus === 'SUCCESS') mappedStatus = 'COMPLETED';
    else if (status.lastSyncStatus === 'IN_PROGRESS') mappedStatus = 'RUNNING';
    else if (status.lastSyncStatus === 'FAILED') mappedStatus = 'FAILED';

    let lastRun = 'Never';
    if (status.lastSyncFinishedAt || status.lastSyncStartedAt) {
      const d = new Date(status.lastSyncFinishedAt || status.lastSyncStartedAt || '');
      lastRun = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + 
                d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    let duration = '--';
    if (status.lastSyncStartedAt && status.lastSyncFinishedAt) {
      const ms = new Date(status.lastSyncFinishedAt).getTime() - new Date(status.lastSyncStartedAt).getTime();
      const s = Math.floor(ms / 1000);
      duration = s >= 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`;
    } else if (status.lastSyncStartedAt) {
      duration = 'Running...';
    }

    return {
      name,
      path,
      status: mappedStatus,
      lastRun,
      nextRun: this.dashboardService.formatNextRun(status.nextScheduledAt),
      duration,
      errorMessage: status.lastError || undefined,
      runningPeriod: status.lastSyncPeriod || null,
    };
  }

  // ── Manual Triggers ───────────────────────────────────────────────────────

  onSyncSalesNow(): void {
    this.isSalesRequesting = true;
    this.dashboardService.triggerSalesSync(this.salesSyncStart, this.salesSyncEnd).pipe(
      finalize(() => { this.isSalesRequesting = false; }),
    ).subscribe({
      next: (res: any) => {
        this.messageService.add({ severity: 'success', summary: 'Sales Sync Started', detail: res.message });
        this.salesSyncStart = '';
        this.salesSyncEnd = '';
        this.dashboardService.refreshStatus().subscribe();
      },
      error: (err: any) => {
        const detail = err.status === 409
          ? 'Sales sync is already running.'
          : err.error?.message || 'Could not initiate sales sync.';
        this.messageService.add({ severity: err.status === 409 ? 'warn' : 'error', summary: 'Sales Sync', detail });
      },
    });
  }

  onStopSalesNow(): void {
    this.isStoppingSales = true;
    this.dashboardService.cancelSalesSync().pipe(
      finalize(() => { this.isStoppingSales = false; }),
    ).subscribe({
      next: (res) => {
        this.messageService.add({
          severity: res.cancelled ? 'info' : 'warn',
          summary: 'Stop Sales Sync',
          detail: res.message,
        });
        this.dashboardService.refreshStatus().subscribe();
      },
      error: (err: any) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Stop Sales Sync',
          detail: err.error?.message || 'Could not cancel the sync.',
        });
      },
    });
  }

  onSyncInventoryNow(): void {
    this.isInventoryRequesting = true;
    this.dashboardService.triggerInventorySync(this.inventorySyncStart, this.inventorySyncEnd).pipe(
      finalize(() => { this.isInventoryRequesting = false; }),
    ).subscribe({
      next: (res: any) => {
        this.messageService.add({ severity: 'success', summary: 'Inventory Sync Started', detail: res.message });
        this.inventorySyncStart = '';
        this.inventorySyncEnd = '';
        this.dashboardService.refreshStatus().subscribe();
      },
      error: (err: any) => {
        const detail = err.status === 409
          ? 'Inventory sync is already running.'
          : err.error?.message || 'Could not initiate inventory sync.';
        this.messageService.add({ severity: err.status === 409 ? 'warn' : 'error', summary: 'Inventory Sync', detail });
      },
    });
  }

  onStopInventoryNow(): void {
    this.isStoppingInventory = true;
    this.dashboardService.cancelInventorySync().pipe(
      finalize(() => { this.isStoppingInventory = false; }),
    ).subscribe({
      next: (res) => {
        this.messageService.add({
          severity: res.cancelled ? 'info' : 'warn',
          summary: 'Stop Inventory Sync',
          detail: res.message,
        });
        this.dashboardService.refreshStatus().subscribe();
      },
      error: (err: any) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Stop Inventory Sync',
          detail: err.error?.message || 'Could not cancel the inventory sync.',
        });
      },
    });
  }

  // ── Tally ─────────────────────────────────────────────────────────────────

  onFetchTally(): void {
    if (!this.tallyStartDate || !this.tallyEndDate) return;
    if (this.syncDateError(this.tallyStartDate, this.tallyEndDate)) return;
    this.isFetchingTally   = true;
    this.tallyError        = null;
    this.salesTally        = null;
    this.salesTallyDisplayTotals = null;
    this.salesTallyTotalRowCount = 0;
    this.salesTallySummaryRowCount = 0;
    this.inventoryTally    = null;
    this.forecastTally     = null;
    this.salesAsinRows     = [];
    this.inventoryAsinRows = [];

    this.subs.add(
      this.dashboardService.getSalesSummary(this.tallyStartDate, this.tallyEndDate).subscribe({
        next:  res  => { this.setSalesTally(res); this.isFetchingTally = false; },
        error: err  => { this.tallyError = err.error?.message || 'Failed to fetch sales tally.'; this.isFetchingTally = false; },
      }),
    );
    this.subs.add(
      this.dashboardService.getInventorySnapshot(this.tallyStartDate, this.tallyEndDate).subscribe({
        next:  res  => { this.inventoryTally = res; },
        error: _err => {},
      }),
    );
    this.subs.add(
      this.dashboardService.getSalesByAsin(this.tallyStartDate, this.tallyEndDate).subscribe({
        next:  rows => { this.salesAsinRows = rows; },
        error: _err => {},
      }),
    );
  }

  onResetTallyDates(): void {
    const { startDate, endDate } = this.dashboardService.getLastCompletedWeekDates();
    this.tallyStartDate = startDate;
    this.tallyEndDate   = endDate;
  }

  private setSalesTally(summary: SalesSummaryResult): void {
    this.salesTally = summary;
    const rowsForTotals = this.rowsForSalesTotals(summary);
    this.salesTallyDisplayTotals = rowsForTotals.length > 0
      ? this.sumSalesRows(rowsForTotals, summary.totals.currency)
      : summary.totals;
    this.salesTallyTotalRowCount = rowsForTotals.length || summary.totalRowCount || summary.rowCount;
    this.salesTallySummaryRowCount = summary.summaryRowCount ?? this.salesSummaryRows(summary).length;
  }

  private rowsForSalesTotals(summary: SalesSummaryResult): SalesAggregateRow[] {
    const rows = summary.dailyAggregates ?? [];
    const dailyRows = rows.filter(row => !this.isSalesSummaryRow(row));
    return dailyRows.length > 0 ? dailyRows : rows;
  }

  private salesSummaryRows(summary: SalesSummaryResult): SalesAggregateRow[] {
    return summary.summaryRows ?? (summary.dailyAggregates ?? []).filter(row => this.isSalesSummaryRow(row));
  }

  private sumSalesRows(rows: SalesAggregateRow[], currency: string): SalesTotals {
    const totals = rows.reduce(
      (acc, row) => ({
        orderedUnits: acc.orderedUnits + Number(row.orderedUnits || 0),
        orderedRevenue: acc.orderedRevenue + Number(row.orderedRevenueAmount || 0),
        shippedUnits: acc.shippedUnits + Number(row.shippedUnits || 0),
        shippedRevenue: acc.shippedRevenue + Number(row.shippedRevenueAmount || 0),
        shippedCogs: acc.shippedCogs + Number(row.shippedCogsAmount || 0),
        customerReturns: acc.customerReturns + Number(row.customerReturns || 0),
        currency,
      }),
      { orderedUnits: 0, orderedRevenue: 0, shippedUnits: 0, shippedRevenue: 0, shippedCogs: 0, customerReturns: 0, currency },
    );
    return {
      ...totals,
      orderedRevenue: this.roundMoney(totals.orderedRevenue),
      shippedRevenue: this.roundMoney(totals.shippedRevenue),
      shippedCogs: this.roundMoney(totals.shippedCogs),
    };
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  isSalesSummaryRow(row: SalesAggregateRow): boolean {
    return row.startDate.slice(0, 10) !== row.endDate.slice(0, 10);
  }

  grossMarginPct(revenue: number, cogs: number): number {
    if (!revenue) return 0;
    return ((revenue - cogs) / revenue) * 100;
  }

  formatCurrency(amount: number, currency = 'USD'): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  }

  formatNumber(n: number): string {
    return new Intl.NumberFormat('en-US').format(n);
  }

  formatPct(n: number): string {
    return n.toFixed(2) + '%';
  }

  formatNextRun(iso: string):        string { return this.dashboardService.formatNextRun(iso); }
  formatLastRun(iso: string | null): string { return this.dashboardService.formatLastRun(iso); }
  formatTime(iso: string | null):    string { return this.dashboardService.formatTime(iso); }

  statusSeverity(s: ReportSyncStatus): 'success' | 'danger' | 'warning' | 'info' {
    if (s.isSyncing)                    return 'warning';
    if (s.lastSyncStatus === 'SUCCESS') return 'success';
    if (s.lastSyncStatus === 'FAILED')  return 'danger';
    return 'info';
  }

  statusLabel(s: ReportSyncStatus): string {
    if (s.isSyncing)                    return 'SYNCING';
    if (s.lastSyncStatus === 'SUCCESS') return 'DONE';
    if (s.lastSyncStatus === 'FAILED')  return 'FAILED';
    return 'IDLE';
  }

  quotaSeverity(g: QuotaGroup): 'success' | 'danger' | 'warning' {
    if (g.status === 'COOLDOWN')    return 'danger';
    if (g.consecutive429s > 0)      return 'warning';
    return 'success';
  }

  quotaLabel(g: QuotaGroup): string {
    if (g.status === 'COOLDOWN') return `COOLDOWN (${g.consecutive429s}x 429)`;
    if (g.consecutive429s > 0)   return `OK (${g.consecutive429s}x 429)`;
    return 'OK';
  }

  trackByGroup(i: number, g: QuotaGroup): string { return g.group; }

  initChart(): void {
    // Light-theme telemetry chart — semantic colors kept meaningful:
    // cyan-ink dashed = Amazon limit, green = our rate (matches mockup).
    const textColor = '#8298a5';
    const gridColor = '#e8edf1';
    this.chartData = {
      labels: ['1s','2s','3s','4s','5s','6s','7s','8s','9s','10s'],
      datasets: [
        {
          label: 'Amazon Limit (0.016 req/s)',
          data: Array(10).fill(0.016),
          fill: false, borderColor: '#0a7d96', borderWidth: 1.5,
          pointRadius: 0, borderDash: [7,5], tension: 0,
        },
        {
          label: 'Our Rate',
          data: Array(10).fill(0.015),
          fill: true, borderColor: '#15a06f', borderWidth: 2.5,
          backgroundColor: 'rgba(21,160,111,0.10)',
          pointRadius: 2, pointBackgroundColor: '#15a06f', tension: 0.4,
        },
      ],
    };
    this.chartOptions = {
      maintainAspectRatio: false, responsive: true,
      plugins: { legend: { display: true, labels: { color: textColor, font: { family: 'monospace', size: 10 } } } },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } },
        y: { min: 0, max: 0.02,
             ticks: { color: textColor, font: { size: 10 }, callback: (v: any) => v.toFixed(3) },
             grid: { color: gridColor } },
      },
    };
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }
}
