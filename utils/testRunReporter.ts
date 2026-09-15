import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

const REPORTS_DIR = path.resolve(__dirname, '..', 'test-run-reports');

// Same tolerance timingTracker.ts's "significant" flag uses is for a different purpose (30%,
// "is this a real problem"). The report's duration column answers a different question — "is this
// run notably different from last time" — at the ±15% the report was asked to use.
const TIME_TOLERANCE = 0.15;

interface TimingData {
  key: string;
  host: string;
  durationMs: number;
  appVersion?: string;
  previousDurationMs?: number;
  previousAppVersion?: string;
  previousRecordedAt?: string;
}

interface ImageTrio {
  name: string;
  expected?: string;
  actual?: string;
  diff?: string;
}

interface TestRecord {
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

/**
 * Generates a self-contained HTML report after every test run: which spec files ran, how long
 * each took vs. its last recorded run (±15% = notably faster/slower, else about the same), pass/
 * fail status, and — for any screenshot comparison that actually differed — the baseline, actual,
 * and diff images side by side. Saved under test-run-reports/, named after the app version the
 * run tested against so reports for different releases don't overwrite each other.
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

    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const fileName = `${this.reportVersionSlug()}-${new Date().toISOString().replace(/[:.]/g, '-')}.html`;
    const filePath = path.join(REPORTS_DIR, fileName);
    fs.writeFileSync(filePath, this.buildHtml());
    console.log(`\nTest run report: ${filePath}`);
  }

  private recordVersion(record: TestRecord): string | undefined {
    return record.appVersion ?? record.timing?.appVersion;
  }

  /** e.g. "Source: Development · v0.74.110" -> "development-v0.74.110". */
  private reportVersionSlug(): string {
    const versioned = this.records.map((r) => this.recordVersion(r)).find(Boolean);
    const match = versioned?.match(/Source:\s*([A-Za-z]+).*?v?([\d.]+)/i);
    return match ? `${match[1].toLowerCase()}-v${match[2]}` : 'unknown-version';
  }

  private durationVerdict(timing: TimingData | undefined): { label: string; cssClass: string } {
    if (!timing || timing.previousDurationMs === undefined) {
      return { label: 'first run recorded', cssClass: 'neutral' };
    }
    const ratio = (timing.durationMs - timing.previousDurationMs) / timing.previousDurationMs;
    const pct = `${ratio >= 0 ? '+' : ''}${(ratio * 100).toFixed(1)}%`;
    if (ratio >= TIME_TOLERANCE) return { label: `${pct} slower`, cssClass: 'bad' };
    if (ratio <= -TIME_TOLERANCE) return { label: `${pct} faster`, cssClass: 'good' };
    return { label: `${pct} (about the same)`, cssClass: 'neutral' };
  }

  private isFailure(record: TestRecord): boolean {
    return record.status !== 'passed' && record.status !== 'skipped';
  }

  private buildHtml(): string {
    const passed = this.records.filter((r) => r.status === 'passed').length;
    const failedRecords = this.records
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => this.isFailure(record));
    const failed = failedRecords.length;
    const skipped = this.records.filter((r) => r.status === 'skipped').length;
    const hosts = [...new Set(this.records.map((r) => r.timing?.host).filter(Boolean))];
    const versions = [...new Set(this.records.map((r) => this.recordVersion(r)).filter(Boolean))];

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
      <span>${this.records.length} tests</span>
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
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${this.records.map((r, i) => this.buildSummaryRowHtml(r, i)).join('\n')}
    </tbody>
  </table>
  ${
    failedRecords.length > 0
      ? `<h2>Failed tests</h2>
  <table>
    <thead>
      <tr>
        <th>File</th>
        <th>Status</th>
        <th>Duration</th>
        <th>vs previous run (&plusmn;15%)</th>
        <th>App version</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      ${failedRecords.map(({ record, index }) => this.buildDetailRowHtml(record, index)).join('\n')}
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

  /** Row in the top "All tests" table — just enough to see what ran and whether it passed. Failed
   *  tests' names link down to their full write-up in the "Failed tests" table. */
  private buildSummaryRowHtml(record: TestRecord, index: number): string {
    const fileLabel = `${escapeHtml(record.specFile)}<span class="title">${escapeHtml(record.title)}</span>`;
    const fileCell = this.isFailure(record) ? `<a href="#test-${index}">${fileLabel}</a>` : fileLabel;
    return `<tr>
      <td>${fileCell}</td>
      <td class="status-${record.status}">${record.status.toUpperCase()}</td>
    </tr>`;
  }

  /** Row in the "Failed tests" table — full detail: duration comparison, error, and any diff/failure images. */
  private buildDetailRowHtml(record: TestRecord, index: number): string {
    const verdict = this.durationVerdict(record.timing);
    const durationSec = (record.durationMs / 1000).toFixed(1);
    const previousSec =
      record.timing?.previousDurationMs !== undefined ? (record.timing.previousDurationMs / 1000).toFixed(1) : null;

    const errorHtml = record.errors.length ? `<div class="error">${escapeHtml(record.errors.join('\n\n'))}</div>` : '';
    const notesHtml = record.notes.map((n) => `<div class="note">${escapeHtml(n)}</div>`).join('');
    const imagesHtml = record.images.length
      ? `<div class="diff-block">${record.images.map((img) => this.buildImageTrioHtml(img)).join('')}</div>`
      : '';
    const failureScreenshotsHtml = record.failureScreenshots.length
      ? `<div class="diff-block">${record.failureScreenshots
          .map((p) => this.buildSingleImageHtml('Full-page screenshot at failure', p))
          .join('')}</div>`
      : '';

    return `<tr id="test-${index}">
      <td>${escapeHtml(record.specFile)}<span class="title">${escapeHtml(record.title)} &middot; project: ${escapeHtml(record.project)}</span></td>
      <td class="status-${record.status}">${record.status.toUpperCase()}</td>
      <td>${durationSec}s</td>
      <td class="${verdict.cssClass}">${verdict.label}${previousSec !== null ? ` <span class="title" style="display:inline">(prev ${previousSec}s)</span>` : ''}</td>
      <td>${escapeHtml(this.recordVersion(record) ?? '-')}</td>
      <td>${errorHtml}${notesHtml}${imagesHtml}${failureScreenshotsHtml}</td>
    </tr>`;
  }

  private buildSingleImageHtml(label: string, filePath: string): string {
    const dataUri = toDataUri(filePath);
    if (!dataUri) return '';
    return `<div class="images"><figure><img src="${dataUri}" loading="lazy"><figcaption>${escapeHtml(label)}</figcaption></figure></div>`;
  }

  private buildImageTrioHtml(img: ImageTrio): string {
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
}
