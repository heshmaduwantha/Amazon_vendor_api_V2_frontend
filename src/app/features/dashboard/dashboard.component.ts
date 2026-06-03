import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
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
import { SyncTimelineComponent, SyncReportMeta } from './components/sync-timeline/sync-timeline.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule, DatePipe,
    ChartModule, TimelineModule, ProgressSpinnerModule,
    MessageModule, ButtonModule, ToastModule, TagModule, TooltipModule,
    SyncTimelineComponent
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

    const { startDate, endDate } = this.dashboardService.getLastCompletedWeekDates(3);
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
    const date = new Date(dateStr);
    const day = date.getDay();
    const sunday = new Date(date);
    sunday.setDate(date.getDate() - day);
    
    // Amazon 2026 Week 1 starts on 2025-12-28
    const week1Start = new Date('2025-12-28T00:00:00');
    
    const utcSunday = Date.UTC(sunday.getFullYear(), sunday.getMonth(), sunday.getDate());
    const utcWeek1 = Date.UTC(week1Start.getFullYear(), week1Start.getMonth(), week1Start.getDate());
    
    const diffDays = Math.floor((utcSunday - utcWeek1) / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7) + 1;
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
      errorMessage: status.lastError || undefined
    };
  }

  // ── Manual Triggers ───────────────────────────────────────────────────────

  onSyncSalesNow(): void {
    this.isSalesRequesting = true;
    this.dashboardService.triggerSalesSync(this.salesSyncStart, this.salesSyncEnd).subscribe({
      next: (res: any) => {
        this.messageService.add({ severity: 'success', summary: 'Sales Sync Started', detail: res.message });
        this.salesSyncStart = '';
        this.salesSyncEnd = '';
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
    this.dashboardService.triggerInventorySync(this.inventorySyncStart, this.inventorySyncEnd).subscribe({
      next: (res: any) => {
        this.messageService.add({ severity: 'success', summary: 'Inventory Sync Started', detail: res.message });
        this.inventorySyncStart = '';
        this.inventorySyncEnd = '';
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

  // ── Tally ─────────────────────────────────────────────────────────────────

  onFetchTally(): void {
    if (!this.tallyStartDate || !this.tallyEndDate) return;
    if (this.syncDateError(this.tallyStartDate, this.tallyEndDate)) return;
    this.isFetchingTally   = true;
    this.tallyError        = null;
    this.salesTally        = null;
    this.inventoryTally    = null;
    this.forecastTally     = null;
    this.salesAsinRows     = [];
    this.inventoryAsinRows = [];

    this.subs.add(
      this.dashboardService.getSalesSummary(this.tallyStartDate, this.tallyEndDate).subscribe({
        next:  res  => { this.salesTally = res; this.isFetchingTally = false; },
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
    const { startDate, endDate } = this.dashboardService.getLastCompletedWeekDates(3);
    this.tallyStartDate = startDate;
    this.tallyEndDate   = endDate;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

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
    const textColor = '#4b5563';
    const gridColor = 'rgba(255,255,255,0.04)';
    this.chartData = {
      labels: ['1s','2s','3s','4s','5s','6s','7s','8s','9s','10s'],
      datasets: [
        {
          label: 'Amazon Limit (0.016 req/s)',
          data: Array(10).fill(0.016),
          fill: false, borderColor: '#6366f1', borderWidth: 1,
          pointRadius: 0, borderDash: [4,4], tension: 0,
        },
        {
          label: 'Our Rate',
          data: Array(10).fill(0.015),
          fill: true, borderColor: '#10b981', borderWidth: 2,
          backgroundColor: 'rgba(16,185,129,0.1)',
          pointRadius: 2, pointBackgroundColor: '#10b981', tension: 0.4,
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
