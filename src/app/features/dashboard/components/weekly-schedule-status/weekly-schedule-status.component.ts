import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReportSyncStatus } from '../../../../data/services/dashboard.service';

@Component({
  selector: 'app-weekly-schedule-status',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './weekly-schedule-status.component.html',
  styleUrls: ['./weekly-schedule-status.component.scss'],
})
export class WeeklyScheduleStatusComponent implements OnChanges {
  @Input() salesStatus!: ReportSyncStatus;

  lastMondayDate = '';
  thisWeekStatus: 'success' | 'failed' | 'missing' = 'missing';
  daysSinceLastSync: number | null = null;
  lastSyncLabel = 'Never';
  lastPeriodLabel = '';
  nextRunLabel = '';

  ngOnChanges(): void {
    this.compute();
  }

  private compute(): void {
    if (!this.salesStatus) return;

    // ── Last Monday of current week ──────────────────────────────────────────
    const today = new Date();
    const dow = today.getDay(); // 0=Sun, 1=Mon … 6=Sat
    const daysToMon = dow === 0 ? 6 : dow - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysToMon);
    monday.setHours(0, 0, 0, 0);

    this.lastMondayDate = monday.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
    });

    // ── Days since last completed sync ───────────────────────────────────────
    const finishedAt = this.salesStatus.lastSyncFinishedAt;
    if (finishedAt) {
      const last = new Date(finishedAt);
      const msPerDay = 1000 * 60 * 60 * 24;
      this.daysSinceLastSync = Math.floor((Date.now() - last.getTime()) / msPerDay);
      this.lastSyncLabel =
        last.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
        ' · ' +
        last.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } else {
      this.daysSinceLastSync = null;
      this.lastSyncLabel = 'Never';
    }

    // ── Period label ─────────────────────────────────────────────────────────
    const p = this.salesStatus.lastSyncPeriod;
    this.lastPeriodLabel = p ? `${p.startDate} → ${p.endDate}` : '—';

    // ── This-week sync health ─────────────────────────────────────────────────
    const startedAt = this.salesStatus.lastSyncStartedAt;
    if (startedAt) {
      const syncDate = new Date(startedAt);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      if (syncDate >= monday && syncDate <= sunday) {
        // A run happened this week. Only flag 'failed' on an actual FAILED status —
        // an IN_PROGRESS/IDLE run this week shouldn't read as a failure.
        this.thisWeekStatus =
          this.salesStatus.lastSyncStatus === 'SUCCESS' ? 'success'
          : this.salesStatus.lastSyncStatus === 'FAILED' ? 'failed'
          : 'missing';
      } else {
        this.thisWeekStatus = 'missing';
      }
    } else {
      this.thisWeekStatus = 'missing';
    }

    // ── Next run ─────────────────────────────────────────────────────────────
    const next = this.salesStatus.nextScheduledAt;
    if (next) {
      const d = new Date(next);
      this.nextRunLabel =
        d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
        ' · ' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) +
        ' UTC';
    } else {
      this.nextRunLabel = 'Not scheduled';
    }
  }

  get overallHealth(): 'healthy' | 'warning' | 'critical' {
    if (this.salesStatus?.lastSyncStatus === 'FAILED') return 'critical';
    if (this.thisWeekStatus === 'missing') return 'warning';
    return 'healthy';
  }
}
