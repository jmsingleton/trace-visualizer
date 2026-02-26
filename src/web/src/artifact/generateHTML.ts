import type { TraceEvent, SessionStats } from '../../../shared/types';

export function exportHTML(events: TraceEvent[], stats: SessionStats): void {
  const snapshot = JSON.stringify({ events, stats });
  const injected = document.documentElement.outerHTML.replace(
    '</head>',
    `<script>window.__TRACE_VIZ_SNAPSHOT__ = ${snapshot};</script></head>`
  );
  const blob = new Blob([injected], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `trace-viz-snapshot-${Date.now()}.html`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
