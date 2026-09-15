import { TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const HISTORY_PATH = path.resolve(__dirname, '..', 'timing-history.json');

// A run more than 30% slower than the last recorded one for the same file+environment counts as
// a real slowdown worth flagging, not just normal network/server variance.
const SIGNIFICANT_INCREASE_RATIO = 0.3;

// Keep enough history to see a trend per file+environment without the file growing forever.
const MAX_ENTRIES_PER_KEY = 10;

interface TimingEntry {
  durationMs: number;
  recordedAt: string;
  /** e.g. "Source: Development · v0.74.109" — read from the home page, when available. */
  appVersion?: string;
}

type TimingHistory = Record<string, TimingEntry[]>;

function readHistory(): TimingHistory {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  } catch {
    return {};
  }

  // Migrate the old format (a single most-recent entry per key) to a list of entries.
  const history: TimingHistory = {};
  for (const [key, value] of Object.entries(raw)) {
    history[key] = Array.isArray(value) ? (value as TimingEntry[]) : [value as TimingEntry];
  }
  return history;
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Records how long a full file's inspection run took (start to finish) and compares it against
 * the most recent recorded run for the SAME file + environment host — dev and staging can have
 * very different baseline speeds for reasons unrelated to a real regression, so they're never
 * compared against each other. Every run is appended (never overwritten) to
 * `timing-history.json` (checked into git), keeping up to the last `MAX_ENTRIES_PER_KEY` runs per
 * file+environment so a trend is visible, not just the latest data point.
 *
 * This never fails the test: it's a diagnostic signal to help tell apart a genuine visual
 * regression from a run that was simply slow enough that the page hadn't fully settled before a
 * screenshot was taken. Call it from a `finally` block so timing is still recorded even when the
 * test fails partway through.
 */
export function recordAndCheckTiming(
  testInfo: TestInfo,
  key: string,
  host: string,
  durationMs: number,
  appVersion?: string
): void {
  const historyKey = `${key}@${host}`;
  const history = readHistory();
  const entries = history[historyKey] ?? [];
  const previous = entries[entries.length - 1];

  // Structured twin of the human-readable annotations below, for utils/testRunReporter.ts to
  // read reliably instead of parsing formatted text.
  testInfo.annotations.push({
    type: 'timing-data',
    description: JSON.stringify({
      key,
      host,
      durationMs,
      appVersion,
      previousDurationMs: previous?.durationMs,
      previousAppVersion: previous?.appVersion,
      previousRecordedAt: previous?.recordedAt,
    }),
  });

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

    if (appVersion && previous.appVersion && appVersion !== previous.appVersion) {
      testInfo.annotations.push({
        type: 'timing',
        description: `${historyKey}: app version changed since last recorded run (${previous.appVersion} -> ${appVersion}) — a slowdown or visual diff here may just be a real app change, not an environment issue.`,
      });
    }
  } else {
    testInfo.annotations.push({
      type: 'timing',
      description: `${historyKey}: ${formatSeconds(durationMs)} (no previous run recorded for this file+environment)`,
    });
  }

  entries.push({
    durationMs,
    recordedAt: new Date().toISOString(),
    ...(appVersion ? { appVersion } : {}),
  });
  if (entries.length > MAX_ENTRIES_PER_KEY) {
    entries.splice(0, entries.length - MAX_ENTRIES_PER_KEY);
  }
  history[historyKey] = entries;

  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2) + '\n');
}
