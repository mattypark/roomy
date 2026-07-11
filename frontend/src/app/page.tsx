'use client';

import { useEffect, useState } from 'react';
import { getHealth, getStatus, runAnalyze, runScan } from '@/lib/api';
import type {
  AnalysisResult,
  CaptureStatus,
  FrameInfo,
  HealthResponse,
} from '@/lib/types';
import { CaptureDeck } from '@/components/capture/CaptureDeck';
import { HistoryPanel } from '@/components/history/HistoryPanel';
import { LiveFeed } from '@/components/live/LiveFeed';
import { ZoneOverlay } from '@/components/overlay/ZoneOverlay';
import { VibePanel, type VibeData } from '@/components/vibe/VibePanel';

type Step = 1 | 2 | 3;

const STEPS: { id: Step; label: string; hint: string }[] = [
  { id: 1, label: 'scan room', hint: 'camera or photo' },
  { id: 2, label: 'your vibe', hint: 'style + inspo' },
  { id: 3, label: 'zones', hint: 'green / red map' },
];

const VIBE_STORAGE_KEY = 'roomy-vibe';
const EMPTY_VIBE: VibeData = { text: '', inspo: [] };

export default function Home() {
  const [step, setStep] = useState<Step>(1);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [lastFrame, setLastFrame] = useState<FrameInfo | null>(null);
  const [scan, setScan] = useState<AnalysisResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [historyToken, setHistoryToken] = useState(0);
  const [vibe, setVibe] = useState<VibeData>(EMPTY_VIBE);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setHealthError(true));
    getStatus()
      .then(setStatus)
      .catch(() => null);
    try {
      const saved = localStorage.getItem(VIBE_STORAGE_KEY);
      if (saved) setVibe(JSON.parse(saved));
    } catch {
      // corrupted storage — start fresh
    }
  }, []);

  function updateVibe(next: VibeData) {
    setVibe(next);
    try {
      localStorage.setItem(VIBE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage full (inspo photos) — keep in-memory only
    }
  }

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
      setHistoryToken((token) => token + 1);
      setStep(3);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'scan failed');
    } finally {
      setScanning(false);
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setScanError(null);
    try {
      setScan(await runAnalyze(vibe.text, vibe.inspo));
      setHistoryToken((token) => token + 1);
      setStep(3);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'analyze failed');
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex items-end justify-between">
        <div>
          <p className="telemetry">
            ceiling overwatch{health ? ` · stage ${health.stage}` : ''}
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">roomy</h1>
        </div>
        <BackendDot health={health} error={healthError} />
      </header>

      {/* step picker — jump anywhere */}
      <nav aria-label="workflow steps" className="grid grid-cols-3 gap-2">
        {STEPS.map(({ id, label, hint }) => {
          const isActive = step === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setStep(id)}
              aria-current={isActive ? 'step' : undefined}
              className="rounded-[var(--radius-inner)] border px-4 py-3 text-left transition-[border-color,background-color] duration-150 ease-out"
              style={{
                borderColor: isActive ? 'var(--color-ink)' : 'var(--color-line)',
                background: isActive
                  ? 'var(--color-surface-raised)'
                  : 'transparent',
              }}
            >
              <p className="telemetry num">0{id}</p>
              <p className="mt-0.5 text-sm font-medium">{label}</p>
              <p className="text-xs text-[var(--color-text-dim)]">{hint}</p>
            </button>
          );
        })}
      </nav>

      {step === 1 && (
        <>
          <CaptureDeck
            onFrameStored={(frame) => {
              setLastFrame(frame);
              refreshStatus();
            }}
            onBaselineStored={() => refreshStatus()}
          />
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <p>
                  baseline:{' '}
                  <span
                    style={{
                      color: status?.baselineSet
                        ? 'var(--color-clean)'
                        : 'var(--color-text-dim)',
                    }}
                  >
                    {status?.baselineSet ? 'locked in' : 'not set'}
                  </span>
                  {' · '}
                  frame:{' '}
                  <span className="text-[var(--color-text-dim)]">
                    {status?.latestSnapshotId ?? 'none yet'}
                  </span>
                </p>
                {lastFrame && (
                  <p className="telemetry num mt-1">
                    last upload {lastFrame.width}×{lastFrame.height}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="btn"
                onClick={handleScan}
                disabled={scanning || !status?.latestSnapshotId}
              >
                {scanning ? 'analyzing…' : 'analyze room →'}
              </button>
            </div>
            {scanError && (
              <p className="mt-3 text-sm text-[var(--color-dirty)]">{scanError}</p>
            )}
          </section>
          <LiveFeed />
        </>
      )}

      {step === 2 && (
        <>
          <VibePanel vibe={vibe} onChange={updateVibe} />
          <div className="flex items-center justify-end gap-3">
            {!status?.latestSnapshotId && (
              <p className="text-sm text-[var(--color-text-dim)]">
                capture a frame in step 01 first
              </p>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => setStep(3)}>
              skip → zones
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleAnalyze}
              disabled={analyzing || !status?.latestSnapshotId}
            >
              {analyzing ? 'analyzing with ai…' : 'analyze room with this vibe →'}
            </button>
          </div>
          {scanError && (
            <p className="text-sm text-[var(--color-dirty)]">{scanError}</p>
          )}
        </>
      )}

      {step === 3 && (
        <section className="card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="telemetry">
              zone map ·{' '}
              {scan?.source === 'claude'
                ? 'claude vision'
                : scan?.source === 'demo'
                  ? 'demo mode'
                  : 'local cv'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleScan}
                disabled={scanning || analyzing || !status?.latestSnapshotId}
              >
                {scanning ? 'scanning…' : '⟳ rescan'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleAnalyze}
                disabled={scanning || analyzing || !status?.latestSnapshotId}
              >
                {analyzing ? 'analyzing…' : '✦ deep analyze'}
              </button>
            </div>
          </div>

          {scan ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-6">
                <p
                  className="num text-6xl font-bold"
                  style={{
                    color:
                      scan.overallScore < 0.25
                        ? 'var(--color-clean)'
                        : scan.overallScore < 0.5
                          ? 'var(--color-text)'
                          : 'var(--color-dirty)',
                  }}
                >
                  {scan.rank}
                </p>
                <div className="num text-sm">
                  <p>clutter {(scan.overallScore * 100).toFixed(1)}%</p>
                  <p className="text-[var(--color-text-dim)]">
                    {scan.gridRows}×{scan.gridCols} zones · frame {scan.frameId}
                  </p>
                  <p className="text-[var(--color-text-dim)]">
                    baseline {scan.baselineUsed ? 'used' : 'not set — absolute mode'}
                  </p>
                </div>
              </div>
              {scan.warning && (
                <p
                  className="rounded-[var(--radius-inner)] border px-3 py-2 text-sm"
                  style={{
                    borderColor: 'var(--color-dirty)',
                    color: 'var(--color-dirty)',
                  }}
                >
                  {scan.warning}
                </p>
              )}
              <ZoneOverlay scan={scan} />

              {scan.styleNotes && (
                <div className="rounded-[var(--radius-inner)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
                  <p className="telemetry mb-2">style read</p>
                  <p className="text-sm">{scan.styleNotes}</p>
                </div>
              )}

              {scan.shoppingList && scan.shoppingList.length > 0 && (
                <div className="rounded-[var(--radius-inner)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
                  <p className="telemetry mb-3">to match the vibe</p>
                  <ul className="flex flex-col gap-2">
                    {scan.shoppingList.map((entry, index) => (
                      <li key={index} className="flex gap-2 text-sm">
                        <span className="text-[var(--color-text-dim)]">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span>
                          <span className="font-medium">{entry.item}</span>
                          <span className="text-[var(--color-text-dim)]">
                            {' '}
                            — {entry.why}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!scan.styleNotes && (
                <p className="text-sm text-[var(--color-text-dim)]">
                  set your vibe in step 02, then hit ✦ deep analyze — you&apos;ll
                  get per-zone reasons on hover plus style suggestions.
                </p>
              )}
            </div>
          ) : (
            <div className="py-10 text-center">
              <p className="text-sm text-[var(--color-text-dim)]">
                no scan yet — capture a frame in step 01, then analyze.
              </p>
              <button
                type="button"
                className="btn mt-4"
                onClick={() => setStep(1)}
              >
                ← go to scan
              </button>
            </div>
          )}
          {scanError && (
            <p className="mt-3 text-sm text-[var(--color-dirty)]">{scanError}</p>
          )}
        </section>
      )}

      {step === 3 && <HistoryPanel refreshToken={historyToken} />}
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
    ? 'var(--color-clean)'
    : error
      ? 'var(--color-dirty)'
      : 'var(--color-text-dim)';
  const label = health
    ? `stage ${health.stage} · claude ${health.claudeEnabled ? 'armed' : 'demo'}`
    : error
      ? 'backend offline'
      : 'linking…';

  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-2.5 w-2.5 rounded-full ${health || error ? '' : 'animate-pulse'}`}
        style={{ background: dotColor }}
      />
      <span className="telemetry">{label}</span>
    </div>
  );
}
