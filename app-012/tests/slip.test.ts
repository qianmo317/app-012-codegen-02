import { describe, it, expect, vi } from 'vitest';
import {
  SlipBook,
  currentStepOf,
  stuckMsOf,
  returnCountOf,
  dispatchedAtOf,
  formatDuration,
  generatePatientName,
} from '../src/slip';
import { GameManager } from '../src/game/state';

const T0 = new Date('2026-09-20T09:00:00').getTime();

function openSlip(book: SlipBook, prescriptionId = 'rx-1') {
  return book.createSlip({
    prescriptionId,
    patientName: '张先生',
    herbCount: 3,
    receivedBy: '小药童',
    now: T0,
  });
}

function dispatchAll(book: SlipBook, slipNo: string, start = T0) {
  for (let i = 1; i <= 4; i++) {
    book.advance(slipNo, start + i * 1000);
  }
}

describe('开单', () => {
  it('单子上写清处方号、病人称呼、几味药、谁接的、什么时候接的', () => {
    const book = new SlipBook();
    const slip = openSlip(book);
    expect(slip.prescriptionId).toBe('rx-1');
    expect(slip.patientName).toBe('张先生');
    expect(slip.herbCount).toBe(3);
    expect(slip.receivedBy).toBe('小药童');
    expect(slip.receivedAt).toBe(T0);
    expect(slip.slipNo).toBeTruthy();
    expect(slip.status).toBe('active');
    expect(currentStepOf(slip)?.step).toBe('filling');
  });

  it('两张单子号撞了要拦住', () => {
    const book = new SlipBook();
    book.createSlip({ prescriptionId: 'rx-1', patientName: '张先生', herbCount: 3, receivedBy: '小药童', slipNo: 'LD-TEST-0001', now: T0 });
    expect(() =>
      book.createSlip({ prescriptionId: 'rx-2', patientName: '李女士', herbCount: 2, receivedBy: '小药童', slipNo: 'LD-TEST-0001', now: T0 })
    ).toThrow(/重复/);
  });

  it('同一个处方号不许同时开出两张还在走的单子', () => {
    const book = new SlipBook();
    openSlip(book, 'rx-1');
    expect(() => openSlip(book, 'rx-1')).toThrow(/在途/);
  });

  it('上一张发出以后，同一处方号可以再开新单', () => {
    const book = new SlipBook();
    const s1 = openSlip(book, 'rx-1');
    dispatchAll(book, s1.slipNo);
    expect(s1.status).toBe('dispatched');
    const s2 = book.createSlip({ prescriptionId: 'rx-1', patientName: '张先生', herbCount: 3, receivedBy: '小药童', now: T0 + 10000 });
    expect(s2.slipNo).not.toBe(s1.slipNo);
    expect(s2.status).toBe('active');
  });

  it('单子号自动递增，存档读档之后也不撞号', () => {
    const book = new SlipBook();
    const s1 = openSlip(book, 'rx-1');
    const restored = SlipBook.fromJSON(JSON.parse(JSON.stringify(book.toJSON())));
    const s2 = restored.createSlip({ prescriptionId: 'rx-2', patientName: '李女士', herbCount: 2, receivedBy: '小药童', now: T0 + 1000 });
    expect(s2.slipNo).not.toBe(s1.slipNo);
  });

  it('开单信息不全不许开', () => {
    const book = new SlipBook();
    expect(() => book.createSlip({ prescriptionId: '', patientName: '张先生', herbCount: 3, receivedBy: '小药童', now: T0 })).toThrow();
    expect(() => book.createSlip({ prescriptionId: 'rx-1', patientName: ' ', herbCount: 3, receivedBy: '小药童', now: T0 })).toThrow();
    expect(() => book.createSlip({ prescriptionId: 'rx-1', patientName: '张先生', herbCount: 0, receivedBy: '小药童', now: T0 })).toThrow();
    expect(() => book.createSlip({ prescriptionId: 'rx-1', patientName: '张先生', herbCount: 3, receivedBy: '', now: T0 })).toThrow();
  });
});

