/**
 * useRealtime — polling-based realtime hook for PataFundi
 * Compatible with the polling RealtimeService
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { realtimeService } from '@/services/realtime';
import { apiClient } from '@/lib/api';

interface JobRequest {
  jobId: string;
  customerName: string;
  serviceCategory: string;
  location: string;
  estimatedPrice?: number;
  urgency?: string;
  distanceKm?: number;
  title?: string;
  description?: string;
}

interface UseJobRequestReturn {
  jobRequest: JobRequest | null;
  remaining: number;
  acceptJob: (jobId: string) => Promise<void>;
  declineJob: (jobId: string) => Promise<void>;
}

export function useJobRequest(): UseJobRequestReturn {
  const [jobRequest, setJobRequest] = useState<JobRequest | null>(null);
  const [remaining, setRemaining] = useState(60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const clearPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const applyIncomingJob = useCallback((job: Record<string, unknown>) => {
    const status = String(job.status || '');
    if (!['pending', 'matching'].includes(status)) return;
    setJobRequest({
      jobId: String(job.id || ''),
      customerName: String(job.customer_name || job.customerName || 'Customer'),
      serviceCategory: String(job.service_category || job.category || 'Service'),
      location: String(job.location_name || job.location || 'Unknown location'),
      estimatedPrice: job.estimated_price != null ? Number(job.estimated_price)
        : job.estimatedPrice != null ? Number(job.estimatedPrice) : undefined,
      urgency: job.urgency as string | undefined,
      title: String(job.title || job.service_category || job.category || 'New Job Request'),
      description: String(job.description || ''),
      distanceKm: typeof job.distanceKm === 'number' ? job.distanceKm
        : typeof job.distance_km === 'number' ? job.distance_km : undefined,
    });
    setRemaining(60);
  }, []);

  // Poll + realtime for open matching jobs in the fundi's specialty
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const poll = async () => {
      if (jobRequest) return;
      try {
        const res = await apiClient.getFundiActiveJob() as { job?: Record<string, unknown> | null };
        const job = res?.job;
        if (job) applyIncomingJob(job);
      } catch { /* ignore */ }
    };

    realtimeService.connect(token);
    const onJobCreated = (data: Record<string, unknown>) => {
      if (jobRequest) return;
      const job = (data.job as Record<string, unknown> | undefined) || data;
      if (job?.id) applyIncomingJob({ ...job, distanceKm: data.distanceKm });
      else if (data.jobId) poll();
    };
    realtimeService.on('job:created', onJobCreated);

    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => {
      clearPoll();
      realtimeService.off('job:created', onJobCreated);
    };
  }, [jobRequest, applyIncomingJob]);

  // Countdown timer
  useEffect(() => {
    if (!jobRequest) { clearTimer(); return; }
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearTimer();
          setJobRequest(null);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return clearTimer;
  }, [jobRequest]);

  const acceptJob = useCallback(async (jobId: string) => {
    try {
      await apiClient.acceptJob(jobId);
      setJobRequest(null);
      clearTimer();
    } catch (e) {
      console.error('[useJobRequest] acceptJob error:', e);
    }
  }, []);

  const declineJob = useCallback(async (_jobId: string) => {
    // Dismiss only — job stays open for other fundis (must not cancel customer request).
    setJobRequest(null);
    clearTimer();
  }, []);

  return { jobRequest, remaining, acceptJob, declineJob };
}

interface UseJobTrackingReturn {
  status: string;
  updatedAt: string | null;
  loading: boolean;
  refresh: () => void;
}

export function useJobTracking(jobId: string | undefined): UseJobTrackingReturn {
  const [status, setStatus] = useState('pending');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!jobId) { setLoading(false); return; }
    try {
      const res = await apiClient.getJobStatus(jobId) as { status?: string; updatedAt?: string };
      if (res?.status) {
        setStatus(res.status);
        setUpdatedAt(res.updatedAt || null);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    fetch();

    // Also watch with realtime service
    const token = localStorage.getItem('auth_token');
    if (token) {
      realtimeService.connect(token);
      realtimeService.watchJob(jobId);
    }

    const onStatus = (data: Record<string, unknown>) => {
      if (data.status) setStatus(data.status as string);
    };
    realtimeService.on('job:status', onStatus);
    realtimeService.on('job:accepted', onStatus);
    realtimeService.on('job:completed', onStatus);
    realtimeService.on('job:cancelled', onStatus);

    pollRef.current = setInterval(fetch, 8000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      realtimeService.off('job:status', onStatus);
      realtimeService.off('job:accepted', onStatus);
      realtimeService.off('job:completed', onStatus);
      realtimeService.off('job:cancelled', onStatus);
      realtimeService.stopWatchingJob(jobId);
    };
  }, [jobId, fetch]);

  return { status, updatedAt, loading, refresh: fetch };
}
