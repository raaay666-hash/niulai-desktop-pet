import { compactVolume } from '../niulai-android/web/market-chart-data.mjs';
import { fmt } from './desktop-ui.js';

export const minuteText = minute => String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');

export function drawMinuteChart(ctx, width, height, result, selected, color) {
  const { points, start, end, lunch, previousClose } = result;
  const left = 8, plotWidth = Math.max(20, width - left - 77);
  const top = 12, bottom = height - 82, volumeTop = height - 59, volumeBottom = height - 22;
  const x = minute => left + (minute - start) / Math.max(1, end - start) * plotWidth;
  const prices = points.map(point => point.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const center = previousClose ?? (hi + lo) / 2;
  const spread = Math.max(center - lo, hi - center, center * .001, .001) * 1.08;
  const tickDigits = spread < .05 ? 4 : spread < .5 ? 3 : 2;
  const y = value => bottom - (value - (center - spread)) / (2 * spread) * (bottom - top);
  const accent = color('--blue'), muted = color('--muted');
  ctx.font = '10px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (let step = -2; step <= 2; step++) {
    const value = center + step * spread / 2, py = y(value);
    ctx.strokeStyle = step === 0 && previousClose ? muted : color('--line');
    ctx.setLineDash(step === 0 && previousClose ? [4, 4] : []);
    ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(left + plotWidth, py); ctx.stroke();
    ctx.fillStyle = muted;
    ctx.fillText(fmt(value, tickDigits), left + plotWidth + 7, py);
  }
  ctx.setLineDash([]);
  if (lunch) {
    ctx.fillStyle = color('--soft');
    ctx.fillRect(x(lunch[0]), top, x(lunch[1]) - x(lunch[0]), bottom - top);
    ctx.fillStyle = muted;
    ctx.textAlign = 'center';
    ctx.fillText('午休', (x(lunch[0]) + x(lunch[1])) / 2, bottom - 10);
    ctx.textAlign = 'left';
  }
  const segments = [[points[0]]];
  for (let index = 1; index < points.length; index++) {
    const point = points[index];
    if (point.minute - points[index - 1].minute > 2) segments.push([]);
    segments[segments.length - 1].push(point);
  }
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, color('--minute-shade'));
  gradient.addColorStop(1, color('--minute-shade-end'));
  for (const segment of segments) {
    const first = segment[0], last = segment[segment.length - 1];
    if (segment.length === 1) {
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(x(first.minute), y(first.price), 1.8, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    ctx.beginPath(); ctx.moveTo(x(first.minute), y(first.price));
    for (const point of segment.slice(1)) ctx.lineTo(x(point.minute), y(point.price));
    ctx.strokeStyle = accent; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.lineTo(x(last.minute), bottom); ctx.lineTo(x(first.minute), bottom); ctx.closePath();
    ctx.fillStyle = gradient; ctx.fill();
  }
  const maxVolume = Math.max(0, ...points.map(point => point.volume || 0));
  const barWidth = Math.max(1, plotWidth / Math.max(1, end - start) * .74);
  ctx.fillStyle = muted; ctx.fillText('成交量', left, volumeTop - 9);
  if (maxVolume) {
    ctx.fillText(compactVolume(maxVolume), left + plotWidth + 7, volumeTop);
    ctx.fillStyle = accent; ctx.globalAlpha = .5;
    for (const point of points) {
      if (point.volume > 0) {
        const height = Math.max(1, point.volume / maxVolume * (volumeBottom - volumeTop));
        ctx.fillRect(x(point.minute) - barWidth / 2, volumeBottom - height, barWidth, height);
      }
    }
    ctx.globalAlpha = 1;
  }
  const point = points[selected ?? points.length - 1];
  const px = x(point.minute), py = y(point.price);
  if (selected !== null) {
    ctx.strokeStyle = muted; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, volumeBottom);
    ctx.moveTo(left, py); ctx.lineTo(left + plotWidth, py); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = muted; ctx.fillText(minuteText(start), left, height - 7);
  ctx.textAlign = 'center';
  const midday = lunch ? Math.floor((lunch[0] + lunch[1]) / 2) : 720;
  if (midday > start && midday < end) ctx.fillText(lunch ? minuteText(lunch[0]) + ' / ' + minuteText(lunch[1]) : minuteText(midday), x(midday), height - 7);
  ctx.textAlign = 'right'; ctx.fillText(minuteText(end), left + plotWidth, height - 7);
  return { width, nearest(pointer) {
    let nearest = 0;
    for (let index = 1; index < points.length; index++) {
      if (Math.abs(x(points[index].minute) - pointer) < Math.abs(x(points[nearest].minute) - pointer)) nearest = index;
    }
    return nearest;
  } };
}
