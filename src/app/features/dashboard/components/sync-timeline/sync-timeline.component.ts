import { Component, Input, Output, EventEmitter } from '@angular/core';
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
}

@Component({
  selector: 'app-sync-timeline',
  standalone: true,
  imports: [CommonModule, NgClass, FormsModule],
  templateUrl: './sync-timeline.component.html',
  styleUrls: ['./sync-timeline.component.scss'],
})
export class SyncTimelineComponent {
  @Input() report!: SyncReportMeta;
  @Input() stages: PipelineStep[] = [];
  
  @Input() periodStart = '';
  @Output() periodStartChange = new EventEmitter<string>();
  
  @Input() periodEnd = '';
  @Output() periodEndChange = new EventEmitter<string>();

  @Input() isRunning = false;
  
  @Output() runSync = new EventEmitter<void>();

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
