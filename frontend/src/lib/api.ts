// Backend API helpers — capture pipeline

import {
  API_URL,
  type AnalysisResult,
  type CaptureStatus,
  type FrameInfo,
  type HealthResponse,
  type ScanResult,
} from './types';

async function postImage(path: string, blob: Blob): Promise<FrameInfo> {
  const form = new FormData();
  form.append('file', blob, 'frame.jpg');
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', body: form });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `upload failed (${res.status})`);
  }
  return res.json();
}

export function uploadFrame(blob: Blob): Promise<FrameInfo> {
  return postImage('/frames', blob);
}

export function setBaseline(blob: Blob): Promise<FrameInfo> {
  return postImage('/baseline', blob);
}

export async function getStatus(): Promise<CaptureStatus> {
  const res = await fetch(`${API_URL}/status`);
  if (!res.ok) throw new Error(`status failed (${res.status})`);
  return res.json();
}

/** Run the local CV clutter engine on the latest stored frame. */
export async function runScan(): Promise<ScanResult> {
  const res = await fetch(`${API_URL}/scan`, { method: 'POST' });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `scan failed (${res.status})`);
  }
  return res.json();
}

/** Deep analysis: local CV + Claude Vision, driven by the user's vibe. */
export async function runAnalyze(
  vibeText: string,
  inspo: string[],
): Promise<AnalysisResult> {
  const res = await fetch(`${API_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vibeText, inspo }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `analyze failed (${res.status})`);
  }
  return res.json();
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`);
  if (!res.ok) throw new Error(`health failed (${res.status})`);
  return res.json();
}
