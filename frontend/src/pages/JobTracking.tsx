import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import FundiTracker from '@/components/fundi/FundiTracker';
import RouteErrorBoundary from '@/components/system/RouteErrorBoundary';

export default function JobTracking() {
  const { jobId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-hero">
      <RouteErrorBoundary fallbackTitle="Job tracking unavailable">
        <FundiTracker jobId={jobId} onComplete={() => navigate('/dashboard')} />
      </RouteErrorBoundary>
    </div>
  );
}
