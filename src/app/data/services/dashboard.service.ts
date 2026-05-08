import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, timer } from 'rxjs';
import { map } from 'rxjs/operators';

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
  private quotaSubject = new BehaviorSubject<number>(82);
  private healthSubject = new BehaviorSubject<SystemHealth[]>([
    { label: 'Token Status', value: 'ACTIVE', sub: 'Expires in 42m', icon: 'pi pi-zap', color: 'text-yellow-400' },
    { label: 'API Quota Health', value: '82%', sub: 'Leaky Bucket Stable', icon: 'pi pi-activity', color: 'text-blue-400' },
    { label: 'Synced Records', value: '14,209', sub: '+124 last hour', icon: 'pi pi-database', color: 'text-purple-400' },
    { label: 'Active Reports', value: '3 Running', sub: 'Last: Settlement_V2', icon: 'pi pi-file', color: 'text-emerald-400' }
  ]);

  private pipelineSubject = new BehaviorSubject<PipelineStep[]>([
    { status: 'SUBMITTED', time: '14:20:01', desc: 'POST_FLAT_FILE_ORDER_DATA', state: 'complete' },
    { status: 'IN_PROGRESS', time: '14:20:45', desc: 'Amazon Processing...', state: 'active' },
    { status: 'COMPLETED', time: 'Pending', desc: 'Awaiting Download', state: 'pending' }
  ]);

  constructor() {
    // Simulate live quota updates
    timer(0, 5000).pipe(
      map(() => Math.floor(Math.random() * (85 - 75 + 1) + 75))
    ).subscribe(val => {
      this.quotaSubject.next(val);
      const health = this.healthSubject.value;
      health[1].value = `${val}%`;
      this.healthSubject.next([...health]);
    });
  }

  getQuota(): Observable<number> {
    return this.quotaSubject.asObservable();
  }

  getHealthMetrics(): Observable<SystemHealth[]> {
    return this.healthSubject.asObservable();
  }

  getPipelineSteps(): Observable<PipelineStep[]> {
    return this.pipelineSubject.asObservable();
  }
}
