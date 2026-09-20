import { SlipBook } from './slip';

const STORAGE_KEY = 'apothecary-weighing-v1';
const SLIP_BOOK_KEY = 'apothecary-slips-v1';

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

export function loadSlipBook(): SlipBook {
  try {
    const raw = localStorage.getItem(SLIP_BOOK_KEY);
    if (raw) {
      return SlipBook.fromJSON(JSON.parse(raw));
    }
  } catch {
    // ignore parse error
  }
  return new SlipBook();
}

export function saveSlipBook(book: SlipBook): void {
  try {
    localStorage.setItem(SLIP_BOOK_KEY, JSON.stringify(book.toJSON()));
  } catch {
    // ignore storage error
  }
}
