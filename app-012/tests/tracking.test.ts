// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  SlipRegistry,
  createSlip,
  advanceSlip,
  recordReturn,
  annotateSlip,
  isSlipDispensed,
  getCurrentStep,
  getStuckDuration,
  getReturnCount,
  generatePatientName,
  generateSlipId,
  formatDuration,
  SLIP_STEP_ORDER,
} from '../src/tracking';
import type { TrackingSlip } from '../src/tracking';

const T0 = 1_700_000_000_000;

function makeInput(overrides: Partial<Parameters<typeof createSlip>[0]> = {}) {
  return {
    id: 'slip-1',
    prescriptionId: 'rx-1',
    patientName: '张先生',
    herbCount: 3,
    receivedBy: '王药师',
    receivedAt: T0,
    ...overrides,
  };
}

describe('createSlip', () => {
  it('should record prescription id, patient, herb count, receiver and receive time', () => {
    const slip = createSlip(makeInput());
    expect(slip.prescriptionId).toBe('rx-1');
    expect(slip.patientName).toBe('张先生');
    expect(slip.herbCount).toBe(3);
    expect(slip.receivedBy).toBe('王药师');
    expect(slip.receivedAt).toBe(T0);
  });

  it('should start with picking active and other steps pending', () => {
    const slip = createSlip(makeInput());
    expect(slip.steps.length).toBe(SLIP_STEP_ORDER.length);
    expect(slip.steps.map(s => s.key)).toEqual(['picking', 'reviewing', 'packing', 'dispensing']);
    expect(slip.steps[0].status).toBe('active');
    expect(slip.steps[0].startedAt).toBe(T0);
    for (const step of slip.steps.slice(1)) {
      expect(step.status).toBe('pending');
      expect(step.startedAt).toBeNull();
    }
    expect(isSlipDispensed(slip)).toBe(false);
  });

  it('should reject missing required fields', () => {
    expect(() => createSlip(makeInput({ id: '' }))).toThrow();
    expect(() => createSlip(makeInput({ prescriptionId: '' }))).toThrow();
    expect(() => createSlip(makeInput({ patientName: '' }))).toThrow();
    expect(() => createSlip(makeInput({ receivedBy: '' }))).toThrow();
    expect(() => createSlip(makeInput({ herbCount: -1 }))).toThrow();
    expect(() => createSlip(makeInput({ herbCount: 1.5 }))).toThrow();
  });
});

describe('advanceSlip', () => {
  it('should walk through picking, reviewing, packing, dispensing in order', () => {
    const slip = createSlip(makeInput());
    const keys: string[] = [];
    let now = T0;
    while (getCurrentStep(slip)) {
      keys.push(getCurrentStep(slip)!.key);
      now += 1000;
      advanceSlip(slip, now);
    }
    expect(keys).toEqual(['picking', 'reviewing', 'packing', 'dispensing']);
    expect(isSlipDispensed(slip)).toBe(true);
    expect(slip.dispensedAt).toBe(now);
    for (const step of slip.steps) {
      expect(step.status).toBe('done');
      expect(step.finishedAt).not.toBeNull();
    }
  });

  it('should refuse to advance after dispensed', () => {
    const slip = createSlip(makeInput());
    for (let i = 0; i < 4; i++) advanceSlip(slip, T0 + i + 1);
    expect(() => advanceSlip(slip, T0 + 10)).toThrow(/已结单/);
  });
});

describe('getStuckDuration', () => {
  it('should measure time spent at the current step', () => {
    const slip = createSlip(makeInput());
    advanceSlip(slip, T0 + 5_000); // 复核开始于 T0+5s
    expect(getCurrentStep(slip)!.key).toBe('reviewing');
    expect(getStuckDuration(slip, T0 + 20_000)).toBe(15_000);
  });

  it('should be zero once dispensed', () => {
    const slip = createSlip(makeInput());
    for (let i = 0; i < 4; i++) advanceSlip(slip, T0 + i + 1);
    expect(getStuckDuration(slip, T0 + 999_999)).toBe(0);
  });
});

describe('recordReturn', () => {
  it('should log reason and time, and send the slip back to picking', () => {
    const slip = createSlip(makeInput());
    advanceSlip(slip, T0 + 1_000);
    advanceSlip(slip, T0 + 2_000); // 到「包好」
    recordReturn(slip, '白芍拿成了赤芍', T0 + 3_000);

    expect(getReturnCount(slip)).toBe(1);
    expect(slip.returns[0].reason).toBe('白芍拿成了赤芍');
    expect(slip.returns[0].returnedAt).toBe(T0 + 3_000);
    expect(slip.returns[0].fromStep).toBe('packing');

    const current = getCurrentStep(slip);
    expect(current!.key).toBe('picking');
    expect(current!.startedAt).toBe(T0 + 3_000);
    expect(slip.steps[1].status).toBe('pending');
    expect(slip.steps[2].status).toBe('pending');
  });

  it('should count multiple returns on the same prescription', () => {
    const slip = createSlip(makeInput());
    recordReturn(slip, '第一次退回', T0 + 1_000);
    advanceSlip(slip, T0 + 2_000);
    recordReturn(slip, '第二次退回', T0 + 3_000);
    recordReturn(slip, '第三次退回', T0 + 4_000);
    expect(getReturnCount(slip)).toBe(3);
    expect(slip.returns.map(r => r.reason)).toEqual(['第一次退回', '第二次退回', '第三次退回']);
  });

  it('should reject empty reason', () => {
    const slip = createSlip(makeInput());
    expect(() => recordReturn(slip, '', T0)).toThrow();
  });

  it('should reject returns after dispensed', () => {
    const slip = createSlip(makeInput());
    for (let i = 0; i < 4; i++) advanceSlip(slip, T0 + i + 1);
    expect(() => recordReturn(slip, '太迟了', T0 + 10)).toThrow(/只能追加说明/);
  });
});

