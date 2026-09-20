const STORAGE_KEY = 'apothecary-weighing-v1';
const SLIP_STORAGE_KEY = 'apothecary-slips-v1';

import type { TrackingSlip } from './tracking';

export interface SaveData {
  highestScore: number;
  highestLevel: number;
  lastPlayed: number;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as SaveData;
      return {
        highestScore: data.highestScore ?? 0,
        highestLevel: data.highestLevel ?? 0,
        lastPlayed: data.lastPlayed ?? 0,
      };
    }
  } catch {
    // ignore parse error
  }
  return { highestScore: 0, highestLevel: 0, lastPlayed: 0 };
}

export function saveSave(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage error
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function loadSlips(): TrackingSlip[] {
  try {
    const raw = localStorage.getItem(SLIP_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return data as TrackingSlip[];
    }
  } catch {
    // ignore parse error
  }
  return [];
}

export function saveSlips(slips: TrackingSlip[]): void {
  try {
    localStorage.setItem(SLIP_STORAGE_KEY, JSON.stringify(slips));
  } catch {
    // ignore storage error
  }
}
