import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle, Loader, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';
import { toast } from 'sonner';

type Challenge = { id: string; label: string; durationMs: number };

interface LivenessVerificationProps {
  onComplete: (result: {
    livenessScore: number;
    faceMatchScore: number;
    fraudRiskScore: number;
    verificationResult: string;
    autoApproved?: boolean;
  }) => void;
  onSkip?: () => void;
}

export default function LivenessVerification({ onComplete, onSkip }: LivenessVerificationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [completed, setCompleted] = useState(false);
  const [scores, setScores] = useState<{ liveness: number; faceMatch: number; fraud: number } | null>(null);

  const currentChallenge = challenges[stepIndex];

  const startSession = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.startLivenessSession();
      setSessionId(res.sessionId);
      setChallenges(res.challenges || []);
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      setStream(media);
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start live verification');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, [stream]);

  const captureFrame = async () => {
    if (!videoRef.current || !canvasRef.current || !sessionId || !currentChallenge) return;
    const ctx = canvasRef.current.getContext('2d');
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx?.drawImage(videoRef.current, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => canvasRef.current?.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return;

    setLoading(true);
    try {
      await apiClient.submitLivenessFrame(sessionId, currentChallenge.id, blob, 0.85);
      if (stepIndex + 1 >= challenges.length) {
        const result = await apiClient.completeLivenessSession(sessionId);
        setScores({
          liveness: result.livenessScore,
          faceMatch: result.faceMatchScore,
          fraud: result.fraudRiskScore,
        });
        setCompleted(true);
        stream?.getTracks().forEach((t) => t.stop());
        onComplete({
          livenessScore: result.livenessScore,
          faceMatchScore: result.faceMatchScore,
          fraudRiskScore: result.fraudRiskScore,
          verificationResult: result.verificationResult,
          autoApproved: result.autoApproved,
        });
      } else {
        setStepIndex((i) => i + 1);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Frame capture failed');
    } finally {
      setLoading(false);
    }
  };

  if (completed && scores) {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
        <h3 className="font-semibold">Live Verification Complete</h3>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="p-3 bg-muted rounded-xl"><p className="text-xs text-muted-foreground">Face Match</p><p className="font-bold">{scores.faceMatch}%</p></div>
          <div className="p-3 bg-muted rounded-xl"><p className="text-xs text-muted-foreground">Liveness</p><p className="font-bold">{scores.liveness}%</p></div>
          <div className="p-3 bg-muted rounded-xl"><p className="text-xs text-muted-foreground">Fraud Risk</p><p className="font-bold">{scores.fraud}%</p></div>
        </div>
      </div>
    );
  }

  if (!cameraReady) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-xl">
          <Shield className="w-5 h-5 text-blue-600 shrink-0" />
          <p className="text-xs text-blue-700">Complete live verification: blink, turn head, smile, and hold still. Prevents fake IDs and photo fraud.</p>
        </div>
        <Button className="w-full" onClick={startSession} disabled={loading}>
          {loading ? <><Loader className="w-4 h-4 mr-2 animate-spin" />Starting...</> : <><Camera className="w-4 h-4 mr-2" />Start Live Verification</>}
        </Button>
        {onSkip && (
          <Button variant="outline" className="w-full" onClick={onSkip}>Skip (admin review required)</Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-3 bg-primary/5 rounded-xl text-sm font-medium text-center">
        Step {stepIndex + 1} of {challenges.length}: {currentChallenge?.label}
      </div>
      <video ref={videoRef} className="w-full h-64 object-cover rounded-xl bg-black" autoPlay playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
      <Button className="w-full bg-gradient-primary" onClick={captureFrame} disabled={loading}>
        {loading ? <><Loader className="w-4 h-4 mr-2 animate-spin" />Processing...</> : 'Capture & Continue'}
      </Button>
    </div>
  );
}
