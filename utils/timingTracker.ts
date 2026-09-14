import { TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const HISTORY_PATH = path.resolve(__dirname, '..', 'timing-history.json');

// A run more than 30% slower than the last recorded one for the same file+environment counts as
// a real slowdown worth flagging, not just normal network/server variance.
const SIGNIFICANT_INCREASE_RATIO = 0.3;

interface TimingEntry {
  durationMs: number;
  recordedAt: string;
}

type TimingHistory = Record<string, TimingEntry>;

function readHistory(): TimingHistory {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Records how long a full file's inspection run took (start to finish) and compares it against
 * the previous recorded run for the SAME file + environment host — dev and staging can have very
 * different baseline speeds for reasons unrelated to a real regression, so they're never compared
 * against each other. History is persisted to `timing-history.json` (checked into git) so timings
 * can be compared across runs/commits.
 *
 * This never fails the test: it's a diagnostic signal to help tell apart a genuine visual
 * regression from a run that was simply slow enough that the page hadn't fully settled before a
 * screenshot was taken. Call it from a `finally` block so timing is still recorded even when the
 * test fails partway through.
 */
export function recordAndCheckTiming(testInfo: TestInfo, key: string, host: string, durationMs: number): void {
  const historyKey = `${key}@${host}`;
  const history = readHistory();
  const previous = history[historyKey];

  if (previous) {
    const increaseRatio = (durationMs - previous.durationMs) / previous.durationMs;
    const sign = increaseRatio >= 0 ? '+' : '';
    testInfo.annotations.push({
      type: 'timing',
      description:
        `${historyKey}: ${formatSeconds(durationMs)} ` +
        `(previous: ${formatSeconds(previous.durationMs)} on ${previous.recordedAt}, ${sign}${(increaseRatio * 100).toFixed(0)}%)`,
    });

    if (increaseRatio >= SIGNIFICANT_INCREASE_RATIO) {
      const warning =
        `"${historyKey}" took ${(increaseRatio * 100).toFixed(0)}% longer than its last recorded run ` +
        `(${formatSeconds(previous.durationMs)} -> ${formatSeconds(durationMs)}) — a real slowdown, not just ` +
        `normal variance. If this run also had visual diffs, they may be timing-related (elements not fully ` +
        `settled before the screenshot) rather than a real rendering bug.`;
      testInfo.annotations.push({ type: 'timing-regression', description: warning });
      console.warn(`⚠ ${warning}`);
    }
  } else {
    testInfo.annotations.push({
      type: 'timing',
      description: `${historyKey}: ${formatSeconds(durationMs)} (no previous run recorded for this file+environment)`,
    });
  }

  history[historyKey] = { durationMs, recordedAt: new Date().toISOString() };
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2) + '\n');
}