describe('走步与卡顿', () => {
  it('抓药→复核→包好→发出，每步走到哪都看得出来', () => {
    const book = new SlipBook();
    const slip = openSlip(book);
    expect(currentStepOf(slip)?.step).toBe('filling');

    book.advance(slip.slipNo, T0 + 1000);
    expect(currentStepOf(slip)?.step).toBe('review');
    book.advance(slip.slipNo, T0 + 2000);
    expect(currentStepOf(slip)?.step).toBe('packing');
    book.advance(slip.slipNo, T0 + 3000);
    expect(currentStepOf(slip)?.step).toBe('dispatch');
    book.advance(slip.slipNo, T0 + 4000);

    expect(slip.status).toBe('dispatched');
    expect(currentStepOf(slip)).toBeNull();
    expect(dispatchedAtOf(slip)).toBe(T0 + 4000);
    expect(slip.steps.map(s => s.step)).toEqual(['filling', 'review', 'packing', 'dispatch']);
    expect(slip.steps[0].startedAt).toBe(T0);
    expect(slip.steps[0].finishedAt).toBe(T0 + 1000);
    expect(slip.steps[3].finishedAt).toBe(T0 + 4000);
  });

  it('卡在哪一步、停了多久能算出来', () => {
    const book = new SlipBook();
    const slip = openSlip(book);
    book.advance(slip.slipNo, T0 + 5000);
    expect(currentStepOf(slip)?.step).toBe('review');
    expect(stuckMsOf(slip, T0 + 5000)).toBe(0);
    expect(stuckMsOf(slip, T0 + 5000 + 90000)).toBe(90000);
  });

  it('已发出的单子不再卡步，停留时长为 0', () => {
    const book = new SlipBook();
    const slip = openSlip(book);
    dispatchAll(book, slip.slipNo);
    expect(stuckMsOf(slip, T0 + 999999)).toBe(0);
  });

  it('已发出的单子不能再走步', () => {
    const book = new SlipBook();
    const slip = openSlip(book);
    dispatchAll(book, slip.slipNo);
    expect(() => book.advance(slip.slipNo, T0 + 9999)).toThrow(/已发出/);
  });
});

describe('退回重抓', () => {
  it('退回要记一笔原因和时间，退过几回能数出来', () => {
    const book = new SlipBook();
    const slip = openSlip(book);
    book.recordReturn(slip.slipNo, '白芍称量超差', T0 + 1000);
    book.recordReturn(slip.slipNo, '方子字迹不清', T0 + 2000);

    expect(returnCountOf(slip)).toBe(2);
    expect(slip.returns[0].reason).toBe('白芍称量超差');
    expect(slip.returns[0].returnedAt).toBe(T0 + 1000);
    expect(slip.returns[1].reason).toBe('方子字迹不清');
    expect(slip.returns[1].returnedAt).toBe(T0 + 2000);
  });

  it('退回后单子回到抓药，从哪一步退的也记下来', () => {
    const book = new SlipBook();
    const slip = openSlip(book);
    book.advance(slip.slipNo, T0 + 1000);
    book.recordReturn(slip.slipNo, '复核发现药不对', T0 + 2000);

    expect(slip.returns[0].fromStep).toBe('review');
    expect(currentStepOf(slip)?.step).toBe('filling');

    book.advance(slip.slipNo, T0 + 3000);
    expect(currentStepOf(slip)?.step).toBe('review');
    expect(slip.steps.map(s => s.step)).toEqual(['filling', 'review', 'filling', 'review']);
  });

  it('退回原因不能为空', () => {
    const book = new SlipBook();
    const slip = openSlip(book);
    expect(() => book.recordReturn(slip.slipNo, '   ', T0)).toThrow(/原因/);
  });

  it('已发出的单子不能退回', () => {
    const book = new SlipBook();
    const slip = openSlip(book);
    dispatchAll(book, slip.slipNo);
    expect(() => book.recordReturn(slip.slipNo, '药不对', T0 + 9999)).toThrow(/已发出/);
  });
});

