'use client';

import { useEffect, useState } from 'react';
import { API_URL, type HealthResponse } from '@/lib/types';

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6">
      <header>
        <p className="telemetry">ceiling overwatch // stage 1</p>
        <h1 className="mt-2 text-5xl font-bold tracking-tight">roomy</h1>
        <p className="mt-3 max-w-md text-[var(--color-text-dim)]">
          Maps your room&apos;s cleanliness zone by zone. Red means clean it.
          Green means chill.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-5">
        <p className="telemetry mb-3">backend link</p>
        {health ? (
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-clean)]" />
            <span>
              connected — stage {health.stage} · claude{' '}
              {health.claudeEnabled ? 'armed' : 'demo mode'}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                error
                  ? 'bg-[var(--color-dirty)]'
                  : 'animate-pulse bg-[var(--color-scan)]'
              }`}
            />
            <span className="text-[var(--color-text-dim)]">
              {error
                ? 'backend offline — run uvicorn main:app --port 8000'
                : 'linking…'}
            </span>
          </div>
        )}
      </section>
    </main>
  );
}
