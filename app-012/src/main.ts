import { ApothecaryGame } from './game';
import { loadSave, saveSave, loadSlips, saveSlips } from './storage';

const game = new ApothecaryGame('game-canvas');

try {
  game.game.slipRegistry.loadSlips(loadSlips());
} catch {
  // 流转单存档损坏则从空台账重新开始
}

game.start();

window.addEventListener('beforeunload', () => {
  const save = loadSave();
  const currentScore = (game.game?.state?.score) ?? 0;
  const currentLevel = (game.game?.state?.level) ?? 0;
  saveSave({
    highestScore: Math.max(save.highestScore, currentScore),
    highestLevel: Math.max(save.highestLevel, currentLevel),
    lastPlayed: Date.now(),
  });
  saveSlips(game.game.slipRegistry.listSlips());
});