describe('annotateSlip', () => {
  it('should append notes while active', () => {
    const slip = createSlip(makeInput());
    annotateSlip(slip, '病人要求分包', T0 + 100);
    expect(slip.annotations.length).toBe(1);
    expect(slip.annotations[0].note).toBe('病人要求分包');
    expect(slip.annotations[0].addedAt).toBe(T0 + 100);
  });

  it('should still accept notes after dispensed (append-only)', () => {
    const slip = createSlip(makeInput());
    for (let i = 0; i < 4; i++) advanceSlip(slip, T0 + i + 1);
    annotateSlip(slip, '病人反馈药已收到', T0 + 9_999);
    expect(slip.annotations.length).toBe(1);
  });
});

describe('SlipRegistry', () => {
  function makeRegistry() {
    return new SlipRegistry();
  }

  it('should block duplicate slip ids', () => {
    const reg = makeRegistry();
    reg.createSlip(makeInput({ id: 'slip-1', prescriptionId: 'rx-1' }));
    expect(() => reg.createSlip(makeInput({ id: 'slip-1', prescriptionId: 'rx-2' }))).toThrow(/重复/);
    expect(reg.listSlips().length).toBe(1);
  });

  it('should block a second active slip for the same prescription', () => {
    const reg = makeRegistry();
    reg.createSlip(makeInput({ id: 'slip-1', prescriptionId: 'rx-1' }));
    expect(() => reg.createSlip(makeInput({ id: 'slip-2', prescriptionId: 'rx-1' }))).toThrow(/在途/);
  });

  it('should allow a new slip for the same prescription once the previous one is dispensed', () => {
    const reg = makeRegistry();
    const first = reg.createSlip(makeInput({ id: 'slip-1', prescriptionId: 'rx-1' }));
    for (let i = 0; i < 4; i++) advanceSlip(first, T0 + i + 1);
    const second = reg.createSlip(makeInput({ id: 'slip-2', prescriptionId: 'rx-1', receivedAt: T0 + 10_000 }));
    expect(second.id).toBe('slip-2');
    expect(reg.listSlips().length).toBe(2);
  });

  it('should find the active slip for a prescription', () => {
    const reg = makeRegistry();
    reg.createSlip(makeInput({ id: 'slip-1', prescriptionId: 'rx-1' }));
    expect(reg.getActiveSlipForPrescription('rx-1')!.id).toBe('slip-1');
    expect(reg.getActiveSlipForPrescription('rx-none')).toBeNull();
  });

  it('should allow deleting an active slip but refuse to delete a dispensed one', () => {
    const reg = makeRegistry();
    reg.createSlip(makeInput({ id: 'slip-1', prescriptionId: 'rx-1' }));
    const done = reg.createSlip(makeInput({ id: 'slip-2', prescriptionId: 'rx-2' }));
    for (let i = 0; i < 4; i++) advanceSlip(done, T0 + i + 1);

    expect(reg.deleteSlip('slip-1')).toBe(true);
    expect(reg.getSlip('slip-1')).toBeNull();

    expect(() => reg.deleteSlip('slip-2')).toThrow(/不许删除/);
    expect(reg.getSlip('slip-2')).not.toBeNull();

    // 已发出的单据只能追加说明
    annotateSlip(done, '归档备注', T0 + 100);
    expect(done.annotations.length).toBe(1);
  });

  it('should return false when deleting a missing slip', () => {
    const reg = makeRegistry();
    expect(reg.deleteSlip('nope')).toBe(false);
  });

  it('should round-trip through toJSON/loadSlips and keep enforcing uniqueness', () => {
    const reg = makeRegistry();
    const slip = reg.createSlip(makeInput({ id: 'slip-1', prescriptionId: 'rx-1' }));
    recordReturn(slip, '生地不够秤', T0 + 500);
    annotateSlip(slip, '已告知病人', T0 + 600);

    const restored = new SlipRegistry();
    restored.loadSlips(JSON.parse(JSON.stringify(reg.toJSON())) as TrackingSlip[]);

    const back = restored.getSlip('slip-1')!;
    expect(back.returns.length).toBe(1);
    expect(back.annotations.length).toBe(1);
    expect(() => restored.createSlip(makeInput({ id: 'slip-1', prescriptionId: 'rx-9' }))).toThrow(/重复/);
    expect(() => restored.createSlip(makeInput({ id: 'slip-2', prescriptionId: 'rx-1' }))).toThrow(/在途/);
  });

  it('should reject corrupted archives with duplicate ids', () => {
    const reg = makeRegistry();
    const dup = [createSlip(makeInput({ id: 'slip-1' })), createSlip(makeInput({ id: 'slip-1', prescriptionId: 'rx-2' }))];
    expect(() => reg.loadSlips(dup)).toThrow(/重复/);
  });
});

describe('helpers', () => {
  it('generatePatientName should combine surname and honorific', () => {
    expect(generatePatientName(() => 0)).toBe('张先生');
    const name = generatePatientName();
    expect(name.length).toBeGreaterThanOrEqual(2);
  });

  it('generateSlipId should produce unique ids', () => {
    expect(generateSlipId()).not.toBe(generateSlipId());
  });

  it('formatDuration should render seconds, minutes and hours', () => {
    expect(formatDuration(0)).toBe('0秒');
    expect(formatDuration(45_000)).toBe('45秒');
    expect(formatDuration(75_000)).toBe('1分15秒');
    expect(formatDuration(3_660_000)).toBe('1时1分');
  });
});
