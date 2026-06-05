import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription, finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import {
  CombinedSyncStatus,
  DashboardService,
  InventorySchedulerStatus,
  ReportSyncStatus,
  SalesSchedulerStatus,
  SchedulerStatus,
  SystemHealth,
} from '../../data/services/dashboard.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, ToastModule],
  providers: [MessageService],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit, OnDestroy {
  combined$: Observable<CombinedSyncStatus>;
  health$: Observable<SystemHealth | null>;

  activeWeeklyTab: 'sales' | 'inventory' = 'sales';
  weekdayOptions = [
    { label: 'Sunday', value: 0 },
    { label: 'Monday', value: 1 },
    { label: 'Tuesday', value: 2 },
    { label: 'Wednesday', value: 3 },
    { label: 'Thursday', value: 4 },
    { label: 'Friday', value: 5 },
    { label: 'Saturday', value: 6 },
  ];

  salesScheduler: SalesSchedulerStatus | null = null;
  inventoryScheduler: InventorySchedulerStatus | null = null;

  salesSchedulerEnabled = true;
  salesSchedulerDayOfWeek = 3;
  salesSchedulerTimeOfDay = '22:00';
  salesSchedulerTimezone = 'America/New_York';
  isSavingSalesScheduler = false;
  salesSchedulerFormTouched = false;

  inventorySchedulerEnabled = true;
  inventorySchedulerDayOfWeek = 0;
  inventorySchedulerTimeOfDay = '22:00';
  inventorySchedulerTimezone = 'America/New_York';
  isSavingInventoryScheduler = false;
  inventorySchedulerFormTouched = false;

  private salesSchedulerFormLoaded = false;
  private inventorySchedulerFormLoaded = false;
  private subs = new Subscription();

  constructor(
    private dashboardService: DashboardService,
    private messageService: MessageService,
  ) {
    this.combined$ = this.dashboardService.getCombinedStatus();
    this.health$ = this.dashboardService.getSystemHealth();
  }

  ngOnInit(): void {
    this.subs.add(
      this.health$.subscribe(health => {
        this.salesScheduler = health?.salesScheduler ?? null;
        this.inventoryScheduler = health?.inventoryScheduler ?? null;
        if (this.salesScheduler && (!this.salesSchedulerFormLoaded || !this.salesSchedulerFormTouched)) {
          this.fillSalesSchedulerForm(this.salesScheduler);
        }
        if (this.inventoryScheduler && (!this.inventorySchedulerFormLoaded || !this.inventorySchedulerFormTouched)) {
          this.fillInventorySchedulerForm(this.inventoryScheduler);
        }
      }),
    );
    this.dashboardService.refreshHealth().subscribe();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  markSalesSchedulerTouched(): void {
    this.salesSchedulerFormTouched = true;
  }

  markInventorySchedulerTouched(): void {
    this.inventorySchedulerFormTouched = true;
  }

  salesSchedulerValidationError(): string | null {
    return this.schedulerValidationError(this.salesSchedulerDayOfWeek, this.salesSchedulerTimeOfDay, this.salesSchedulerTimezone);
  }

  inventorySchedulerValidationError(): string | null {
    return this.schedulerValidationError(this.inventorySchedulerDayOfWeek, this.inventorySchedulerTimeOfDay, this.inventorySchedulerTimezone);
  }

  private schedulerValidationError(dayOfWeek: number, timeOfDay: string, timezone: string): string | null {
    if (dayOfWeek === null || dayOfWeek === undefined) return 'Schedule day is required.';
    if (!timeOfDay) return 'Schedule time is required.';
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(timeOfDay)) return 'Use a valid 24-hour time, for example 22:00.';
    if (!timezone?.trim()) return 'Timezone is required.';
    return null;
  }

  onSaveSalesScheduler(): void {
    const error = this.salesSchedulerValidationError();
    if (error) {
      this.messageService.add({ severity: 'warn', summary: 'Scheduler Settings', detail: error });
      return;
    }

    this.isSavingSalesScheduler = true;
    this.dashboardService.updateSalesSchedulerSettings({
      enabled: this.salesSchedulerEnabled,
      dayOfWeek: Number(this.salesSchedulerDayOfWeek),
      timeOfDay: this.salesSchedulerTimeOfDay,
      timezone: this.salesSchedulerTimezone.trim(),
    }).pipe(
      finalize(() => { this.isSavingSalesScheduler = false; }),
    ).subscribe({
      next: status => {
        this.salesScheduler = status;
        this.fillSalesSchedulerForm(status);
        this.salesSchedulerFormTouched = false;
        this.messageService.add({ severity: 'success', summary: 'Scheduler Saved', detail: 'Sales weekly schedule has been updated.' });
        this.dashboardService.refreshHealth().subscribe();
        this.dashboardService.refreshStatus().subscribe();
      },
      error: err => {
        this.messageService.add({
          severity: 'error',
          summary: 'Scheduler Settings',
          detail: err.error?.message || 'Could not save scheduler settings.',
        });
      },
    });
  }

  onSaveInventoryScheduler(): void {
    const error = this.inventorySchedulerValidationError();
    if (error) {
      this.messageService.add({ severity: 'warn', summary: 'Scheduler Settings', detail: error });
      return;
    }

    this.isSavingInventoryScheduler = true;
    this.dashboardService.updateInventorySchedulerSettings({
      enabled: this.inventorySchedulerEnabled,
      dayOfWeek: Number(this.inventorySchedulerDayOfWeek),
      timeOfDay: this.inventorySchedulerTimeOfDay,
      timezone: this.inventorySchedulerTimezone.trim(),
    }).pipe(
      finalize(() => { this.isSavingInventoryScheduler = false; }),
    ).subscribe({
      next: status => {
        this.inventoryScheduler = status;
        this.fillInventorySchedulerForm(status);
        this.inventorySchedulerFormTouched = false;
        this.messageService.add({ severity: 'success', summary: 'Scheduler Saved', detail: 'Inventory weekly schedule has been updated.' });
        this.dashboardService.refreshHealth().subscribe();
        this.dashboardService.refreshStatus().subscribe();
      },
      error: err => {
        this.messageService.add({
          severity: 'error',
          summary: 'Scheduler Settings',
          detail: err.error?.message || 'Could not save scheduler settings.',
        });
      },
    });
  }

  formatDateTime(iso: string | null, timezone?: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const options: Intl.DateTimeFormatOptions = timezone ? { timeZone: timezone } : {};
    const date = d.toLocaleDateString('en-US', { ...options, month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString('en-US', {
      ...options,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: timezone ? 'short' : undefined,
    });
    return `${date} ${time}`;
  }

  schedulerStatusClass(status: SchedulerStatus | null): string {
    if (!status) return 'status-none';
    if (status.lastRunStatus === 'SUCCESS') return 'status-success';
    if (status.lastRunStatus === 'FAILED') return 'status-fail';
    if (status.lastRunStatus === 'RUNNING') return 'status-running';
    return 'status-none';
  }

  statusLabel(status: ReportSyncStatus): string {
    if (status.isSyncing) return `Running · ${status.currentStage}`;
    if (status.lastSyncStatus === 'SUCCESS') return 'Done';
    if (status.lastSyncStatus === 'FAILED') return 'Failed';
    if (status.lastSyncStatus === 'IDLE') return 'Idle';
    return 'Not run';
  }

  private fillSalesSchedulerForm(status: SalesSchedulerStatus): void {
    this.salesSchedulerEnabled = status.enabled;
    this.salesSchedulerDayOfWeek = status.dayOfWeek;
    this.salesSchedulerTimeOfDay = status.timeOfDay;
    this.salesSchedulerTimezone = status.timezone;
    this.salesSchedulerFormLoaded = true;
  }

  private fillInventorySchedulerForm(status: InventorySchedulerStatus): void {
    this.inventorySchedulerEnabled = status.enabled;
    this.inventorySchedulerDayOfWeek = status.dayOfWeek;
    this.inventorySchedulerTimeOfDay = status.timeOfDay;
    this.inventorySchedulerTimezone = status.timezone;
    this.inventorySchedulerFormLoaded = true;
  }
}
