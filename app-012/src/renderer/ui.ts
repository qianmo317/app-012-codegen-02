import type { Prescription, WeighResult } from '../types';
import {
  SLIP_STEP_LABELS,
  formatClock,
  formatDuration,
  getCurrentStep,
  getReturnCount,
  getStuckDuration,
  isSlipDispensed,
} from '../tracking';
import type { TrackingSlip } from '../tracking';

export class UIRenderer {
  prescriptionX: number = 20;
  prescriptionY: number = 60;
  prescriptionW: number = 260;
  buttonRects: Array<{ x: number; y: number; w: number; h: number; action: string }> = [];

  layout(canvasW: number, _canvasH: number): void {
    this.prescriptionX = 20;
    this.prescriptionY = 60;
    this.prescriptionW = Math.min(260, canvasW * 0.3);
  }

  drawPrescription(ctx: CanvasRenderingContext2D, prescription: Prescription, weighed: Set<string>, currentHerb: string | null): void {
    const x = this.prescriptionX;
    const y = this.prescriptionY;
    const w = this.prescriptionW;
    const lineH = 32;

    ctx.fillStyle = 'rgba(255, 252, 245, 0.95)';
    ctx.fillRect(x, y, w, prescription.items.length * lineH + 50);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, prescription.items.length * lineH + 50);

    ctx.fillStyle = '#8b4513';
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('处方', x + 10, y + 24);

