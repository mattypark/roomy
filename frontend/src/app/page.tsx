'use client';

import { useEffect, useState } from 'react';
import { getHealth, getStatus, runScan } from '@/lib/api';
import type {
  CaptureStatus,
  FrameInfo,
  HealthResponse,
  ScanResult,
} from '@/lib/types';
import { API_URL } from '@/lib/types';
import { CaptureDeck } from '@/components/capture/CaptureDeck';
import { ZoneOverlay } from '@/components/overlay/ZoneOverlay';

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [lastFrame, setLastFrame] = useState<FrameInfo | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

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

  async function handleScan() {
    setScanning(true);
    setScanError(null);
    try {
      setScan(await runScan());
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'scan failed');
    } finally {
      setScanning(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex items-end justify-between">
        <div>
          <p className="telemetry">
            ceiling overwatch{health ? ` // stage ${health.stage}` : ''}
          </p>
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

      {/* local CV engine — overlay rendering lands in stage 4 */}
      <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="telemetry">clutter engine // local cv</p>
          <button
            className="rounded border border-[var(--color-scan)] px-4 py-2 text-sm text-[var(--color-scan)] transition-colors duration-150 hover:bg-[var(--color-scan)]/10 disabled:pointer-events-none disabled:opacity-40"
            onClick={handleScan}
            disabled={scanning || !status?.latestSnapshotId}
          >
            {scanning ? 'scanning…' : '⌖ run scan'}
          </button>
        </div>
        {scan ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-6">
              <p
                className="text-6xl font-bold"
                style={{
                  color:
                    scan.overallScore < 0.25
                      ? 'var(--color-clean)'
                      : scan.overallScore < 0.5
                        ? 'var(--color-scan)'
                        : 'var(--color-dirty)',
                }}
              >
                {scan.rank}
              </p>
              <div className="text-sm">
                <p>clutter {(scan.overallScore * 100).toFixed(1)}%</p>
                <p className="text-[var(--color-text-dim)]">
                  {scan.gridRows}×{scan.gridCols} zones · frame {scan.frameId}
                </p>
                <p className="text-[var(--color-text-dim)]">
                  baseline {scan.baselineUsed ? 'used' : 'not set — absolute mode'}
                </p>
              </div>
            </div>
            <ZoneOverlay scan={scan} />
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-dim)]">
            {status?.latestSnapshotId
              ? 'ready — run scan on the latest frame'
              : 'capture a frame first'}
          </p>
        )}
        {scanError && (
          <p className="mt-3 text-sm text-[var(--color-dirty)]">{scanError}</p>
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
