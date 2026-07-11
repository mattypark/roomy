// Backend API helpers — capture pipeline

import {
  API_URL,
  type CaptureStatus,
  type FrameInfo,
  type HealthResponse,
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

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_URL}/health`);
  if (!res.ok) throw new Error(`health failed (${res.status})`);
  return res.json();
}
