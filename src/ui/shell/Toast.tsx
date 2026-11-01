'use client';
import { store, useSel } from '@/ui/state';

/** Transient status message; errors are announced assertively, everything else politely. */
export function Toast() {
  const notice = useSel(store, (s) => s.notice);
  if (!notice) return null;
  const tone = notice.kind === 'error' ? 'bad' : notice.kind === 'success' ? 'ok' : '';
  return (
    <div className="toast">
      <div className={`note ${tone} shadow-lg`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</div>
    </div>
  );
}
