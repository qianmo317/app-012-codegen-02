// 处方流转单：每张处方从接单到发药全程跟随的单据。
// 记录处方号、病人称呼、药味数、接单人、接单时间；
// 跟踪「抓药 → 复核 → 包好 → 发出」四个步骤的进度与停滞时长；
// 退回重抓逐笔记账；药发出后单据归档，只许追加说明、不许删除。

export type SlipStepKey = 'picking' | 'reviewing' | 'packing' | 'dispensing';

export const SLIP_STEP_ORDER: readonly SlipStepKey[] = ['picking', 'reviewing', 'packing', 'dispensing'];

export const SLIP_STEP_LABELS: Record<SlipStepKey, string> = {
  picking: '抓药',
  reviewing: '复核',
  packing: '包好',
  dispensing: '发出',
};

export type SlipStepStatus = 'pending' | 'active' | 'done';

export interface SlipStep {
  key: SlipStepKey;
  status: SlipStepStatus;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface ReturnRecord {
  reason: string;
  fromStep: SlipStepKey;
  returnedAt: number;
}

export interface SlipAnnotation {
  note: string;
  addedAt: number;
}

export interface TrackingSlip {
  id: string;
  prescriptionId: string;
  patientName: string;
  herbCount: number;
  receivedBy: string;
  receivedAt: number;
  steps: SlipStep[];
  returns: ReturnRecord[];
  annotations: SlipAnnotation[];
  dispensedAt: number | null;
}

export interface CreateSlipInput {
  id: string;
  prescriptionId: string;
  patientName: string;
  herbCount: number;
  receivedBy: string;
  receivedAt: number;
}

export function createSlip(input: CreateSlipInput): TrackingSlip {
  if (!input.id) throw new Error('流转单号不能为空');
  if (!input.prescriptionId) throw new Error('处方号不能为空');
  if (!input.patientName) throw new Error('病人称呼不能为空');
  if (!input.receivedBy) throw new Error('接单人不能为空');
  if (!Number.isInteger(input.herbCount) || input.herbCount < 0) {
    throw new Error('药味数必须是非负整数');
  }
  if (!Number.isFinite(input.receivedAt)) throw new Error('接单时间无效');

  return {
    id: input.id,
    prescriptionId: input.prescriptionId,
    patientName: input.patientName,
    herbCount: input.herbCount,
    receivedBy: input.receivedBy,
    receivedAt: input.receivedAt,
    steps: SLIP_STEP_ORDER.map((key, i) => ({
      key,
      status: i === 0 ? 'active' : 'pending',
      startedAt: i === 0 ? input.receivedAt : null,
      finishedAt: null,
    })),
    returns: [],
    annotations: [],
    dispensedAt: null,
  };
}

export function isSlipDispensed(slip: TrackingSlip): boolean {
  return slip.dispensedAt !== null;
}

export function getCurrentStep(slip: TrackingSlip): SlipStep | null {
  return slip.steps.find(s => s.status === 'active') ?? null;
}

// 单据在当前环节已经停了多久（毫秒）；已发出的单据不再算停滞。
export function getStuckDuration(slip: TrackingSlip, now: number): number {
  if (isSlipDispensed(slip)) return 0;
  const current = getCurrentStep(slip);
  const since = current && current.startedAt !== null ? current.startedAt : slip.receivedAt;
  return Math.max(0, now - since);
}

export function getReturnCount(slip: TrackingSlip): number {
  return slip.returns.length;
}

// 当前步骤完成，推进到下一步；走完「发出」即结单（药已交出）。
export function advanceSlip(slip: TrackingSlip, now: number): TrackingSlip {
  if (isSlipDispensed(slip)) {
    throw new Error(`流转单 ${slip.id} 已结单（药已发出），步骤不得再改动`);
  }
  const idx = slip.steps.findIndex(s => s.status === 'active');
  if (idx === -1) throw new Error(`流转单 ${slip.id} 没有进行中的步骤`);

  slip.steps[idx].status = 'done';
  slip.steps[idx].finishedAt = now;

  const next = slip.steps[idx + 1];
  if (next) {
    next.status = 'active';
    next.startedAt = now;
  } else {
    slip.dispensedAt = now;
  }
  return slip;
}

// 发现药不对或方子有问题：记一笔退回（原因 + 时间），单据退回「抓药」重抓。
export function recordReturn(slip: TrackingSlip, reason: string, now: number): TrackingSlip {
  if (isSlipDispensed(slip)) {
    throw new Error(`流转单 ${slip.id} 药已发出，不能退回，只能追加说明`);
  }
  if (!reason) throw new Error('退回原因不能为空');
  const current = getCurrentStep(slip);
  if (!current) throw new Error(`流转单 ${slip.id} 没有进行中的步骤，无法退回`);

  slip.returns.push({ reason, fromStep: current.key, returnedAt: now });

  const currentIdx = SLIP_STEP_ORDER.indexOf(current.key);
  slip.steps.forEach((step, i) => {
    if (i === 0) {
      step.status = 'active';
      step.startedAt = now;
      step.finishedAt = null;
    } else if (i <= currentIdx) {
      step.status = 'pending';
      step.startedAt = null;
      step.finishedAt = null;
    }
  });
  return slip;
}

// 追加说明：在途可写，药发出归档后也只许写说明。
export function annotateSlip(slip: TrackingSlip, note: string, now: number): TrackingSlip {
  if (!note) throw new Error('说明内容不能为空');
  slip.annotations.push({ note, addedAt: now });
  return slip;
}

export class SlipRegistry {
  private slips = new Map<string, TrackingSlip>();

