'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getHistory, wipeHistory } from '@/lib/api';
import type { HistoryEntry } from '@/lib/types';

interface HistoryPanelProps {
  /** bump to refetch — page increments after every scan/analyze */
  refreshToken: number;
}

const WIDTH = 600;
const HEIGHT = 200;
const PAD = { top: 16, right: 48, bottom: 26, left: 40 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
const Y_TICKS = [0, 25, 50, 75, 100];

function scoreColor(score: number): string {
  if (score < 0.25) return 'var(--color-clean)';
  if (score < 0.5) return 'var(--color-text)';
  return 'var(--color-dirty)';
}

function timeLabel(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Room cleanliness over time — clutter % per scan, lower is cleaner. */
export function HistoryPanel({ refreshToken }: HistoryPanelProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    getHistory()
      .then(setEntries)
      .catch(() => null);
  }, [refreshToken]);

  const points = useMemo(() => {
    if (entries.length === 0) return [];
    const step = entries.length > 1 ? PLOT_W / (entries.length - 1) : 0;
    return entries.map((entry, index) => ({
      x: PAD.left + (entries.length > 1 ? index * step : PLOT_W / 2),
      y: PAD.top + PLOT_H * entry.overallScore,
      entry,
    }));
  }, [entries]);

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i].x - x) < Math.abs(points[nearest].x - x)) nearest = i;
    }
    setHovered(nearest);
  }

  async function handleWipe() {
    await wipeHistory().catch(() => null);
    setEntries([]);
    setHovered(null);
  }

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath =
    points.length > 1
      ? `${linePath} L${points[points.length - 1].x.toFixed(1)},${PAD.top + PLOT_H} L${points[0].x.toFixed(1)},${PAD.top + PLOT_H} Z`
      : '';
  const last = points[points.length - 1];
  const hoveredPoint = hovered !== null ? points[hovered] : null;

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="telemetry">room timeline</p>
          <p className="mt-0.5 text-sm text-[var(--color-text-dim)]">
            clutter % per scan — lower is cleaner
          </p>
        </div>
        {entries.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={handleWipe}>
            clear
          </button>
        )}
      </div>

      {entries.length < 2 ? (
        <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">
          {entries.length === 0
            ? 'no scans yet — every scan lands here so you can watch the trend'
            : 'one scan logged — run another later to start the trend line'}
        </p>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="block w-full"
            role="img"
            aria-label={`Room clutter over ${entries.length} scans, latest ${(entries[entries.length - 1].overallScore * 100).toFixed(0)} percent, rank ${entries[entries.length - 1].rank}`}
            onMouseMove={onMove}
            onMouseLeave={() => setHovered(null)}
          >
            {/* gridlines — hairline, recessive */}
            {Y_TICKS.map((tick) => {
              const y = PAD.top + PLOT_H * (tick / 100);
              return (
                <g key={tick}>
                  <line
                    x1={PAD.left}
                    x2={PAD.left + PLOT_W}
                    y1={y}
                    y2={y}
                    stroke="var(--color-line)"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fontSize={10}
                    fill="var(--color-text-dim)"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* x labels — first and last scan times */}
            <text
              x={PAD.left}
              y={HEIGHT - 8}
              fontSize={10}
              fill="var(--color-text-dim)"
            >
              {timeLabel(entries[0].timestamp)}
            </text>
            <text
              x={PAD.left + PLOT_W}
              y={HEIGHT - 8}
              textAnchor="end"
              fontSize={10}
              fill="var(--color-text-dim)"
            >
              {timeLabel(entries[entries.length - 1].timestamp)}
            </text>

            {/* area wash + line */}
            <path d={areaPath} fill="var(--color-ink)" opacity={0.08} />
            <path
              d={linePath}
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* crosshair */}
            {hoveredPoint && (
              <line
                x1={hoveredPoint.x}
                x2={hoveredPoint.x}
                y1={PAD.top}
                y2={PAD.top + PLOT_H}
                stroke="var(--color-text-dim)"
                strokeWidth={1}
              />
            )}

            {/* hovered point marker — surface ring + fill */}
            {hoveredPoint && (
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.y}
                r={5}
                fill={scoreColor(hoveredPoint.entry.overallScore)}
                stroke="var(--color-surface-raised)"
                strokeWidth={2}
              />
            )}

            {/* endpoint — semantic color, direct label */}
            {last && (
              <>
                <circle
                  cx={last.x}
                  cy={last.y}
                  r={4}
                  fill={scoreColor(last.entry.overallScore)}
                  stroke="var(--color-surface-raised)"
                  strokeWidth={2}
                />
                <text
                  x={last.x + 8}
                  y={last.y + 3.5}
                  fontSize={11}
                  fontWeight={600}
                  fill="var(--color-text)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {(last.entry.overallScore * 100).toFixed(0)}%
                </text>
              </>
            )}
          </svg>

          {/* tooltip — value leads, label follows */}
          {hoveredPoint && (
            <div
              className="pointer-events-none absolute -top-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-raised)] px-2.5 py-1.5 text-xs shadow-sm"
              style={{
                left: `${(hoveredPoint.x / WIDTH) * 100}%`,
                transform:
                  hoveredPoint.x > WIDTH * 0.7
                    ? 'translateX(-100%)'
                    : 'translateX(8px)',
              }}
            >
              <p className="num font-semibold">
                {(hoveredPoint.entry.overallScore * 100).toFixed(1)}% · rank{' '}
                {hoveredPoint.entry.rank}
              </p>
              <p className="text-[var(--color-text-dim)]">
                {timeLabel(hoveredPoint.entry.timestamp)} ·{' '}
                {hoveredPoint.entry.source}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
