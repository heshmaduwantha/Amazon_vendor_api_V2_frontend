import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, Observable } from 'rxjs';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { TimelineModule } from 'primeng/timeline';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { DashboardService, SystemHealth, PipelineStep, SyncStatus } from '../../data/services/dashboard.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, CardModule, ChartModule, TimelineModule, ProgressSpinnerModule, MessageModule, ButtonModule, ToastModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  healthMetrics: SystemHealth[] = [];
  pipelineSteps: PipelineStep[] = [];
  syncStatus$: Observable<SyncStatus>;
  isRequesting: boolean = false;
  chartData: any;
  chartOptions: any;
  
  private subscriptions = new Subscription();

  constructor(
    private dashboardService: DashboardService,
    private messageService: MessageService
  ) {
    this.syncStatus$ = this.dashboardService.getSyncStatus();
  }

  onSyncNow() {
    this.isRequesting = true;
    
    // Default to yesterday's date range
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    this.dashboardService.triggerManualSync(dateStr, dateStr).subscribe({
      next: () => {
        this.messageService.add({ 
          severity: 'success', 
          summary: 'Sync Started', 
          detail: 'Manual synchronization has been triggered successfully.' 
        });
        this.isRequesting = false;
      },
      error: (err) => {
        this.messageService.add({ 
          severity: 'error', 
          summary: 'Sync Failed', 
          detail: err.error?.message || 'Could not initiate synchronization.' 
        });
        this.isRequesting = false;
      }
    });
  }

  ngOnInit() {
    this.subscriptions.add(
      this.dashboardService.getHealthMetrics().subscribe(metrics => {
        this.healthMetrics = metrics;
      })
    );

    this.subscriptions.add(
      this.dashboardService.getPipelineSteps().subscribe(steps => {
        this.pipelineSteps = steps;
      })
    );

    this.initChart();
  }

  initChart() {
    const textColor = '#64748b';
    const gridColor = 'rgba(255, 255, 255, 0.05)';

    this.chartData = {
      labels: ['1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s', '10s'],
      datasets: [
        {
          label: 'Amazon Limit',
          data: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
          fill: false,
          borderColor: '#3b82f6',
          borderWidth: 2,
          pointRadius: 0,
          borderDash: [5, 5],
          tension: 0
        },
        {
          label: 'Our Actual Rate',
          data: [0.5, 1.2, 0.4, 0.8, 1.5, 0.9, 0.6, 1.1, 0.5, 0.8],
          fill: true,
          borderColor: '#10b981',
          backgroundColor: (context: any) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) return null;
            const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            gradient.addColorStop(0, 'rgba(16, 185, 129, 0)');
            gradient.addColorStop(1, 'rgba(16, 185, 129, 0.3)');
            return gradient;
          },
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#000',
          pointBorderWidth: 2,
          tension: 0.4
        }
      ]
    };

    this.chartOptions = {
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: textColor,
            font: { family: 'Roboto Mono', size: 10 }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { family: 'Roboto Mono', size: 10 } },
          grid: { display: false }
        },
        y: {
          min: 0,
          max: 3,
          ticks: { color: textColor, font: { family: 'Roboto Mono', size: 10 } },
          grid: { color: gridColor }
        }
      }
    };
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }
}
