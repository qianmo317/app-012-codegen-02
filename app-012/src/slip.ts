// 流转单：每张处方从接到手里到药交出去，一张单子跟着走。
// 单子上记处方号、病人称呼、药味数、接单人、接单时间；
// 抓药 → 复核 → 包好 → 发出 四步各自的起止都留痕；
// 退回重抓记原因和时间；药发出后单据只可加说明、不许删。

export type SlipStep = 'filling' | 'review' | 'packing' | 'dispatch';

export const SLIP_STEPS: SlipStep[] = ['filling', 'review', 'packing', 'dispatch'];

export const SLIP_STEP_LABELS: Record<SlipStep, string> = {
  filling: '抓药',
  review: '复核',
  packing: '包好',
  dispatch: '发出',
};

export type SlipStatus = 'active' | 'dispatched';

export interface StepRecord {
  step: SlipStep;
  startedAt: number;
  finishedAt: number | null;
}

export interface ReturnRecord {
  reason: string;
  returnedAt: number;
  fromStep: SlipStep;
}

export interface SlipAnnotation {
  text: string;
  addedAt: number;
}

export interface Slip {
  slipNo: string;
  prescriptionId: string;
  patientName: string;
  herbCount: number;
  receivedBy: string;
  receivedAt: number;
  status: SlipStatus;
  steps: StepRecord[];
  returns: ReturnRecord[];
  annotations: SlipAnnotation[];
}

export interface CreateSlipInput {
  prescriptionId: string;
  patientName: string;
  herbCount: number;
  receivedBy: string;
  slipNo?: string;
  now?: number;
}

export interface SlipBookData {
  seq: number;
  slips: Slip[];
}

export class SlipBook {
  private seq = 0;
  private slips: Slip[] = [];

  /** 开单：单子号不许撞，同一处方号不许同时有两张在途单子 */
  createSlip(input: CreateSlipInput): Slip {
    const now = input.now ?? Date.now();
    if (!input.prescriptionId.trim()) throw new Error('处方号不能为空');
    if (!input.patientName.trim()) throw new Error('病人称呼不能为空');
    if (!input.receivedBy.trim()) throw new Error('接单人不能为空');
    if (!Number.isInteger(input.herbCount) || input.herbCount <= 0) {
      throw new Error('药味数必须是正整数');
    }

    const slipNo = input.slipNo ?? this.nextSlipNo(now);
    if (this.slips.some(s => s.slipNo === slipNo)) {
      throw new Error(`流转单号重复：${slipNo}`);
    }
    if (this.getActiveSlipForPrescription(input.prescriptionId)) {
      throw new Error(`处方 ${input.prescriptionId} 已有一张在途流转单，不许再开`);
    }

    const slip: Slip = {
      slipNo,
      prescriptionId: input.prescriptionId,
      patientName: input.patientName,
      herbCount: input.herbCount,
      receivedBy: input.receivedBy,
      receivedAt: now,
      status: 'active',
      steps: [{ step: 'filling', startedAt: now, finishedAt: null }],
      returns: [],
      annotations: [],
    };
    this.slips.push(slip);
    return slip;
  }

  /** 往前走一步：当前步办结，进入下一步；「发出」办结后单据归档 */
  advance(slipNo: string, now: number = Date.now()): Slip {
    const slip = this.mustGet(slipNo);
    if (slip.status === 'dispatched') {
      throw new Error(`流转单 ${slipNo} 已发出归档，不能再走步`);
    }
    const current = this.currentRecordOf(slip);
    current.finishedAt = now;
    const idx = SLIP_STEPS.indexOf(current.step);
    if (idx === SLIP_STEPS.length - 1) {
      slip.status = 'dispatched';
    } else {
      slip.steps.push({ step: SLIP_STEPS[idx + 1], startedAt: now, finishedAt: null });
    }
    return slip;
  }

