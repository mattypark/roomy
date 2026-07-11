'use client';

import { useEffect, useRef, useState } from 'react';
import { getStatus } from '@/lib/api';
import { API_URL } from '@/lib/types';

const POLL_INTERVAL_MS = 5000;

/** Watch mode — polls for new stored frames. This is the ceiling-Pi view:
 *  when the pi-agent posts frames on its interval, they appear here live.
 *  Works identically with dev uploads. */
export function LiveFeed() {
  const [watching, setWatching] = useState(false);
  const [frameId, setFrameId] = useState<string | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const frameIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!watching) return;

    let cancelled = false;
    async function poll() {
      try {
        const status = await getStatus();
        if (cancelled || !status.latestSnapshotId || !status.latestSnapshotUrl) return;
        if (status.latestSnapshotId !== frameIdRef.current) {
          frameIdRef.current = status.latestSnapshotId;
          setFrameId(status.latestSnapshotId);
          setFrameUrl(status.latestSnapshotUrl);
          setUpdatedAt(Date.now());
        }
      } catch {
        // backend blip — keep watching
      }
    }

    poll();
    const pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    const clockTimer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      clearInterval(clockTimer);
    };
  }, [watching]);

  const ageSeconds =
    updatedAt !== null ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;

  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="telemetry">ceiling watch</p>
          <p className="mt-0.5 text-sm text-[var(--color-text-dim)]">
            live view of frames as they land — from the pi on the ceiling, or dev
            uploads
          </p>
        </div>
        <button
          type="button"
          className={watching ? 'btn' : 'btn btn-ghost'}
          onClick={() => setWatching((value) => !value)}
        >
          {watching ? '◉ watching' : '▶ watch'}
        </button>
      </div>

      {watching && (
        <div className="mt-4">
          {frameUrl ? (
            <>
              <div className="overflow-hidden rounded-[var(--radius-inner)] border border-[var(--color-line)] bg-neutral-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API_URL}${frameUrl}?v=${frameId}`}
                  alt={`latest room frame ${frameId}`}
                  className="block w-full"
                />
              </div>
              <p className="telemetry num mt-2">
                {frameId} · updated {ageSeconds}s ago · polling every{' '}
                {POLL_INTERVAL_MS / 1000}s
              </p>
            </>
          ) : (
            <p className="py-4 text-center text-sm text-[var(--color-text-dim)]">
              waiting for a frame… start the pi-agent or send one from the
              capture deck
            </p>
          )}
        </div>
      )}
    </section>
  );
}
