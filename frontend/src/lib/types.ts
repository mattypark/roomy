// Shared data models — mirrored in backend/models.py

export interface Zone {
  row: number;
  col: number;
  /** 0.0 = spotless, 1.0 = disaster */
  clutterScore: number;
  /** filled by Claude deep analysis in Stage 5 */
  reason?: string;
  suggestion?: string;
}

export interface ScanResult {
  zones: Zone[];
  gridRows: number;
  gridCols: number;
  /** 0.0–1.0 overall */
  overallScore: number;
  /** letter rank S/A/B/C/D */
  rank: string;
  /** "local" = CV grid pass, "claude" = deep analysis, "demo" = mocked */
  source: 'local' | 'claude' | 'demo';
  /** which stored frame was scanned (for drawing the overlay on it) */
  frameId?: string | null;
  frameUrl?: string | null;
  baselineUsed?: boolean;
}

export interface ShoppingItem {
  item: string;
  why: string;
}

/** Deep analysis = local CV scan enriched by Claude Vision. */
export interface AnalysisResult extends ScanResult {
  styleNotes?: string | null;
  shoppingList?: ShoppingItem[];
  /** set when Claude was requested but unavailable — local scan fallback */
  warning?: string | null;
}

export interface HealthResponse {
  status: string;
  stage: number;
  claudeEnabled: boolean;
}

export interface FrameInfo {
  id: string;
  width: number;
  height: number;
  capturedAt: number;
  url: string;
}

export interface CaptureStatus {
  baselineSet: boolean;
  latestSnapshotId?: string | null;
  latestSnapshotUrl?: string | null;
}

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
