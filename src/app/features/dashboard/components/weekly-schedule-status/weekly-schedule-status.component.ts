import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReportSyncStatus } from '../../../../data/services/dashboard.service';

/**
 * Weekly Schedule Health — intentionally simple.
 * Business rule: the Sales sync runs every MONDAY and pulls the PREVIOUS Mon→Sun
 * week; the next run is the following Monday. The widget shows just three rows:
 * Status, Period Synced (last week), and Next Schedule (next Monday).
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
  nextMondayLabel = '';

  ngOnChanges(): void {
    this.compute();
  }

  private compute(): void {
    // ── Status of the most recent sales sync ─────────────────────────────────
    const s = this.salesStatus?.lastSyncStatus;
    this.status = s === 'SUCCESS' ? 'success' : s === 'FAILED' ? 'fail' : 'none';

    // ── Period synced = last completed Mon→Sun week ──────────────────────────
    // Prefer what was actually synced; otherwise compute the previous week.
    const p = this.salesStatus?.lastSyncPeriod;
    if (p?.startDate && p?.endDate) {
      this.periodLabel = `${p.startDate.slice(0, 10)} → ${p.endDate.slice(0, 10)}`;
    } else {
      const { start, end } = this.previousWeek();
      this.periodLabel = `${this.iso(start)} → ${this.iso(end)}`;
    }

    // ── Next schedule = next Monday (today Monday → today + 7) ────────────────
    this.nextMondayLabel = this.nextMonday().toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  }

  /** Monday 00:00 of the current week (local). */
  private thisMonday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const daysFromMon = (d.getDay() + 6) % 7; // Mon→0 … Sun→6
    d.setDate(d.getDate() - daysFromMon);
    return d;
  }

  /** Previous completed Mon→Sun week (the week before the current one). */
  private previousWeek(): { start: Date; end: Date } {
    const start = this.thisMonday();
    start.setDate(start.getDate() - 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }

  /** Next Monday strictly after today (today Monday → today + 7). */
  private nextMonday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const daysUntil = ((1 - d.getDay() + 7) % 7) || 7;
    d.setDate(d.getDate() + daysUntil);
    return d;
  }

  private iso(d: Date): string {
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
}
