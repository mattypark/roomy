'use client';

import { useEffect, useState } from 'react';
import { getHealth, getStatus } from '@/lib/api';
import type { CaptureStatus, FrameInfo, HealthResponse } from '@/lib/types';
import { API_URL } from '@/lib/types';
import { CaptureDeck } from '@/components/capture/CaptureDeck';

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [lastFrame, setLastFrame] = useState<FrameInfo | null>(null);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setHealthError(true));
    getStatus()
      .then(setStatus)
      .catch(() => null);
  }, []);

  function refreshStatus() {
    getStatus()
      .then(setStatus)
      .catch(() => null);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex items-end justify-between">
        <div>
          <p className="telemetry">ceiling overwatch // stage 2</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">roomy</h1>
        </div>
        <BackendDot health={health} error={healthError} />
      </header>

      <CaptureDeck
        onFrameStored={(frame) => {
          setLastFrame(frame);
          refreshStatus();
        }}
        onBaselineStored={() => refreshStatus()}
      />

      {/* pipeline status */}
      <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-5">
        <p className="telemetry mb-3">pipeline status</p>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="telemetry mb-1">clean baseline</p>
            <p
              className={
                status?.baselineSet
                  ? 'text-[var(--color-clean)]'
                  : 'text-[var(--color-text-dim)]'
              }
            >
              {status?.baselineSet ? '● locked in' : '○ not set — capture your room at its cleanest'}
            </p>
          </div>
          <div>
            <p className="telemetry mb-1">latest stored frame</p>
            {status?.latestSnapshotUrl ? (
              <a
                href={`${API_URL}${status.latestSnapshotUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-scan)] underline underline-offset-4"
              >
                {status.latestSnapshotId}
              </a>
            ) : (
              <p className="text-[var(--color-text-dim)]">none yet</p>
            )}
          </div>
        </div>
        {lastFrame && (
          <p className="telemetry mt-4">
            last upload: {lastFrame.id} · {lastFrame.width}×{lastFrame.height}
          </p>
        )}
      </section>
    </main>
  );
}

function BackendDot({
  health,
  error,
}: {
  health: HealthResponse | null;
  error: boolean;
}) {
  const dotColor = health
    ? 'bg-[var(--color-clean)]'
    : error
      ? 'bg-[var(--color-dirty)]'
      : 'animate-pulse bg-[var(--color-scan)]';
  const label = health
    ? `stage ${health.stage} · claude ${health.claudeEnabled ? 'armed' : 'demo'}`
    : error
      ? 'backend offline'
      : 'linking…';

  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
      <span className="telemetry">{label}</span>
    </div>
  );
}
