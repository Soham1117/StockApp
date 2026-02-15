import { randomUUID } from 'crypto';

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface Job {
  id: string;
  status: JobStatus;
  progress: number;
  result?: any;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

class JobStore {
  private jobs = new Map<string, Job>();

  createJob(): string {
    const id = randomUUID();
    this.jobs.set(id, {
      id,
      status: 'PENDING',
      progress: 0,
      createdAt: Date.now(),
    });
    return id;
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  updateJob(id: string, updates: Partial<Job>): void {
    const job = this.jobs.get(id);
    if (job) {
      this.jobs.set(id, { ...job, ...updates });
    }
  }

  completeJob(id: string, result: any): void {
    this.updateJob(id, {
      status: 'COMPLETED',
      progress: 100,
      result,
      completedAt: Date.now(),
    });
  }

  failJob(id: string, error: string): void {
    this.updateJob(id, {
      status: 'FAILED',
      error,
      completedAt: Date.now(),
    });
  }

  // Cleanup old jobs (older than 1 hour)
  cleanup(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs.entries()) {
      if (now - job.createdAt > 60 * 60 * 1000) {
        this.jobs.delete(id);
      }
    }
  }
}

export const jobStore = new JobStore();

// Periodically cleanup
setInterval(() => jobStore.cleanup(), 5 * 60 * 1000);
