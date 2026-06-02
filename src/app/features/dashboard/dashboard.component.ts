import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, Observable } from 'rxjs';
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
} from '../../data/services/dashboard.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ChartModule, TimelineModule, ProgressSpinnerModule,
    MessageModule, ButtonModule, ToastModule, TagModule, TooltipModule,
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

  // ── Manual Sync Date Range ────────────────────────────────────────────────
  syncStartDate = '';
  syncEndDate   = '';

  // ── Phase 3: Data Tally ───────────────────────────────────────────────────
  tallyStartDate    = '';
  tallyEndDate      = '';
  salesTally:       SalesSummaryResult      | null = null;
  inventoryTally:   InventorySnapshotResult | null = null;
  forecastTally:    ForecastSnapshotResult  | null = null;
  isFetchingTally   = false;
  tallyError:       string | null = null;

  // ── ASIN Drill-down ───────────────────────────────────────────────────────
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

    // Pre-fill sync date range with yesterday (1 day → minimal quota usage)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split('T')[0];
    this.syncStartDate = yStr;
    this.syncEndDate   = yStr;

    // Pre-fill tally date range with last completed week (Phase 3)
    const { startDate, endDate } = this.dashboardService.getLastCompletedWeekDates(3);
    this.tallyStartDate = startDate;
    this.tallyEndDate   = endDate;
  }

  // ── Manual Triggers ───────────────────────────────────────────────────────

  onSyncSalesNow(): void {
    this.isSalesRequesting = true;
    const startDate = this.syncStartDate || this.lastSevenDays().startDate;
    const endDate   = this.syncEndDate   || this.lastSevenDays().endDate;
    this.dashboardService.triggerSalesSync(startDate, endDate).subscribe({
      next: (res: any) => {
        this.messageService.add({ severity: 'success', summary: 'Sales Sync Started', detail: res.message });
        this.isSalesRequesting = false;
      },
      error: (err: any) => {
        const detail = err.status === 409
          ? 'Sales sync is already running.'
          : err.error?.message || 'Could not initiate sales sync.';
        this.messageService.add({ severity: err.status === 409 ? 'warn' : 'error', summary: 'Sales Sync', detail });
        this.isSalesRequesting = false;
      },
    });
  }

  onSyncInventoryNow(): void {
    this.isInventoryRequesting = true;
    const startDate = this.syncStartDate || this.lastSevenDays().startDate;
    const endDate   = this.syncEndDate   || this.lastSevenDays().endDate;
    this.dashboardService.triggerInventorySync(startDate, endDate).subscribe({
      next: (res: any) => {
        this.messageService.add({ severity: 'success', summary: 'Inventory Sync Started', detail: res.message });
        this.isInventoryRequesting = false;
      },
      error: (err: any) => {
        const detail = err.status === 409
          ? 'Inventory sync is already running.'
          : err.error?.message || 'Could not initiate inventory sync.';
        this.messageService.add({ severity: err.status === 409 ? 'warn' : 'error', summary: 'Inventory Sync', detail });
        this.isInventoryRequesting = false;
      },
    });
  }

  onSyncForecastNow(): void {
    this.isForecastRequesting = true;
    const startDate = this.syncStartDate || this.lastSevenDays().startDate;
    const endDate   = this.syncEndDate   || this.lastSevenDays().endDate;
    this.dashboardService.triggerForecastSync(startDate, endDate).subscribe({
      next: (res: any) => {
        this.messageService.add({ severity: 'success', summary: 'Forecast Sync Started', detail: res.message });
        this.isForecastRequesting = false;
      },
      error: (err: any) => {
        const detail = err.status === 409
          ? 'Forecast sync is already running.'
          : err.error?.message || 'Could not initiate forecast sync.';
        this.messageService.add({ severity: err.status === 409 ? 'warn' : 'error', summary: 'Forecast Sync', detail });
        this.isForecastRequesting = false;
      },
    });
  }

  // ── Phase 3: Data Tally ───────────────────────────────────────────────────

  onFetchTally(): void {
    if (!this.tallyStartDate || !this.tallyEndDate) return;
    this.isFetchingTally = true;
    this.tallyError      = null;
    this.salesTally      = null;
    this.inventoryTally  = null;
    this.forecastTally   = null;
    this.salesAsinRows   = [];
    this.inventoryAsinRows = [];
    this.showAsinTable   = false;

    // Sales summary
    this.subs.add(
      this.dashboardService.getSalesSummary(this.tallyStartDate, this.tallyEndDate).subscribe({
        next:  res  => { this.salesTally = res; this.checkTallyDone(); },
        error: err  => { this.tallyError = err.error?.message || 'Failed to fetch sales tally.'; this.isFetchingTally = false; },
      }),
    );
    // Inventory snapshot
    this.subs.add(
      this.dashboardService.getInventorySnapshot(this.tallyStartDate, this.tallyEndDate).subscribe({
        next:  res  => { this.inventoryTally = res; this.checkTallyDone(); },
        error: _err => { this.checkTallyDone(); },
      }),
    );
    // Forecast snapshot
    this.subs.add(
      this.dashboardService.getForecastSnapshot(this.tallyStartDate, this.tallyEndDate).subscribe({
        next:  res  => { this.forecastTally = res; this.checkTallyDone(); },
        error: _err => { this.checkTallyDone(); },
      }),
    );
    // ASIN rows
    this.subs.add(
      this.dashboardService.getSalesByAsin(this.tallyStartDate, this.tallyEndDate).subscribe({
        next:  rows => { this.salesAsinRows = rows; },
        error: _err => {},
      }),
    );
    this.subs.add(
      this.dashboardService.getInventoryByAsin(this.tallyStartDate, this.tallyEndDate).subscribe({
        next:  rows => { this.inventoryAsinRows = rows; },
        error: _err => {},
      }),
    );
  }

  toggleAsinTable(): void { this.showAsinTable = !this.showAsinTable; }

  private checkTallyDone(): void {
    if (this.salesTally !== null) this.isFetchingTally = false;
  }

  onResetTallyDates(): void {
    const { startDate, endDate } = this.dashboardService.getLastCompletedWeekDates(3);
    this.tallyStartDate = startDate;
    this.tallyEndDate   = endDate;
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

  // ── Template Helpers ──────────────────────────────────────────────────────

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
    if (g.consecutive429s > 0)   return `OK (${g.consecutive429s}x 429 history)`;
    return 'OK';
  }

  trackByGroup(i: number, g: QuotaGroup): string { return g.group; }

  private lastSevenDays(): { startDate: string; endDate: string } {
    const end   = new Date(); end.setDate(end.getDate() - 1);
    const start = new Date(end); start.setDate(end.getDate() - 6);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate:   end.toISOString().split('T')[0],
    };
  }

  initChart(): void {
    const textColor = '#64748b';
    const gridColor = 'rgba(255,255,255,0.05)';
    this.chartData = {
      labels: ['1s','2s','3s','4s','5s','6s','7s','8s','9s','10s'],
      datasets: [
        {
          label: 'Amazon Limit (0.016 req/s)',
          data: [0.016,0.016,0.016,0.016,0.016,0.016,0.016,0.016,0.016,0.016],
          fill: false, borderColor: '#3b82f6', borderWidth: 2,
          pointRadius: 0, borderDash: [5,5], tension: 0,
        },
        {
          label: 'Our Rate (Bottleneck enforced)',
          data: [0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015,0.015],
          fill: true, borderColor: '#10b981', borderWidth: 2,
          backgroundColor: 'rgba(16,185,129,0.15)',
          pointRadius: 3, pointBackgroundColor: '#10b981', tension: 0.4,
        },
      ],
    };
    this.chartOptions = {
      maintainAspectRatio: false, responsive: true,
      plugins: {
        legend: { display: true, labels: { color: textColor, font: { family: 'monospace', size: 10 } } },
      },
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
