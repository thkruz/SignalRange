/**
 * Shared polar (az/el) grid and label drawing, used by PolarPlot and SkyPlot.
 * North is up, azimuth increases clockwise, r = R * (1 - el / 90).
 */

export interface PolarGridColors {
  grid: string;
  horizon: string;
  label: string;
}

export const DEFAULT_POLAR_GRID_COLORS: PolarGridColors = {
  grid: '#333',
  horizon: '#555',
  label: '#888',
};

/** Draw elevation circles (every 15 deg), azimuth radials (every 30 deg) and the horizon ring. */
export function drawPolarGrid(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number, colors: PolarGridColors = DEFAULT_POLAR_GRID_COLORS): void {
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;

  const elevationSteps = [90, 75, 60, 45, 30, 15, 0];
  for (const el of elevationSteps) {
    const r = radius * (1 - el / 90);
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, 2 * Math.PI);
    ctx.stroke();
  }

  for (let az = 0; az < 360; az += 30) {
    const angleRad = ((az - 90) * Math.PI) / 180;
    const x = centerX + radius * Math.cos(angleRad);
    const y = centerY + radius * Math.sin(angleRad);

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  ctx.strokeStyle = colors.horizon;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.stroke();
}

/** Draw N/E/S/W labels outside the horizon and elevation labels along the 30 deg radial. */
export function drawPolarLabels(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number, color: string = DEFAULT_POLAR_GRID_COLORS.label): void {
  ctx.fillStyle = color;
  ctx.textAlign = 'center';

  const labels = [
    { text: 'N', az: 0 },
    { text: 'E', az: 90 },
    { text: 'S', az: 180 },
    { text: 'W', az: 270 },
  ];

  for (const label of labels) {
    const angleRad = ((label.az - 90) * Math.PI) / 180;
    const labelRadius = radius + 12;
    ctx.fillText(label.text, centerX + labelRadius * Math.cos(angleRad), centerY + labelRadius * Math.sin(angleRad));
  }

  ctx.textAlign = 'left';
  const angleRad = ((60 - 90) * Math.PI) / 180;
  for (const el of [90, 75, 60, 45, 30, 15, 0]) {
    const r = radius * (1 - el / 90);
    ctx.fillText(`${el}°`, centerX + r * Math.cos(angleRad) + 5, centerY + r * Math.sin(angleRad));
  }
}
