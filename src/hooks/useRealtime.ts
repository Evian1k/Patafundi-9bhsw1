import { useEffect, useState } from 'react';
import { realtimeService } from '@/services/realtime';
import { toast } from 'sonner';

/**
 * Hook for real-time job requests on the Fundi dashboard.
 * Uses correct backend event names.
 */
export function useJobRequest() {
  const [jobRequest, setJobRequest] = useState<Record<string, unknown> | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    let interval: number | null = null;

    const clearCountdown = () => {
      if (interval != null) { window.clearInterval(interval); interval = null; }
    };

    const handleJobRequest = (data: Record<string, unknown>) => {
      console.log('[useJobRequest] job:request received:', data);
      setJobRequest(data);
      if (data.expiresAt) {
        clearCountdown();
        const expiryTime = new Date(data.expiresAt as string).getTime();
        interval = window.setInterval(() => {
          const diff = Math.max(0, Math.floor((expiryTime - Date.now()) / 1000));
          setRemaining(diff);
          if (diff === 0) clearCountdown();
        }, 500);
      } else {
        setRemaining(0);
      }
    };

    const handleResponseOk = (data: Record<string, unknown>) => {
      if (!data?.jobId) return;
      if (data.accepted) toast.success('Job accepted!');
      else toast('Response recorded');
      setJobRequest(null);
      clearCountdown();
    };

    const handleResponseFailed = (data: Record<string, unknown>) => {
      toast.error((data?.message as string) || 'Could not accept job');
    };

    const handleJobAccepted = () => {
      setJobRequest(null);
      clearCountdown();
    };

    const handleJobDeclined = () => {
      setJobRequest(null);
      clearCountdown();
    };

    realtimeService.on('job:request', handleJobRequest);
    realtimeService.on('job:request:declined', handleJobDeclined);
    realtimeService.on('fundi:response:ok', handleResponseOk);
    realtimeService.on('fundi:response:failed', handleResponseFailed);
    realtimeService.on('job:accepted', handleJobAccepted);

    return () => {
      clearCountdown();
      realtimeService.off('job:request', handleJobRequest);
      realtimeService.off('job:request:declined', handleJobDeclined);
      realtimeService.off('fundi:response:ok', handleResponseOk);
      realtimeService.off('fundi:response:failed', handleResponseFailed);
      realtimeService.off('job:accepted', handleJobAccepted);
    };
  }, []);

  const acceptJob = (jobId: string) => { realtimeService.respondToJobRequest(jobId, true); };
  const declineJob = (jobId: string) => {
    realtimeService.respondToJobRequest(jobId, false);
    setJobRequest(null);
    setRemaining(0);
  };

  return { jobRequest, remaining, acceptJob, declineJob };
}

/**
 * Hook for in-app job chat.
 */
export function useJobChat(jobId: string | null) {
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (!jobId) return;
    const handleMessage = (data: Record<string, unknown>) => {
      if (data.jobId === jobId) {
        setMessages((prev) => [...prev, data.message as Record<string, unknown>]);
      }
    };
    realtimeService.on('chat:message', handleMessage);
    return () => { realtimeService.off('chat:message', handleMessage); };
  }, [jobId]);

  const sendMessage = (content: string) => {
    if (jobId) realtimeService.sendMessage(jobId, content);
  };

  return { messages, sendMessage };
}

/**
 * Hook for tracking real-time payment status.
 */
export function usePaymentStatus(jobId: string | null) {
  const [status, setStatus] = useState<'idle' | 'processing' | 'confirmed' | 'failed'>('idle');
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const onConfirmed = (data: Record<string, unknown>) => {
      if (data?.jobId !== jobId) return;
      setStatus('confirmed');
      setReceiptNumber((data.receiptNumber as string) ?? null);
    };

    const onFailed = (data: Record<string, unknown>) => {
      if (data?.jobId !== jobId) return;
      setStatus('failed');
    };

    realtimeService.on('payment:confirmed', onConfirmed);
    realtimeService.on('payment:failed', onFailed);

    return () => {
      realtimeService.off('payment:confirmed', onConfirmed);
      realtimeService.off('payment:failed', onFailed);
    };
  }, [jobId]);

  return { paymentStatus: status, receiptNumber };
}

/**
 * Hook for payout status updates (fundi side).
 */
export function usePayoutStatus() {
  const [payoutStatus, setPayoutStatus] = useState<string | null>(null);

  useEffect(() => {
    const onProcessing = () => setPayoutStatus('processing');
    const onCompleted = () => setPayoutStatus('completed');

    realtimeService.on('payout:processing', onProcessing);
    realtimeService.on('payout:completed', onCompleted);

    return () => {
      realtimeService.off('payout:processing', onProcessing);
      realtimeService.off('payout:completed', onCompleted);
    };
  }, []);

  return { payoutStatus };
}
