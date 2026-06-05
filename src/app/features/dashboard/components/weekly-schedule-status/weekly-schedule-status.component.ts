import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReportSyncStatus } from '../../../../data/services/dashboard.service';

/**
 * Weekly Schedule Health — intentionally simple.
 * Business rule: Amazon Sales weeks run Sunday→Saturday. The backend exposes
 * the configured next schedule; this widget keeps the summary readable.
 */
@Component({
  selector: 'app-weekly-schedule-status',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './weekly-schedule-status.component.html',
  styleUrls: ['./weekly-schedule-status.component.scss'],
})
export class WeeklyScheduleStatusComponent implements OnChanges {
  @Input() salesStatus!: ReportSyncStatus;

  /** 'success' | 'fail' | 'none' (never run / idle / in-progress) */
  status: 'success' | 'fail' | 'none' = 'none';
  periodLabel = '—';
  nextScheduleLabel = '—';

  ngOnChanges(): void {
    this.compute();
  }

  private compute(): void {
    // ── Status of the most recent sales sync ─────────────────────────────────
    const s = this.salesStatus?.lastSyncStatus;
    this.status = s === 'SUCCESS' ? 'success' : s === 'FAILED' ? 'fail' : 'none';

    // ── Period synced = last completed Mon→Sun week ──────────────────────────
    // Prefer what was actually synced; otherwise compute the previous week.
    const periods = this.salesStatus?.lastSyncPeriods;
    const p = periods?.length ? periods[0] : this.salesStatus?.lastSyncPeriod;
    if (p?.startDate && p?.endDate) {
      this.periodLabel = `${p.startDate.slice(0, 10)} → ${p.endDate.slice(0, 10)}`;
    } else {
      const { start, end } = this.previousWeek();
      this.periodLabel = `${this.iso(start)} → ${this.iso(end)}`;
    }

    this.nextScheduleLabel = this.salesStatus?.nextScheduledAt
      ? this.formatDateTime(this.salesStatus.nextScheduledAt)
      : '—';
  }

  /** Sunday 00:00 of the current Amazon week (local). */
  private thisSunday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }

  /** Previous completed Sunday→Saturday Amazon week. */
  private previousWeek(): { start: Date; end: Date } {
    const start = this.thisSunday();
    start.setDate(start.getDate() - 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }

  private iso(d: Date): string {
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  private formatDateTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
}
