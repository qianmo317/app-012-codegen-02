import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // 判定逻辑均为纯函数，无需 DOM；jsdom 依赖的 undici 需要
    // worker_threads.markAsUncloneable（Node 22.5+），本环境 Node 20 跑不起来
    environment: 'node',
  },
});
