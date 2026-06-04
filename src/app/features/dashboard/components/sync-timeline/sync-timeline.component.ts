import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PipelineStep } from '../../../../data/services/dashboard.service';

export interface SyncReportMeta {
  name: string;
  path: string;
  status: 'COMPLETED' | 'RUNNING' | 'FAILED' | 'PENDING';
  lastRun: string;
  nextRun: string;
  duration: string;
  errorMessage?: string;
  runningPeriod?: { startDate: string; endDate: string } | null;
}

@Component({
  selector: 'app-sync-timeline',
  standalone: true,
  imports: [CommonModule, NgClass, FormsModule],
  templateUrl: './sync-timeline.component.html',
  styleUrls: ['./sync-timeline.component.scss'],
})
export class SyncTimelineComponent implements OnChanges {
  @Input() report!: SyncReportMeta;

  ngOnChanges(changes: SimpleChanges): void {
    // Reset dismiss when a new error arrives (different message)
    if (changes['report']) {
      const prev = changes['report'].previousValue as SyncReportMeta | undefined;
      const curr = changes['report'].currentValue as SyncReportMeta;
      if (curr?.errorMessage && curr.errorMessage !== prev?.errorMessage) {
        this.errorDismissed = false;
      }
    }
  }
  @Input() stages: PipelineStep[] = [];
  
  @Input() periodStart = '';
  @Output() periodStartChange = new EventEmitter<string>();
  
  @Input() periodEnd = '';
  @Output() periodEndChange = new EventEmitter<string>();

  @Input() isRunning = false;

  /** True while a stop/cancel request is in flight (button shows "Stopping…"). */
  @Input() isStopping = false;

  @Output() runSync = new EventEmitter<void>();

  /** Emitted when the user clicks Stop while a sync is running. */
  @Output() stopSync = new EventEmitter<void>();

  errorDismissed = false;

  onDismissError(): void { this.errorDismissed = true; }

  onStopSync(): void { this.stopSync.emit(); }

  nodeClass(status: string): string {
    return `node-${status}`;
  }

  connectorClass(currentStatus: string, nextStatus: string): string {
    if (currentStatus === 'error') return 'connector-error';
    if (currentStatus === 'progress') return 'connector-progress';
    if (currentStatus === 'completed' && nextStatus === 'completed') return 'connector-completed';
    if (currentStatus === 'completed') return 'connector-progress';
    return 'connector-pending';
  }

  onRunSync(): void {
    this.runSync.emit();
  }
}