    prescription.items.forEach((item, i) => {
      const iy = y + 44 + i * lineH;
      const isWeighed = weighed.has(item.herb);
      const isCurrent = currentHerb === item.herb;

      if (isCurrent) {
        ctx.fillStyle = 'rgba(212, 165, 116, 0.3)';
        ctx.fillRect(x + 4, iy - 18, w - 8, lineH - 2);
      }

      ctx.fillStyle = isWeighed ? '#999' : '#333';
      ctx.font = `${isWeighed ? '' : 'bold '}15px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'left';
      let text = `${item.herb} ${item.grams}g`;
      if (item.decoct === 'first') text += ' [先煎]';
      if (item.decoct === 'last') text += ' [后下]';
      ctx.fillText(text, x + 12, iy);

      if (isWeighed) {
        ctx.beginPath();
        ctx.moveTo(x + 12, iy - 4);
        ctx.lineTo(x + w - 12, iy - 4);
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  }

  drawSlip(ctx: CanvasRenderingContext2D, slip: TrackingSlip, now: number): void {
    const x = this.prescriptionX;
    const w = this.prescriptionW;
    // 紧跟处方面板下方（处方面板高 = 味数 * 32 + 50）
    const y = this.prescriptionY + slip.herbCount * 32 + 50 + 12;

    const dispensed = isSlipDispensed(slip);
    const current = getCurrentStep(slip);
    const returnCount = getReturnCount(slip);
    const lastReturn = slip.returns[slip.returns.length - 1] ?? null;
    const lastNote = slip.annotations[slip.annotations.length - 1] ?? null;

    let h = 14 + 20 + 16 * 3 + 30 + 16; // 边距 + 标题 + 3行信息 + 步骤条 + 退回次数
    if (current) h += 16;
    if (lastReturn) h += 14;
    if (dispensed) h += 16;
    if (lastNote) h += 14;
    h += 8;

    ctx.fillStyle = 'rgba(255, 252, 245, 0.92)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = dispensed ? '#228b22' : '#8b6914';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    let ty = y + 18;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#8b4513';
    ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
    ctx.fillText(`流转单 ${slip.id}`, x + 10, ty);
    ty += 16;

    ctx.fillStyle = '#333';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText(`处方 ${slip.prescriptionId}`, x + 10, ty);
    ty += 16;
    ctx.fillText(`病人 ${slip.patientName} · ${slip.herbCount}味药`, x + 10, ty);
    ty += 16;
    ctx.fillText(`接单 ${slip.receivedBy} ${formatClock(slip.receivedAt)}`, x + 10, ty);
    ty += 22;

    // 四步进度条：抓药 → 复核 → 包好 → 发出
    const chipGap = 6;
    const chipW = (w - 20 - chipGap * 3) / 4;
    slip.steps.forEach((step, i) => {
      const cx = x + 10 + i * (chipW + chipGap);
      const cy = ty - 12;
      const color = step.status === 'done' ? '#228b22' : step.status === 'active' ? '#d47f00' : '#999';
      const mark = step.status === 'done' ? '✓' : step.status === 'active' ? '●' : '○';
      ctx.fillStyle = step.status === 'active' ? 'rgba(212, 165, 116, 0.35)' : 'rgba(0, 0, 0, 0.04)';
      ctx.fillRect(cx, cy, chipW, 20);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx, cy, chipW, 20);
      ctx.fillStyle = color;
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${SLIP_STEP_LABELS[step.key]}${mark}`, cx + chipW / 2, cy + 14);
      ctx.textAlign = 'left';
    });
    ty += 12;

    if (current) {
      const stuckMs = getStuckDuration(slip, now);
      const overdue = stuckMs > 60_000;
      ctx.fillStyle = overdue ? '#dc143c' : '#b06a00';
      ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
      ctx.fillText(`▸ 卡在【${SLIP_STEP_LABELS[current.key]}】已停 ${formatDuration(stuckMs)}`, x + 10, ty);
      ty += 16;
    }

    ctx.fillStyle = returnCount > 0 ? '#dc143c' : '#999';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText(`退回 ${returnCount} 次`, x + 10, ty);
    ty += 16;

    if (lastReturn) {
      ctx.fillStyle = '#a04040';
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.fillText(`末次 ${formatClock(lastReturn.returnedAt)} ${truncate(lastReturn.reason, 16)}`, x + 10, ty);
      ty += 14;
    }

    if (dispensed && slip.dispensedAt !== null) {
      ctx.fillStyle = '#228b22';
      ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
      ctx.fillText(`已发出 ${formatClock(slip.dispensedAt)} · 归档只可加注`, x + 10, ty);
      ty += 16;
    }

    if (lastNote) {
      ctx.fillStyle = '#666';
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.fillText(`附 ${formatClock(lastNote.addedAt)} ${truncate(lastNote.note, 16)}`, x + 10, ty);
      ty += 14;
    }
  }

  drawStatus(ctx: CanvasRenderingContext2D, level: number, score: number, combo: number, queue: number, satisfaction: number, timeLeft: number | null): void {
    const x = 20;
    const y = 10;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, 600, 48);

    ctx.fillStyle = '#f5e6d3';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    let text = `第${level}关  分数:${score}  连击:${combo}  排队:${queue}  满意度:${satisfaction}`;
    if (timeLeft !== null) {
      const color = timeLeft < 10 ? '#ff4444' : '#f5e6d3';
      ctx.fillStyle = color;
      text += `  时间:${Math.ceil(timeLeft)}s`;
    }
    ctx.fillText(text, x, y + 24);
  }

  drawPackageArea(ctx: CanvasRenderingContext2D, _canvasW: number, canvasH: number, packages: Array<{ herb: string; grams: number; decoct: string }>): void {
    const x = 20;
    const y = canvasH - 120;
    const w = 400;
    const h = 100;

    ctx.fillStyle = 'rgba(245, 230, 211, 0.9)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#8b4513';
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('已分包', x + 10, y + 20);

    packages.forEach((pkg, i) => {
      const px = x + 10 + (i % 4) * 95;
      const py = y + 36 + Math.floor(i / 4) * 28;
      ctx.fillStyle = '#fff8f0';
      ctx.fillRect(px, py, 88, 24);
      ctx.strokeStyle = '#d4a574';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, 88, 24);
      ctx.fillStyle = '#333';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let label = `${pkg.herb}`;
      if (pkg.decoct !== 'normal') label += '*';
      ctx.fillText(label, px + 44, py + 12);
    });
  }

  drawButtons(_ctx: CanvasRenderingContext2D): void {
    this.buttonRects = [];
  }

  drawMenu(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, highestScore: number, highestLevel: number): void {
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.fillStyle = '#d4a574';
    ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('中药柜抓药', cx, cy - 120);
    ctx.font = '20px "Microsoft YaHei", sans-serif';
    ctx.fillText('戥子称重模拟', cx, cy - 80);

    const buttons = [
      { label: '开始游戏', action: 'start' },
      { label: '无尽模式', action: 'endless' },
    ];

    this.buttonRects = [];
    buttons.forEach((btn, i) => {
      const bx = cx - 80;
      const by = cy - 20 + i * 60;
      const bw = 160;
      const bh = 44;

      ctx.fillStyle = '#6b4e23';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#d4a574';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.fillStyle = '#f5e6d3';
      ctx.font = '18px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, cx, by + bh / 2);

      this.buttonRects.push({ x: bx, y: by, w: bw, h: bh, action: btn.action });
    });

    ctx.fillStyle = '#888';
    ctx.font = '14px sans-serif';
    ctx.fillText(`最高分: ${highestScore}  最高关卡: ${highestLevel}`, cx, cy + 120);
  }

  drawReview(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, herb: string, options: number[], selected: number | null, result: boolean | null): void {
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const w = 360;
    const h = 240;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = '#fff8f0';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);

    ctx.fillStyle = '#8b4513';
    ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`复核：刚才 ${herb} 抓了多少克？`, cx, cy - 70);

    this.buttonRects = [];
    options.forEach((opt, i) => {
      const bx = cx - 140 + i * 100;
      const by = cy - 20;
      const bw = 80;
      const bh = 44;

      ctx.fillStyle = selected === opt && result === false ? '#ff6b6b' : selected === opt && result === true ? '#90ee90' : '#f5e6d3';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#8b6914';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.fillStyle = '#333';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${opt}g`, bx + bw / 2, by + bh / 2);

      this.buttonRects.push({ x: bx, y: by, w: bw, h: bh, action: `review-${opt}` });
    });

    if (result !== null) {
      ctx.fillStyle = result ? '#228b22' : '#dc143c';
      ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
      ctx.fillText(result ? '回答正确！' : '回答错误！', cx, cy + 50);
    }
  }

  drawResult(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, score: number, level: number, results: WeighResult[], passed: boolean): void {
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = '#fff8f0';
    ctx.fillRect(cx - 200, cy - 180, 400, 360);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - 200, cy - 180, 400, 360);

    ctx.fillStyle = passed ? '#228b22' : '#dc143c';
    ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(passed ? '关卡通过！' : '关卡失败', cx, cy - 140);

    ctx.fillStyle = '#333';
    ctx.font = '18px sans-serif';
    ctx.fillText(`第${level}关  得分: ${score}`, cx, cy - 100);

    results.forEach((r, i) => {
      const ry = cy - 60 + i * 28;
      const color = r.ok ? '#228b22' : '#dc143c';
      ctx.fillStyle = color;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${r.herb}: 目标${r.target}g 实际${r.actual.toFixed(1)}g 差${r.deltaG > 0 ? '+' : ''}${r.deltaG.toFixed(1)}g`, cx - 160, ry);
    });

    this.buttonRects = [];
    const btnLabel = passed ? '下一关' : '重试';
    const bx = cx - 60;
    const by = cy + 140;
    const bw = 120;
    const bh = 40;

    ctx.fillStyle = '#6b4e23';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = '#f5e6d3';
    ctx.font = '18px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btnLabel, cx, by + bh / 2);

    this.buttonRects.push({ x: bx, y: by, w: bw, h: bh, action: passed ? 'next' : 'retry' });
  }

  drawGameOver(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, score: number, level: number): void {
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = '#dc143c';
    ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('病人都走光了', cx, cy - 60);

    ctx.fillStyle = '#f5e6d3';
    ctx.font = '20px sans-serif';
    ctx.fillText(`最终得分: ${score}  通过关卡: ${level}`, cx, cy);

    this.buttonRects = [];
    const bx = cx - 60;
    const by = cy + 50;
    const bw = 120;
    const bh = 40;

    ctx.fillStyle = '#6b4e23';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = '#f5e6d3';
    ctx.font = '18px "Microsoft YaHei", sans-serif';
    ctx.fillText('返回菜单', cx, by + bh / 2);

    this.buttonRects.push({ x: bx, y: by, w: bw, h: bh, action: 'menu' });
  }

  drawInstructions(ctx: CanvasRenderingContext2D, _canvasW: number, canvasH: number): void {
    const x = 20;
    const y = canvasH - 80;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, 500, 70);
    ctx.fillStyle = '#ccc';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('操作: 1-9选抽屉 / 拖拽药材到秤盘 / 滚轮微调 / 空格确认 / Z归零', x + 10, y + 10);
    ctx.fillText('目标: 按处方抓药，误差在允许范围内', x + 10, y + 30);
    ctx.fillText('注意: 先煎/后下药要单独分包', x + 10, y + 48);
  }

  drawTareButton(ctx: CanvasRenderingContext2D, x: number, y: number, active: boolean): void {
    ctx.fillStyle = active ? '#d4a574' : '#f5e6d3';
    ctx.fillRect(x, y, 60, 32);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 60, 32);
    ctx.fillStyle = '#333';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('归零', x + 30, y + 16);
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