describe('归档与删除', () => {
  it('药交出去以后单据不许删', () => {
    const book = new SlipBook();
    const slip = openSlip(book);
    dispatchAll(book, slip.slipNo);
    expect(() => book.removeSlip(slip.slipNo)).toThrow(/不许删除/);
    expect(book.getSlip(slip.slipNo)).toBeDefined();
  });

  it('已发出的单据只能往上加说明', () => {
    const book = new SlipBook();
    const slip = openSlip(book);
    dispatchAll(book, slip.slipNo);
    book.annotate(slip.slipNo, '病人反馈药包完好', T0 + 9999);
    expect(slip.annotations.length).toBe(1);
    expect(slip.annotations[0].text).toBe('病人反馈药包完好');
    expect(slip.annotations[0].addedAt).toBe(T0 + 9999);
  });

  it('在途的单子可以作废删除', () => {
    const book = new SlipBook();
    const slip = openSlip(book);
    book.removeSlip(slip.slipNo);
    expect(book.getSlip(slip.slipNo)).toBeUndefined();
  });

  it('在途的单子也能加说明，空说明不许加', () => {
    const book = new SlipBook();
    const slip = openSlip(book);
    book.annotate(slip.slipNo, '病人要求分两包', T0 + 500);
    expect(slip.annotations.length).toBe(1);
    expect(() => book.annotate(slip.slipNo, '  ', T0 + 600)).toThrow(/说明/);
  });

  it('不存在的单子号操作要报错', () => {
    const book = new SlipBook();
    expect(() => book.advance('LD-X', T0)).toThrow(/不存在/);
    expect(() => book.recordReturn('LD-X', 'r', T0)).toThrow(/不存在/);
    expect(() => book.annotate('LD-X', 't', T0)).toThrow(/不存在/);
    expect(() => book.removeSlip('LD-X')).toThrow(/不存在/);
  });
});

describe('工具函数', () => {
  it('formatDuration 按秒/分/时显示', () => {
    expect(formatDuration(0)).toBe('0秒');
    expect(formatDuration(5000)).toBe('5秒');
    expect(formatDuration(65000)).toBe('1分5秒');
    expect(formatDuration(3661000)).toBe('1时1分');
  });

  it('generatePatientName 生成中文称呼', () => {
    for (let i = 0; i < 20; i++) {
      expect(generatePatientName().length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('游戏流程里的流转单', () => {
  it('一关走完，单子跟着从抓药走到发出归档', () => {
    vi.useFakeTimers();
    try {
      const gm = new GameManager();
      gm.startLevel(1);
      expect(gm.slip).not.toBeNull();
      expect(gm.slip!.prescriptionId).toBe(gm.prescription!.id);
      expect(gm.slip!.herbCount).toBe(gm.prescription!.items.length);
      expect(currentStepOf(gm.slip!)?.step).toBe('filling');

      while (gm.phase === 'playing' || gm.phase === 'weighing') {
        const item = gm.prescription!.items.find(i => !gm.weighed.has(i.herb))!;
        gm.selectDrawer(item.herb);
        gm.setWeight(item.grams);
        gm.confirmWeight();
      }
      expect(gm.phase).toBe('review');
      expect(currentStepOf(gm.slip!)?.step).toBe('review');

      gm.answerReview(gm.reviewQuestion!.correct);
      expect(currentStepOf(gm.slip!)?.step).toBe('packing');
      vi.advanceTimersByTime(1600);

      expect(gm.slip!.status).toBe('dispatched');
      expect(dispatchedAtOf(gm.slip!)).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('称量超差会记一笔退回，写明原因', () => {
    const gm = new GameManager();
    gm.startLevel(1);
    const item = gm.prescription!.items[0];
    gm.selectDrawer(item.herb);
    gm.setWeight(item.grams + 50);
    gm.confirmWeight();

    expect(returnCountOf(gm.slip!)).toBe(1);
    expect(gm.slip!.returns[0].reason).toContain('称量超差');
    expect(gm.slip!.returns[0].reason).toContain(item.herb);
    expect(currentStepOf(gm.slip!)?.step).toBe('filling');
  });

  it('复核答错也会记一笔退回', () => {
    const gm = new GameManager();
    gm.startLevel(1);
    while (gm.phase === 'playing' || gm.phase === 'weighing') {
      const item = gm.prescription!.items.find(i => !gm.weighed.has(i.herb))!;
      gm.selectDrawer(item.herb);
      gm.setWeight(item.grams);
      gm.confirmWeight();
    }
    const wrong = gm.reviewQuestion!.options.find(o => o !== gm.reviewQuestion!.correct)!;
    gm.answerReview(wrong);

    expect(returnCountOf(gm.slip!)).toBe(1);
    expect(gm.slip!.returns[0].reason).toContain('复核未通过');
    expect(gm.slip!.returns[0].fromStep).toBe('review');
  });
});
