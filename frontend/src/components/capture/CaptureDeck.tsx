'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { setBaseline, uploadFrame } from '@/lib/api';
import type { FrameInfo } from '@/lib/types';

type CameraState = 'off' | 'starting' | 'live' | 'denied';

interface CaptureDeckProps {
  onFrameStored: (frame: FrameInfo) => void;
  onBaselineStored: (frame: FrameInfo) => void;
}

/** Dev-mode capture layer: webcam feed or photo upload → frame blob → backend.
 *  The ceiling Pi camera replaces this as a frame source in Stage 6. */
export function CaptureDeck({ onFrameStored, onBaselineStored }: CaptureDeckProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [camera, setCamera] = useState<CameraState>('off');
  const [preview, setPreview] = useState<string | null>(null);
  const [frameBlob, setFrameBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState<'frame' | 'baseline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const reducedMotion = useReducedMotion();

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCamera('off');
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    setError(null);
    setCamera('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamera('live');
    } catch {
      setCamera('denied');
      setError('camera blocked — use photo upload instead');
    }
  }

  function snapFrame() {
    const video = videoRef.current;
    if (!video || camera !== 'live') return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setFrameBlob(blob);
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
        if (!reducedMotion) {
          setFlash(true);
          setTimeout(() => setFlash(false), 180);
        }
      },
      'image/jpeg',
      0.9,
    );
  }

  function onFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFrameBlob(file);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setError(null);
    event.target.value = '';
  }

  async function send(kind: 'frame' | 'baseline') {
    if (!frameBlob) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'frame') onFrameStored(await uploadFrame(frameBlob));
      else onBaselineStored(await setBaseline(frameBlob));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'upload failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card">
      <div className="mb-4 flex items-center justify-between">
        <p className="telemetry">capture deck // dev mode</p>
        <p className="telemetry">pi cam · stage 6</p>
      </div>

      {/* viewport: live feed or captured preview */}
      <div className="relative aspect-video overflow-hidden rounded-[var(--radius-inner)] border border-[var(--color-line)] bg-neutral-950">
        <video
          ref={videoRef}
          muted
          playsInline
          className={`h-full w-full object-cover ${camera === 'live' ? '' : 'hidden'}`}
        />
        {camera !== 'live' && preview && (
          // captured frame preview (webcam snap or uploaded photo)
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="captured frame" className="h-full w-full object-cover" />
        )}
        {camera !== 'live' && !preview && (
          <div className="flex h-full items-center justify-center">
            <p className="telemetry" style={{ color: "rgba(255,255,255,0.55)" }}>no signal — start camera or upload photo</p>
          </div>
        )}
        <AnimatePresence>
          {flash && (
            <motion.div
              className="absolute inset-0 bg-white"
              initial={{ opacity: 0.9 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            />
          )}
        </AnimatePresence>
        {camera === 'live' && preview && (
          <div className="absolute bottom-2 right-2 w-28 overflow-hidden rounded border border-white/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="last capture" className="block w-full" />
          </div>
        )}
      </div>

      {/* source controls */}
      <div className="mt-4 flex flex-wrap gap-2">
        {camera === 'live' ? (
          <>
            <button className="btn btn-ghost" onClick={snapFrame}>
              ◉ snap frame
            </button>
            <button className="btn btn-ghost" onClick={stopCamera}>
              stop camera
            </button>
          </>
        ) : (
          <button
            className="btn btn-ghost"
            onClick={startCamera}
            disabled={camera === 'starting'}
          >
            {camera === 'starting' ? 'starting…' : '▶ start camera'}
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}>
          ⇪ upload photo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onFilePicked}
        />
      </div>

      {/* send-to-backend actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="btn"
          onClick={() => send('frame')}
          disabled={!frameBlob || busy !== null}
        >
          {busy === 'frame' ? 'sending…' : '↗ send frame'}
        </button>
        <button
          className="btn"  style={{ borderColor: "var(--color-clean)", color: "var(--color-clean)" }}
          onClick={() => send('baseline')}
          disabled={!frameBlob || busy !== null}
        >
          {busy === 'baseline' ? 'saving…' : '✓ set as clean baseline'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-[var(--color-dirty)]">{error}</p>}
    </section>
  );
}