  createSlip(input: CreateSlipInput): TrackingSlip {
    if (this.slips.has(input.id)) {
      throw new Error(`流转单号重复：${input.id}，已拦截`);
    }
    const active = this.getActiveSlipForPrescription(input.prescriptionId);
    if (active) {
      throw new Error(`处方 ${input.prescriptionId} 已有在途流转单 ${active.id}，不得重复开单`);
    }
    const slip = createSlip(input);
    this.slips.set(slip.id, slip);
    return slip;
  }

  getSlip(id: string): TrackingSlip | null {
    return this.slips.get(id) ?? null;
  }

  getActiveSlipForPrescription(prescriptionId: string): TrackingSlip | null {
    for (const slip of this.slips.values()) {
      if (slip.prescriptionId === prescriptionId && !isSlipDispensed(slip)) {
        return slip;
      }
    }
    return null;
  }

  // 药交出去以后单据不许删；只有在途单据允许作废删除。
  deleteSlip(id: string): boolean {
    const slip = this.slips.get(id);
    if (!slip) return false;
    if (isSlipDispensed(slip)) {
      throw new Error(`流转单 ${id} 药已发出，单据不许删除，只能追加说明`);
    }
    return this.slips.delete(id);
  }

  listSlips(): TrackingSlip[] {
    return Array.from(this.slips.values());
  }

  toJSON(): TrackingSlip[] {
    return this.listSlips();
  }

  loadSlips(slips: TrackingSlip[]): void {
    const restored = new Map<string, TrackingSlip>();
    for (const slip of slips) {
      if (!slip || !slip.id) throw new Error('流转单存档损坏：缺少单号');
      if (restored.has(slip.id)) throw new Error(`流转单存档损坏：单号重复 ${slip.id}`);
      restored.set(slip.id, slip);
    }
    this.slips = restored;
  }
}

const SURNAMES = ['张', '王', '李', '赵', '陈', '刘', '杨', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '罗', '郑'];
const HONORIFICS = ['先生', '女士', '大娘', '大爷', '阿婆', '阿公', '师傅', '阿姨'];

export function generatePatientName(rng: () => number = Math.random): string {
  const surname = SURNAMES[Math.floor(rng() * SURNAMES.length)];
  const honorific = HONORIFICS[Math.floor(rng() * HONORIFICS.length)];
  return `${surname}${honorific}`;
}

let slipIdCounter = 0;

export function generateSlipId(): string {
  return `slip-${++slipIdCounter}-${Date.now()}`;
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min >= 60) {
    return `${Math.floor(min / 60)}时${min % 60}分`;
  }
  return min > 0 ? `${min}分${sec}秒` : `${sec}秒`;
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
