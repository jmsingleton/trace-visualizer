import React, { useRef, useEffect, useCallback } from 'react';
import { useEvents } from '../contexts/EventContext';
import { theme } from '../styles/theme';
import type { ToolType } from '../../../shared/types';

const TOOL_LABELS: ToolType[] = ['bash', 'file', 'web', 'task', 'other'];
const TOOL_COLORS: Record<ToolType, string> = {
  bash: theme.purple, file: theme.cyan, web: theme.pink, task: theme.gold, other: theme.text,
};
const BAR_COUNT = 40;
const BARS_PER_TYPE = BAR_COUNT / TOOL_LABELS.length;

export function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heights = useRef(new Float32Array(BAR_COUNT).fill(0.02));
  const { latestEvent } = useEvents();

  // Spike bars on tool call
  useEffect(() => {
    if (!latestEvent || latestEvent.type !== 'tool_start') return;
    const typeIdx = TOOL_LABELS.indexOf(latestEvent.toolType);
    const center = Math.round(typeIdx * BARS_PER_TYPE + BARS_PER_TYPE / 2);
    const h = heights.current;
    for (let i = 0; i < BAR_COUNT; i++) {
      const dist = Math.abs(i - center);
      h[i] = Math.min(1, h[i] + Math.max(0, 1 - dist * 0.25));
    }
  }, [latestEvent]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    const h = heights.current;
    const now = Date.now();

    ctx.clearRect(0, 0, W, H);

    // Subtle grid lines
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 0.5;
    for (let y = H; y > 0; y -= H * 0.2) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const bw = W / BAR_COUNT;
    const gap = Math.max(1, bw * 0.15);

    for (let i = 0; i < BAR_COUNT; i++) {
      // Organic decay + idle pulse
      const idle = Math.sin(now * 0.0008 + i * 0.6) * 0.012 + 0.015;
      h[i] = Math.max(idle, h[i] * 0.94);

      const typeIdx = Math.floor(i / BARS_PER_TYPE);
      const color = TOOL_COLORS[TOOL_LABELS[typeIdx]];
      const barH = h[i] * H * 0.88;
      const x = i * bw + gap / 2;
      const y = H - barH;

      ctx.save();
      ctx.shadowBlur = 14;
      ctx.shadowColor = color;

      // Main bar with vertical gradient
      const grad = ctx.createLinearGradient(0, y, 0, H);
      grad.addColorStop(0, color);
      grad.addColorStop(1, color + '44');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, bw - gap, barH);

      // Bright top cap
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#ffffff99';
      ctx.fillRect(x, y, bw - gap, Math.max(2, barH * 0.04));

      ctx.restore();
    }
  }, []);

  // Animation loop using canvas dimensions directly (not devicePixelRatio scaled)
  useEffect(() => {
    let raf: number;
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  // Resize: update canvas size to match CSS layout size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: theme.bgPanel, borderRadius: 6, overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {/* Tool type legend */}
      <div style={{
        position: 'absolute', bottom: 10, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 20, pointerEvents: 'none',
      }}>
        {TOOL_LABELS.map(t => (
          <span key={t} style={{ color: TOOL_COLORS[t], fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' }}>
            ▪ {t}
          </span>
        ))}
      </div>
    </div>
  );
}
