import { useEffect, useRef, useState } from "react";

interface Props {
  series: Array<[number, number]>;
  cursorX: number;
  scale?: "lin" | "log";
}

const HEIGHT = 200;
const PADDING = 16;

// Hand-rolled canvas line chart for the hero Sim widget. Spec §6:
// recharts is forbidden here because 10Hz slider drag would jank.
// 60-point series redraw is ~0.4ms/frame at 60fps even with DPR scaling.
export function MiniChart({ series, cursorX, scale = "lin" }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(480);

  // Container-width tracking via ResizeObserver
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const update = () => setWidth(Math.max(parent.clientWidth, 240));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // Draw curve + cursor every time deps change
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    draw(canvas, series, cursorX, scale, width, HEIGHT);
  }, [series, cursorX, scale, width]);

  return (
    <canvas
      ref={ref}
      className="minichart"
      style={{ display: "block", width: "100%", height: HEIGHT }}
    />
  );
}

function draw(
  canvas: HTMLCanvasElement,
  series: Array<[number, number]>,
  cursorX: number,
  scale: "lin" | "log",
  w: number,
  h: number
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // DPR scaling for crisp lines on retina displays.
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (series.length < 2) {
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "12px monospace";
    ctx.fillText("(no curve)", PADDING, h / 2);
    return;
  }

  const xs = series.map((p) => p[0]);
  const ys = series.map((p) => p[1]);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  } else {
    const pad = (yMax - yMin) * 0.08;
    yMin -= pad;
    yMax += pad;
  }

  const xMap = (x: number) =>
    PADDING + ((x - xMin) / (xMax - xMin || 1)) * (w - PADDING * 2);

  const yMap = (y: number) => {
    if (scale === "log") {
      const safeMin = Math.max(yMin, 1e-9);
      const ly = Math.log10(Math.max(y, 1e-9));
      const lMin = Math.log10(safeMin);
      const lMax = Math.log10(Math.max(yMax, 1e-9));
      return (
        h - PADDING - ((ly - lMin) / (lMax - lMin || 1)) * (h - PADDING * 2)
      );
    }
    return (
      h - PADDING - ((y - yMin) / (yMax - yMin || 1)) * (h - PADDING * 2)
    );
  };

  // Faint horizontal gridlines
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PADDING + ((h - PADDING * 2) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(PADDING, y);
    ctx.lineTo(w - PADDING, y);
    ctx.stroke();
  }

  // Curve
  ctx.strokeStyle = "#cdd6e0";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(xMap(series[0]![0]), yMap(series[0]![1]));
  for (let i = 1; i < series.length; i++) {
    ctx.lineTo(xMap(series[i]![0]), yMap(series[i]![1]));
  }
  ctx.stroke();

  // Cursor line
  const cx = xMap(cursorX);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, PADDING);
  ctx.lineTo(cx, h - PADDING);
  ctx.stroke();

  // Cursor dot at interpolated curve point
  const cy = interpY(series, cursorX);
  if (cy != null && Number.isFinite(cy)) {
    ctx.fillStyle = "#cdd6e0";
    ctx.beginPath();
    ctx.arc(cx, yMap(cy), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function interpY(series: Array<[number, number]>, x: number): number | null {
  if (series.length === 0) return null;
  for (let i = 0; i < series.length - 1; i++) {
    const a = series[i]!;
    const b = series[i + 1]!;
    const [x0, y0] = a;
    const [x1, y1] = b;
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    if (x >= lo && x <= hi) {
      const denom = x1 - x0;
      if (denom === 0) return y0;
      const t = (x - x0) / denom;
      return y0 + t * (y1 - y0);
    }
  }
  return null;
}