  /** 退回重抓：记一笔原因和时间，单子回到「抓药」 */
  recordReturn(slipNo: string, reason: string, now: number = Date.now()): Slip {
    const slip = this.mustGet(slipNo);
    if (slip.status === 'dispatched') {
      throw new Error(`流转单 ${slipNo} 已发出归档，不能退回`);
    }
    if (!reason.trim()) throw new Error('退回原因不能为空');
    const current = this.currentRecordOf(slip);
    current.finishedAt = now;
    slip.returns.push({ reason, returnedAt: now, fromStep: current.step });
    slip.steps.push({ step: 'filling', startedAt: now, finishedAt: null });
    return slip;
  }

  /** 追加说明：在途、已发出的单据都允许（发出后唯一允许做的改动） */
  annotate(slipNo: string, text: string, now: number = Date.now()): Slip {
    const slip = this.mustGet(slipNo);
    if (!text.trim()) throw new Error('说明内容不能为空');
    slip.annotations.push({ text, addedAt: now });
    return slip;
  }

  /** 只有在途单子允许作废；药交出去以后单据不许删 */
  removeSlip(slipNo: string): void {
    const slip = this.mustGet(slipNo);
    if (slip.status === 'dispatched') {
      throw new Error(`流转单 ${slipNo} 药已发出，单据不许删除，只能追加说明`);
    }
    this.slips = this.slips.filter(s => s.slipNo !== slipNo);
  }

  getSlip(slipNo: string): Slip | undefined {
    return this.slips.find(s => s.slipNo === slipNo);
  }

  getActiveSlipForPrescription(prescriptionId: string): Slip | undefined {
    return this.slips.find(s => s.prescriptionId === prescriptionId && s.status === 'active');
  }

  listSlips(): readonly Slip[] {
    return this.slips;
  }

  toJSON(): SlipBookData {
    return { seq: this.seq, slips: this.slips };
  }

  static fromJSON(data: SlipBookData): SlipBook {
    const book = new SlipBook();
    if (data && typeof data.seq === 'number' && Array.isArray(data.slips)) {
      book.seq = data.seq;
      book.slips = data.slips;
    }
    return book;
  }

  private mustGet(slipNo: string): Slip {
    const slip = this.getSlip(slipNo);
    if (!slip) throw new Error(`流转单不存在：${slipNo}`);
    return slip;
  }

  private currentRecordOf(slip: Slip): StepRecord {
    const current = slip.steps[slip.steps.length - 1];
    if (!current || current.finishedAt !== null) {
      throw new Error(`流转单 ${slip.slipNo} 状态异常：没有在进行中的步骤`);
    }
    return current;
  }

  private nextSlipNo(now: number): string {
    this.seq++;
    const d = new Date(now);
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `LD-${ymd}-${String(this.seq).padStart(4, '0')}`;
  }
}

/** 当前卡在哪一步（已发出的单子返回 null） */
export function currentStepOf(slip: Slip): StepRecord | null {
  if (slip.status === 'dispatched') return null;
  const last = slip.steps[slip.steps.length - 1];
  return last && last.finishedAt === null ? last : null;
}

/** 在当前这一步停了多久（毫秒） */
export function stuckMsOf(slip: Slip, now: number): number {
  const current = currentStepOf(slip);
  if (!current) return 0;
  return Math.max(0, now - current.startedAt);
}

/** 同一张方子退过几回 */
export function returnCountOf(slip: Slip): number {
  return slip.returns.length;
}

/** 发出时间（未发出返回 null） */
export function dispatchedAtOf(slip: Slip): number | null {
  if (slip.status !== 'dispatched') return null;
  const last = slip.steps[slip.steps.length - 1];
  return last ? last.finishedAt : null;
}

const SURNAMES = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '罗', '郑'];
const APPELLATIONS = ['先生', '女士', '大娘', '大爷', '阿姨', '小哥', '大嫂', '奶奶'];

export function generatePatientName(rng: () => number = Math.random): string {
  const surname = SURNAMES[Math.floor(rng() * SURNAMES.length)];
  const appellation = APPELLATIONS[Math.floor(rng() * APPELLATIONS.length)];
  return `${surname}${appellation}`;
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}秒`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}分${sec}秒`;
  const hour = Math.floor(min / 60);
  return `${hour}时${min % 60}分`;
}
