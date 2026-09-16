import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

const REPORTS_DIR = path.resolve(__dirname, '..', 'test-run-reports');

// Same tolerance timingTracker.ts's "significant" flag uses is for a different purpose (30%,
// "is this a real problem"). The report's duration column answers a different question — "is this
// run notably different from last time" — at the ±15% the report was asked to use.
const TIME_TOLERANCE = 0.15;

export interface TimingData {
  key: string;
  host: string;
  durationMs: number;
  appVersion?: string;
  previousDurationMs?: number;
  previousAppVersion?: string;
  previousRecordedAt?: string;
  /** Duration/version of the most recent run on a DIFFERENT app version — what the report compares against. */
  previousVersionDurationMs?: number;
  previousVersion?: string;
}

export interface ImageTrio {
  name: string;
  expected?: string;
  actual?: string;
  diff?: string;
}

export interface TestRecord {
  title: string;
  specFile: string;
  project: string;
  status: TestResult['status'];
  durationMs: number;
  errors: string[];
  images: ImageTrio[];
  /** Playwright's own full-page screenshot(s) at the point of failure (`screenshot: 'only-on-failure'`). */
  failureScreenshots: string[];
  timing?: TimingData;
  /** From the 'app-version' annotation utils/appVersion.ts pushes right after login on every test. */
  appVersion?: string;
  notes: string[];
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_CODE = /\x1b\[[0-9;]*m/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_CODE, '');
}

function toDataUri(filePath: string): string | null {
  try {
    return `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`;
  } catch {
    return null;
  }
}

function recordVersion(record: TestRecord): string | undefined {
  return record.appVersion ?? record.timing?.appVersion;
}

const KNOWN_ACRONYMS = new Set(['lsf']);

