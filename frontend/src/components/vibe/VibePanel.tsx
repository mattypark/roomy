'use client';

import { useRef } from 'react';

const STYLE_PRESETS = [
  'clean tech minimal',
  'dark academia',
  'cozy warm',
  'streetwear loud',
  'scandinavian calm',
  'gamer setup',
];

const MAX_INSPO = 3;
const INSPO_MAX_DIM = 800;

export interface VibeData {
  text: string;
  /** downscaled data-URLs — sent to Claude in stage 5 */
  inspo: string[];
}

interface VibePanelProps {
  vibe: VibeData;
  onChange: (vibe: VibeData) => void;
}

/** Downscale an image file to a compact JPEG data-URL for storage + API use. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, INSPO_MAX_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('could not read image'));
    };
    img.src = url;
  });
}

/** Step 02 — tell roomy what you're going for. Feeds the AI stylist (stage 5). */
export function VibePanel({ vibe, onChange }: VibePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function appendPreset(preset: string) {
    const text = vibe.text.trim();
    onChange({ ...vibe, text: text ? `${text}, ${preset}` : preset });
  }

  async function onInspoPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(
      0,
      MAX_INSPO - vibe.inspo.length,
    );
    event.target.value = '';
    const converted = await Promise.all(files.map(fileToDataUrl));
    onChange({ ...vibe, inspo: [...vibe.inspo, ...converted] });
  }

  function removeInspo(index: number) {
    onChange({ ...vibe, inspo: vibe.inspo.filter((_, i) => i !== index) });
  }

  return (
    <section className="card">
      <div className="mb-4 flex items-center justify-between">
        <p className="telemetry">vibe intake</p>
        <p className="telemetry">powers the ai stylist · stage 5</p>
      </div>

      <label htmlFor="vibe-text" className="mb-2 block text-sm font-medium">
        What&apos;s the vibe you want for your room?
      </label>
      <textarea
        id="vibe-text"
        value={vibe.text}
        onChange={(event) => onChange({ ...vibe, text: event.target.value })}
        placeholder="e.g. clean tech minimal — black/white, no visible cables, one plant, everything has a place"
        rows={3}
        className="w-full resize-y rounded-[var(--radius-inner)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5 text-sm transition-[border-color] duration-150 ease-out focus:border-[var(--color-ink)] focus:outline-none"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {STYLE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="chip"
            onClick={() => appendPreset(preset)}
          >
            + {preset}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">Inspo photos</p>
          <p className="telemetry num">
            {vibe.inspo.length}/{MAX_INSPO}
          </p>
        </div>
        <p className="mb-3 text-sm text-[var(--color-text-dim)]">
          Rooms, setups, or moodboards you want yours to feel like.
        </p>
        <div className="flex flex-wrap gap-3">
          {vibe.inspo.map((src, index) => (
            <div key={index} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`inspo ${index + 1}`}
                className="h-24 w-24 rounded-[var(--radius-inner)] object-cover"
              />
              <button
                type="button"
                aria-label={`remove inspo ${index + 1}`}
                onClick={() => removeInspo(index)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-ink)] bg-[var(--color-surface-raised)] text-xs leading-none opacity-0 transition-opacity duration-150 ease-out hover:bg-[var(--color-ink)] hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
          {vibe.inspo.length < MAX_INSPO && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-24 w-24 items-center justify-center rounded-[var(--radius-inner)] border border-dashed border-[var(--color-line)] text-2xl text-[var(--color-text-dim)] transition-[border-color,color] duration-150 ease-out hover:border-[var(--color-ink)] hover:text-[var(--color-ink)]"
            >
              +
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={onInspoPicked}
        />
      </div>
    </section>
  );
}
