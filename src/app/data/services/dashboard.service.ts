import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, timer, of } from 'rxjs';
import { map, switchMap, catchError, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncStartedAt: string | null;
  lastSyncFinishedAt: string | null;
  lastSyncStatus: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  lastError: string | null;
}

export interface SystemHealth {
  label: string;
  value: string;
  sub: string;
  icon: string;
  color: string;
}

export interface PipelineStep {
  status: string;
  time: string;
  desc: string;
  state: 'complete' | 'active' | 'pending';
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private initialStatus: SyncStatus = {
    isSyncing: false,
    lastSyncStartedAt: null,
    lastSyncFinishedAt: null,
    lastSyncStatus: 'IDLE',
    lastError: null
  };

  private statusSubject = new BehaviorSubject<SyncStatus>(this.initialStatus);
  private healthSubject = new BehaviorSubject<SystemHealth[]>([]);
  private pipelineSubject = new BehaviorSubject<PipelineStep[]>([]);

  constructor(private http: HttpClient) {
    this.updateMetrics(this.initialStatus);
    this.startPolling();
  }

  private startPolling() {
    timer(0, 5000).pipe(
      switchMap(() => this.http.get<SyncStatus>(`${environment.apiUrl}/sync/status`).pipe(
        catchError(err => {
          console.error('Failed to fetch sync status', err);
          return of(null);
        })
      )),
      tap(status => {
        if (status) {
          this.statusSubject.next(status);
          this.updateMetrics(status);
        }
      })
    ).subscribe();
  }

  private updateMetrics(status: SyncStatus) {
    const health: SystemHealth[] = [
      { 
        label: 'Sync Status', 
        value: status.isSyncing ? 'ACTIVE' : status.lastSyncStatus, 
        sub: status.lastSyncFinishedAt ? `Last: ${new Date(status.lastSyncFinishedAt).toLocaleTimeString()}` : 'No history', 
        icon: 'pi pi-sync', 
        color: status.isSyncing ? 'text-orange-500' : status.lastSyncStatus === 'SUCCESS' ? 'text-green-500' : 'text-red-500' 
      },
      { label: 'API Quota Health', value: '100%', sub: 'Dynamic Throttle Active', icon: 'pi pi-activity', color: 'text-blue-400' },
      { label: 'Token Persistence', value: 'REDIS', sub: 'Shared across instances', icon: 'pi pi-database', color: 'text-purple-400' },
      { label: 'System Lock', value: status.isSyncing ? 'LOCKED' : 'READY', sub: 'Distributed Redlock', icon: 'pi pi-lock', color: 'text-emerald-400' }
    ];
    this.healthSubject.next(health);

    const pipeline: PipelineStep[] = [
      { 
        status: 'INITIALIZED', 
        time: status.lastSyncStartedAt ? new Date(status.lastSyncStartedAt).toLocaleTimeString() : '--:--', 
        desc: 'Requesting SP-API Report', 
        state: status.isSyncing || status.lastSyncStatus !== 'IDLE' ? 'complete' : 'pending' 
      },
      { 
        status: 'PROCESSING', 
        time: status.isSyncing ? 'Running...' : '--:--', 
        desc: 'Chunked Batch Upsert', 
        state: status.isSyncing ? 'active' : status.lastSyncStatus === 'SUCCESS' ? 'complete' : 'pending' 
      },
      { 
        status: 'FINALIZED', 
        time: status.lastSyncFinishedAt ? new Date(status.lastSyncFinishedAt).toLocaleTimeString() : '--:--', 
        desc: 'Inventory & Sales Sync', 
        state: status.lastSyncStatus === 'SUCCESS' ? 'complete' : 'pending' 
      }
    ];
    this.pipelineSubject.next(pipeline);
  }

  getSyncStatus(): Observable<SyncStatus> {
    return this.statusSubject.asObservable();
  }

  fetchStatusNow(): void {
    this.http.get<SyncStatus>(`${environment.apiUrl}/sync/status`).subscribe(status => {
      if (status) {
        this.statusSubject.next(status);
        this.updateMetrics(status);
      }
    });
  }

  triggerManualSync(startDate: string, endDate: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/sync/manual`, { startDate, endDate }).pipe(
      tap(() => this.fetchStatusNow())
    );
  }

  getHealthMetrics(): Observable<SystemHealth[]> {
    return this.healthSubject.asObservable();
  }

  getPipelineSteps(): Observable<PipelineStep[]> {
    return this.pipelineSubject.asObservable();
  }
}
