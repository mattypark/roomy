'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { API_URL, type ScanResult, type Zone } from '@/lib/types';

interface ZoneOverlayProps {
  scan: ScanResult;
}

const SWEEP_DURATION_S = 1.1;
/** cells below this read as "clean enough" and stay nearly invisible */
const CLEAN_FLOOR = 0.18;

/** clutter score → overlay color. green (clean) → amber → red (clean it). */
function cellColor(score: number): string {
  const hue = 140 * (1 - Math.min(score / 0.7, 1)); // 140 green → 0 red
  const alpha = score < CLEAN_FLOOR ? 0.1 : 0.18 + score * 0.45;
  return `hsla(${hue}, 85%, 55%, ${alpha})`;
}

function cellBorder(score: number): string {
  const hue = 140 * (1 - Math.min(score / 0.7, 1));
  return `hsla(${hue}, 85%, 60%, ${score < CLEAN_FLOOR ? 0.25 : 0.8})`;
}

function statusWord(score: number): string {
  if (score < CLEAN_FLOOR) return 'clear';
  if (score < 0.4) return 'warm';
  if (score < 0.65) return 'messy';
  return 'hot zone';
}

/** Red/green cleanliness heat map painted over the scanned frame. */
export function ZoneOverlay({ scan }: ZoneOverlayProps) {
  const [hovered, setHovered] = useState<Zone | null>(null);
  const [sweeping, setSweeping] = useState(true);

  // re-run the sweep every time a new scan lands
  useEffect(() => {
    setSweeping(true);
    const timer = setTimeout(() => setSweeping(false), SWEEP_DURATION_S * 1000);
    return () => clearTimeout(timer);
  }, [scan]);

  const cellWidth = 100 / scan.gridCols;
  const cellHeight = 100 / scan.gridRows;

  return (
    <div>
      <div
        className="relative overflow-hidden rounded border border-[var(--color-line)] bg-black"
        onMouseLeave={() => setHovered(null)}
      >
        {scan.frameUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${API_URL}${scan.frameUrl}`}
            alt={`scanned frame ${scan.frameId ?? ''}`}
            className="block w-full"
          />
        )}

        {/* heat cells — revealed column by column behind the sweep line */}
        <div className="absolute inset-0">
          {scan.zones.map((zone) => (
            <motion.div
              key={`${zone.row}-${zone.col}`}
              className="absolute cursor-crosshair"
              style={{
                left: `${zone.col * cellWidth}%`,
                top: `${zone.row * cellHeight}%`,
                width: `${cellWidth}%`,
                height: `${cellHeight}%`,
                backgroundColor: cellColor(zone.clutterScore),
                border: `1px solid ${cellBorder(zone.clutterScore)}`,
                boxShadow:
                  hovered === zone
                    ? 'inset 0 0 0 2px var(--color-scan)'
                    : undefined,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                delay: (zone.col / scan.gridCols) * SWEEP_DURATION_S,
                duration: 0.35,
                ease: 'easeOut',
              }}
              onMouseEnter={() => setHovered(zone)}
            />
          ))}
        </div>

        {/* scan sweep line */}
        {sweeping && (
          <motion.div
            className="pointer-events-none absolute inset-y-0 w-[3px]"
            style={{
              background: 'var(--color-scan)',
              boxShadow: '0 0 18px 4px var(--color-scan)',
            }}
            initial={{ left: '0%' }}
            animate={{ left: '100%' }}
            transition={{ duration: SWEEP_DURATION_S, ease: 'linear' }}
          />
        )}
      </div>

      {/* inspection bar */}
      <div className="mt-2 flex items-center justify-between rounded border border-[var(--color-line)] px-3 py-2">
        {hovered ? (
          <p className="telemetry">
            zone [{hovered.row},{hovered.col}] · clutter{' '}
            {(hovered.clutterScore * 100).toFixed(0)}% ·{' '}
            <span
              style={{
                color:
                  hovered.clutterScore < CLEAN_FLOOR
                    ? 'var(--color-clean)'
                    : hovered.clutterScore < 0.4
                      ? 'var(--color-scan)'
                      : 'var(--color-dirty)',
              }}
            >
              {statusWord(hovered.clutterScore)}
            </span>
          </p>
        ) : (
          <p className="telemetry">hover zones to inspect</p>
        )}
        <div className="flex items-center gap-3">
          <span className="telemetry flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[var(--color-clean)]" /> clean
          </span>
          <span className="telemetry flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[var(--color-dirty)]" /> clean it
          </span>
        </div>
      </div>
    </div>
  );
}