/** e.g. "lake-louisa" -> "Lake Louisa"; "lsf-phase1" -> "LSF Phase1". */
function formatMapName(key: string): string {
  return key
    .split('-')
    .map((word) =>
      KNOWN_ACRONYMS.has(word.toLowerCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(' ');
}

/**
 * A short, human-oriented description of what this test does and why it exists — richer than
 * Playwright's raw title, which for these specs is either too generic (setup/preset tests all
 * just say "configured"/"applied") or too literal (the group-inspection test's title is just the
 * uploaded file name, with no hint of what "looks the same" actually checks).
 */
function describeTest(record: TestRecord): string {
  if (record.specFile === 'grading-settings.setup.ts') {
    return 'Configures the shared default grading preset once, before anything else runs — every other test in the suite depends on this being in place first.';
  }
  if (record.specFile === 'lot-preset-custom-grading.spec.ts') {
    return "Creates a custom Lot preset, edits it, assigns it to a Group, then grades and confirms the preset was actually applied — exercises the custom-preset path, not just the shared default.";
  }
  if (record.specFile === 'lot-block-v2-group-inspection.spec.ts') {
    const mapName = record.timing?.key ? formatMapName(record.timing.key) : null;
    const subject = mapName ? `"${mapName}"` : 'a lot-block file';
    return (
      `Uploads and grades ${subject}, confirms the preset actually used for grading matches the ` +
      `configured grading defaults (via the Solution Summary panel), then walks every ` +
      `Group/Zone/Pond at a consistent zoom level across three view states — default 2D, an ` +
      `orbited 3D angle (checking the terrain for zero-elevation artifacts), and 2D with the lot ` +
      `mesh shown — comparing each capture against its last known-good baseline.`
    );
  }
  return record.title;
}

function formatSeconds(ms: number | undefined): string {
  return ms === undefined ? '-' : `${(ms / 1000).toFixed(1)}s`;
}

/** e.g. "Source: Development · v0.74.110" -> "v0.74.110", for compact table cells. */
function shortVersion(version: string | undefined): string {
  if (!version) return '-';
  const match = version.match(/v?([\d.]+)/);
  return match ? `v${match[1]}` : version;
}

function isFailure(record: TestRecord): boolean {
  return record.status !== 'passed' && record.status !== 'skipped';
}

/** Compares this run's duration against the last run recorded on a DIFFERENT app version. */
function durationVerdict(timing: TimingData | undefined): { label: string; cssClass: string } {
  if (!timing || timing.previousVersionDurationMs === undefined) {
    return { label: 'no previous version to compare', cssClass: 'neutral' };
  }
  const ratio = (timing.durationMs - timing.previousVersionDurationMs) / timing.previousVersionDurationMs;
  const pct = `${ratio >= 0 ? '+' : ''}${(ratio * 100).toFixed(1)}%`;
  if (ratio >= TIME_TOLERANCE) return { label: `${pct} slower`, cssClass: 'bad' };
  if (ratio <= -TIME_TOLERANCE) return { label: `${pct} faster`, cssClass: 'good' };
  return { label: `${pct} (about the same)`, cssClass: 'neutral' };
}

/** e.g. "Source: Development · v0.74.110" -> "development-v0.74.110". */
function reportVersionSlug(records: TestRecord[]): string {
  const versioned = records.map((r) => recordVersion(r)).find(Boolean);
  const match = versioned?.match(/Source:\s*([A-Za-z]+).*?v?([\d.]+)/i);
  return match ? `${match[1].toLowerCase()}-v${match[2]}` : 'unknown-version';
}

/**
 * Row in the top "All tests" table: file, the map it graded (when this test tracks one — see
 * utils/timingTracker.ts), how long the previous vs. current app version took, the verdict on
 * that comparison, and pass/fail. Failed tests' names link down to their full write-up in the
 * "Failed tests" table.
 */
function buildSummaryRowHtml(record: TestRecord, index: number): string {
  const fileLabel = `${escapeHtml(record.specFile)}<span class="title">${escapeHtml(describeTest(record))}</span>`;
  const fileCell = isFailure(record) ? `<a href="#test-${index}">${fileLabel}</a>` : fileLabel;
  const mapName = record.timing?.key ? formatMapName(record.timing.key) : '-';
  const previousTime = formatSeconds(record.timing?.previousVersionDurationMs);
  const currentTime = formatSeconds(record.timing?.durationMs ?? record.durationMs);
  const verdict = durationVerdict(record.timing);

  return `<tr>
      <td>${fileCell}</td>
      <td>${escapeHtml(mapName)}</td>
      <td>${previousTime}</td>
      <td>${currentTime}</td>
      <td class="${verdict.cssClass}">${verdict.label}</td>
      <td class="status-${record.status}">${record.status.toUpperCase()}</td>
    </tr>`;
}

/**
 * Row in the "Failed tests" table — full detail: what/where (file, map, status), this run's
 * version and duration, the last DIFFERENT version's duration for comparison, the verdict, and
 * any error/diff/failure images.
 */
function buildDetailRowHtml(record: TestRecord, index: number): string {
  const verdict = durationVerdict(record.timing);
  const mapName = record.timing?.key ? formatMapName(record.timing.key) : '-';
  const currentVersion = shortVersion(recordVersion(record));
  const currentDuration = formatSeconds(record.durationMs);
  const previousVersion = shortVersion(record.timing?.previousVersion);
  const previousDuration = formatSeconds(record.timing?.previousVersionDurationMs);

  const errorHtml = record.errors.length ? `<div class="error">${escapeHtml(record.errors.join('\n\n'))}</div>` : '';
  const notesHtml = record.notes.map((n) => `<div class="note">${escapeHtml(n)}</div>`).join('');
  const imagesHtml = record.images.length
    ? `<div class="diff-block">${record.images.map((img) => buildImageTrioHtml(img)).join('')}</div>`
    : '';
  const failureScreenshotsHtml = record.failureScreenshots.length
    ? `<div class="diff-block">${record.failureScreenshots
        .map((p) => buildSingleImageHtml('Full-page screenshot at failure', p))
        .join('')}</div>`
    : '';

  return `<tr id="test-${index}">
      <td>${escapeHtml(record.specFile)}<span class="title">${escapeHtml(describeTest(record))} &middot; project: ${escapeHtml(record.project)}</span></td>
      <td>${escapeHtml(mapName)}</td>
      <td class="status-${record.status}">${record.status.toUpperCase()}</td>
      <td>${previousVersion}</td>
      <td>${previousDuration}</td>
      <td>${currentVersion}</td>
      <td>${currentDuration}</td>
      <td class="${verdict.cssClass}">${verdict.label}</td>
      <td>${errorHtml}${notesHtml}${imagesHtml}${failureScreenshotsHtml}</td>
    </tr>`;
}

function buildSingleImageHtml(label: string, filePath: string): string {
  const dataUri = toDataUri(filePath);
  if (!dataUri) return '';
  return `<div class="images"><figure><img src="${dataUri}" loading="lazy"><figcaption>${escapeHtml(label)}</figcaption></figure></div>`;
}

function buildImageTrioHtml(img: ImageTrio): string {
  const figures: string[] = [];
  const addFigure = (label: string, filePath?: string) => {
    if (!filePath) return;
    const dataUri = toDataUri(filePath);
    if (!dataUri) return;
    figures.push(`<figure><img src="${dataUri}" loading="lazy"><figcaption>${label}</figcaption></figure>`);
  };
  addFigure('Baseline (previous)', img.expected);
  addFigure('Actual (this run)', img.actual);
  addFigure('Diff', img.diff);

  return `<div class="diff-name">${escapeHtml(img.name)}</div><div class="images">${figures.join('')}</div>`;
}

/**
 * Builds the full report HTML from a list of records. Exported (and free of any dependency on the
 * live Playwright Reporter lifecycle) so a report can also be regenerated later from
 * already-recorded results — e.g. after tweaking the report's layout — without re-running tests.
 */
export function buildReportHtml(records: TestRecord[]): string {
  const passed = records.filter((r) => r.status === 'passed').length;
  const failedRecords = records.map((record, index) => ({ record, index })).filter(({ record }) => isFailure(record));
  const failed = failedRecords.length;
  const skipped = records.filter((r) => r.status === 'skipped').length;
  const hosts = [...new Set(records.map((r) => r.timing?.host).filter(Boolean))];
  const versions = [...new Set(records.map((r) => recordVersion(r)).filter(Boolean))];

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Test run report</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; background: #0f1115; color: #e6e6e6; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 28px 0 10px; }
  a { color: #93c5fd; }
  .meta { color: #9aa0a6; margin-bottom: 20px; font-size: 13px; line-height: 1.6; }
  .summary span { margin-right: 16px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #2a2d34; padding: 8px 10px; text-align: left; font-size: 13px; vertical-align: top; }
  th { background: #1a1d23; position: sticky; top: 0; }
  tr:nth-child(even) { background: #14161b; }
  tr:target { outline: 2px solid #f87171; outline-offset: -2px; }
  .status-passed { color: #4ade80; font-weight: 600; }
  .status-failed, .status-timedOut, .status-interrupted { color: #f87171; font-weight: 600; }
  .status-skipped { color: #9aa0a6; font-weight: 600; }
  .good { color: #4ade80; font-weight: 600; }
  .bad { color: #f87171; font-weight: 600; }
  .neutral { color: #facc15; font-weight: 600; }
  .title { color: #9aa0a6; font-size: 11px; display: block; margin-top: 2px; }
  .images { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
  .images figure { margin: 0; width: 260px; }
  .images img { width: 100%; border: 1px solid #2a2d34; border-radius: 4px; display: block; cursor: zoom-in; }
  .images figcaption { font-size: 11px; color: #9aa0a6; margin-top: 4px; }
  .diff-block { margin-top: 10px; padding: 10px; background: #14161b; border-radius: 6px; }
  .diff-name { font-size: 12px; color: #d1d5db; }
  .error { white-space: pre-wrap; color: #f87171; font-size: 12px; background: #1a1214; padding: 8px; border-radius: 4px; margin-top: 6px; max-height: 200px; overflow: auto; }
  .note { font-size: 12px; color: #facc15; margin-top: 6px; }
  #lightbox { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.92); z-index: 1000; align-items: center; justify-content: center; cursor: zoom-out; padding: 24px; box-sizing: border-box; }
  #lightbox.open { display: flex; }
  #lightbox img { max-width: 100%; max-height: 100%; object-fit: contain; box-shadow: 0 0 24px rgba(0,0,0,0.6); }
</style>
</head>
<body>
  <div id="lightbox"><img id="lightbox-img" src="" alt=""></div>
  <h1>Playwright test run report</h1>
  <div class="meta">
    <div class="summary">
      <span>Generated: ${new Date().toISOString()}</span>
      <span>Environment: ${escapeHtml(hosts.join(', ') || 'n/a')}</span>
      <span>App version: ${escapeHtml(versions.join(', ') || 'n/a')}</span>
    </div>
    <div class="summary">
      <span>${records.length} tests</span>
      <span class="status-passed">${passed} passed</span>
      <span class="status-failed">${failed} failed</span>
      <span class="status-skipped">${skipped} skipped</span>
    </div>
  </div>
  <h2>All tests</h2>
  <table>
    <thead>
      <tr>
        <th>File</th>
        <th>Map</th>
        <th>Previous version time</th>
        <th>Current version time</th>
        <th>vs previous version (&plusmn;15%)</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${records.map((r, i) => buildSummaryRowHtml(r, i)).join('\n')}
    </tbody>
  </table>
  ${
    failedRecords.length > 0
      ? `<h2>Failed tests</h2>
  <table>
    <thead>
      <tr>
        <th>File</th>
        <th>Map</th>
        <th>Status</th>
        <th>Previous version</th>
        <th>Previous duration</th>
        <th>Current version</th>
        <th>Current duration</th>
        <th>vs previous version (&plusmn;15%)</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      ${failedRecords.map(({ record, index }) => buildDetailRowHtml(record, index)).join('\n')}
    </tbody>
  </table>`
      : ''
  }
  <script>
    (function () {
      var lightbox = document.getElementById('lightbox');
      var lightboxImg = document.getElementById('lightbox-img');
      document.addEventListener('click', function (event) {
        var target = event.target;
        if (target && target.tagName === 'IMG' && target.closest('.images')) {
          lightboxImg.src = target.src;
          lightbox.classList.add('open');
        } else if (target === lightbox) {
          lightbox.classList.remove('open');
        }
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') lightbox.classList.remove('open');
      });
    })();
  </script>
</body>
</html>`;
}

/**
 * Writes `buildReportHtml(records)` to test-run-reports/, named after the app version the run
 * tested against so reports for different releases don't overwrite each other. Exported so the
 * same "generate and save" step can be reused outside the live Reporter (see `buildReportHtml`).
 */
export function writeReport(records: TestRecord[]): string {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const fileName = `${reportVersionSlug(records)}-${new Date().toISOString().replace(/[:.]/g, '-')}.html`;
  const filePath = path.join(REPORTS_DIR, fileName);
  fs.writeFileSync(filePath, buildReportHtml(records));
  return filePath;
}

/**
 * Generates a self-contained HTML report after every test run: which spec files ran, which map
 * each one graded and how long the previous vs. current app version took on it, pass/fail status,
 * and — for any screenshot comparison that actually differed — the baseline, actual, and diff
 * images side by side.
 *
 * Relies on utils/timingTracker.ts's 'timing-data' annotation for the structured duration/version
 * numbers, rather than re-deriving them, so the two stay consistent by construction.
 */
export default class TestRunReporter implements Reporter {
  private records: TestRecord[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    let timing: TimingData | undefined;
    let appVersion: string | undefined;
    const notes: string[] = [];

    for (const annotation of result.annotations) {
      if (annotation.type === 'timing-data' && annotation.description) {
        try {
          timing = JSON.parse(annotation.description) as TimingData;
        } catch {
          // Malformed — skip rather than crash the whole report.
        }
      } else if (annotation.type === 'app-version' && annotation.description) {
        appVersion = annotation.description;
      } else if (annotation.type === 'timing-regression' || annotation.type === 'visual-baseline') {
        if (annotation.description) notes.push(annotation.description);
      }
    }

    this.records.push({
      title: test.title,
      specFile: path.basename(test.location.file),
      project: test.parent.project()?.name ?? '',
      status: result.status,
      durationMs: result.duration,
      errors: result.errors.map((e) => e.message).filter((m): m is string => !!m).map(stripAnsi),
      images: this.collectImages(result),
      failureScreenshots: result.attachments
        .filter((a) => a.name === 'screenshot' && a.path && a.contentType === 'image/png')
        .map((a) => a.path as string),
      timing,
      appVersion,
      notes,
    });
  }

  /** Screenshot-comparison failures attach "<name>-expected"/"-actual"/"-diff" images; group them. */
  private collectImages(result: TestResult): ImageTrio[] {
    const groups = new Map<string, ImageTrio>();
    for (const attachment of result.attachments) {
      if (!attachment.path || attachment.contentType !== 'image/png') continue;
      const match = attachment.name.match(/^(.*)-(expected|actual|diff)\.png$/);
      if (!match) continue;
      const [, name, kind] = match;
      const entry = groups.get(name) ?? { name };
      entry[kind as 'expected' | 'actual' | 'diff'] = attachment.path;
      groups.set(name, entry);
    }
    return [...groups.values()];
  }

  onEnd(_result: FullResult): void {
    if (this.records.length === 0) return;
    const filePath = writeReport(this.records);
    console.log(`\nTest run report: ${filePath}`);
  }
}
