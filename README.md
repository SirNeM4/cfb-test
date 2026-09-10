# cfb-automation

End-to-end test automation project built with **Playwright + TypeScript**, using the **Page Object Model (POM)** design pattern.

This document explains how to install the project, understand its structure, and run the automated tests on both **Windows** and **macOS**.

## Table of contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Environment configuration](#environment-configuration)
4. [Folder structure](#folder-structure)
5. [Running the tests](#running-the-tests)
6. [Test reports](#test-reports)
7. [Uploading and downloading files in tests](#uploading-and-downloading-files-in-tests)
8. [Using credentials / test users](#using-credentials--test-users)
9. [Lot Block V2: multi-file upload and visual regression](#lot-block-v2-multi-file-upload-and-visual-regression)
10. [How to add a new test](#how-to-add-a-new-test)
11. [Troubleshooting](#troubleshooting)
12. [Best practices and security](#best-practices-and-security)

---

## Prerequisites

You need to have installed:

- **Node.js 18 or higher** (includes `npm`).
- **Git** (to clone the repository).
- **Google Chrome** installed on the system. The project is configured to use the real `chrome` channel (not the Chromium bundled with Playwright), defined via `BROWSER_CHANNEL` in `.env`.

### Checking prerequisites

**macOS** (Terminal):

```bash
node -v
npm -v
git --version
```

**Windows** (PowerShell or CMD):

```powershell
node -v
npm -v
git --version
```

If Node.js is not installed:

- **macOS**: download the installer from [nodejs.org](https://nodejs.org/) or use Homebrew: `brew install node`.
- **Windows**: download the `.msi` installer from [nodejs.org](https://nodejs.org/) and follow the wizard (make sure to add it to `PATH`, which is checked by default).

If Google Chrome is not installed, download it from [google.com/chrome](https://www.google.com/chrome/).

---

## Installation

### 1. Clone the repository

**macOS** (Terminal):

```bash
git clone <REPOSITORY_URL>
cd cfb-automation
```

**Windows** (PowerShell or CMD):

```powershell
git clone <REPOSITORY_URL>
cd cfb-automation
```

### 2. Install dependencies

From the project root, on both operating systems:

```bash
npm install
```

### 3. Install Playwright browsers (optional)

The project uses the real Chrome installed on your system (`channel: chrome`). You only need this step if you **don't** have Chrome installed, or if you want to use Playwright's bundled Chromium as a fallback:

```bash
npx playwright install chromium
```

> On Windows, if this is the first time you use Playwright on the machine, it may also ask for system dependencies. Follow the instructions shown in the console.

---

## Environment configuration

The project uses a `.env` file (not included in the repository for security reasons) and a `config/users.json` file for test credentials.

### 1. Create the `.env` file

**macOS** (Terminal):

```bash
cp .env.example .env
```

**Windows** (PowerShell):

```powershell
Copy-Item .env.example .env
```

**Windows** (CMD):

```cmd
copy .env.example .env
```

Then open `.env` with your text editor and adjust the values as needed:

```dotenv
# Base URL of the application under test
BASE_URL=https://app-dev.drtwrk.io

# Run in headless mode (true/false). With false, you'll see the browser open.
HEADLESS=false

# Browser channel Playwright will use: "chrome", "chrome-beta", "msedge", etc.
# Leave empty or use "chromium" for Playwright's bundled Chromium.
BROWSER_CHANNEL=chrome

# Paths relative to the project root for uploading/downloading files in tests
UPLOADS_DIR=data/uploads
DOWNLOADS_DIR=data/downloads

# Default credentials (a simple alternative to config/users.json)
DEFAULT_USERNAME=your_user@example.com
DEFAULT_PASSWORD=YOUR_PASSWORD
```

### 2. Create the `config/users.json` file

**macOS** (Terminal):

```bash
cp config/users.example.json config/users.json
```

**Windows** (PowerShell):

```powershell
Copy-Item config/users.example.json config/users.json
```

**Windows** (CMD):

```cmd
copy config\users.example.json config\users.json
```

Edit `config/users.json` with the real user profiles you need:

```json
{
  "admin": {
    "username": "admin@example.com",
    "password": "CHANGE_ME"
  },
  "standardUser": {
    "username": "user@example.com",
    "password": "CHANGE_ME"
  }
}
```

> `.env` and `config/users.json` are in `.gitignore`: they are never pushed to the repository. Anyone cloning the project must create their own locally by following these steps.

---

## Folder structure

```
cfb-automation/
├── config/                    Project configuration
│   ├── env.ts                 Loads environment variables from .env
│   ├── users.ts                Helper to read config/users.json
│   ├── users.json              Real test credentials (NOT pushed to git)
│   ├── users.example.json      Example template for users.json
│   └── lotBlockFiles.ts        List of files exercised by the lot-block-v2 multi-upload spec
│
├── pages/                     Page Objects (POM pattern)
│   ├── BasePage.ts             Base class: goto, file upload/download
│   ├── LoginPage.ts            Login page
│   ├── HomePage.ts             Post-login landing page
│   └── LotBlockPage.ts         "lot-block-v2" file upload page/modal
│
├── tests/
│   ├── fixtures/                Reusable Playwright fixtures
│   └── specs/                   .spec.ts files with the test cases
│       ├── login.spec.ts
│       ├── lot-block-v2.spec.ts
│       ├── lot-block-v2-multi-upload.spec.ts       Uploads every file in lotBlockFiles, grades it, and checks visual baselines
│       └── lot-block-v2-multi-upload.spec.ts-snapshots/   Visual regression baselines (tracked in git)
│
├── utils/
│   ├── downloadHelper.ts        Helpers to upload/download files
│   └── visualCompare.ts         Screenshot baseline creation/comparison helper
│
├── data/
│   ├── uploads/                 Files (.json, etc.) used to upload during tests
│   └── downloads/                Destination folder for downloads generated by test runs
│
├── playwright-report/           HTML report generated after each run (auto-generated)
├── test-results/                Screenshots, videos and traces of failures (auto-generated)
│
├── .env.example                 Environment variables template
├── .env                         Real environment variables (NOT pushed to git)
├── playwright.config.ts         Global Playwright configuration
├── tsconfig.json                TypeScript configuration
└── package.json                 Dependencies and npm scripts
```

---

## Running the tests

All commands are run from the project root and are **identical on Windows and macOS**, since Playwright and npm handle the operating system differences internally.

```bash
npm test              # Run all tests (headless/headed mode depending on HEADLESS in .env)
npm run test:headed   # Run tests with the browser visible
npm run test:ui       # Open Playwright's interactive UI mode (recommended for exploring)
npm run test:debug    # Run in step-by-step debug mode
```

### Running a specific test file

```bash
npx playwright test tests/specs/login.spec.ts
npx playwright test tests/specs/lot-block-v2.spec.ts
npx playwright test tests/specs/lot-block-v2-multi-upload.spec.ts
```

### Running a single test by name

```bash
npx playwright test -g "can sign in"
```

### Listing available tests without running them

```bash
npx playwright test --list
```

> Local runs are capped at 3 workers (`playwright.config.ts`). If a spec defines more than 3 tests, the extras queue and start as soon as a worker frees up.

---

## Test reports

After the run finishes, Playwright generates an HTML report in `playwright-report/`. To open it:

```bash
npm run report
```

This opens the report in your default browser, on both Windows and macOS.

If a test fails, `test-results/` will automatically contain:

- Screenshots (`.png`) of the moment of failure.
- Video of the run (`.webm`).
- A trace (`trace.zip`) you can open with `npx playwright show-trace <file>` to debug step by step.

---

## Uploading and downloading files in tests

- Place the files you need to upload (JSON or others) in `data/uploads/`.
- From a Page Object (that extends `BasePage`), upload them with:

  ```ts
  await this.uploadFile(locator, 'file-name.json');
  ```

- Downloads generated during a test are automatically saved to the folder configured in `DOWNLOADS_DIR` (`data/downloads/` by default) using:

  ```ts
  await this.downloadTriggeredBy(() => someButton.click());
  ```

> If the file name contains spaces (e.g. `Lake Louisa without sidewalk.json`), you don't need to escape it when passing it as a string in TypeScript; Playwright and Node.js resolve it correctly on both operating systems.

---

## Using credentials / test users

You can use the default credentials defined in `.env` (`env.defaultUser`) or multiple profiles defined in `config/users.json`:

```ts
import { getUser } from '../../config/users';

const admin = getUser('admin');
await page.fill('#username', admin.username);
await page.fill('#password', admin.password);
```

---

## Lot Block V2: multi-file upload and visual regression

`tests/specs/lot-block-v2-multi-upload.spec.ts` runs one test per file listed in `config/lotBlockFiles.ts`. Each test:

1. Logs in and opens `lot-block-v2`.
2. Uploads the file and waits for the map to finish loading.
3. Clicks "View all", then a Group/Zone in the left panel, and grades it (right-click on the canvas center with Ctrl+Shift held → "Smoke'em All"), waiting up to 300s for grading to complete.
4. Re-enters the graded group, navigates to the next valid group, and toggles the lot mesh view, capturing a screenshot at each step for visual regression.

### Adding/removing files

Edit `config/lotBlockFiles.ts`. Each entry needs a `file` (must exist under `data/uploads/`) and a short `key` used to name that file's baseline screenshots:

```ts
export const lotBlockFiles: LotBlockFileConfig[] = [
  { file: 'Lake Louisa without sidewalk.json', key: 'lake-louisa' },
];
```

To temporarily skip a file without deleting its config, comment out its entry.

### How the visual checks work

`utils/visualCompare.ts` exports `compareOrSaveBaseline(page, testInfo, name)`:

- If no baseline exists yet for `name`, it saves the current screenshot as the baseline and the test passes.
- If a baseline exists, it compares the current screenshot against it (default tolerance: `maxDiffPixelRatio = 0.02`, i.e. up to 2% of pixels may differ). A mismatch fails the test, and Playwright attaches the actual/expected/diff images to the HTML report — the diff image highlights exactly where the pages differ.

Baselines live in `tests/specs/lot-block-v2-multi-upload.spec.ts-snapshots/` and are committed to git. To intentionally update a baseline after a real UI change, delete the corresponding file(s) and re-run the test so it gets recreated, then review and commit the new image.

### Group/Zone selection rule

The left panel tree mixes Groups, Zones, and Areas (which contain nested Groups/Zones). `LotBlockPage.clickFirstValidGroupOrZone()` walks the tree and clicks the first entry that is either a Group, or any entry nested inside an Area — it skips a standalone Zone that sits directly under "View all" outside of any Area, since that isn't a meaningful grading target.

---

## How to add a new test

1. If the test interacts with a new page, create a Page Object in `pages/` that extends `BasePage`.
2. Create the test file in `tests/specs/` with a `.spec.ts` extension.
3. Follow the pattern used in the existing specs (`login.spec.ts`, `lot-block-v2.spec.ts`): instantiate the Page Object(s), use `env` or `getUser()` for credentials, and assert with `expect`.
4. Run `npx playwright test --list` to confirm Playwright detects the new file.

---

## Troubleshooting

### Windows: npm scripts won't run (PowerShell)

If running `npm test` shows an execution policy error, open PowerShell as administrator and run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Then try the command again.

### Error: "chrome" channel not found / Chrome doesn't open

This means Playwright couldn't find Google Chrome installed on the system.

- Install Google Chrome from [google.com/chrome](https://www.google.com/chrome/), or
- Change `BROWSER_CHANNEL` in `.env` to empty or `chromium`, and run:

  ```bash
  npx playwright install chromium
  ```

### Missing required environment variable

Check that the `.env` file exists at the project root (not inside `config/`) and that it has all the variables from `.env.example`.

### The login test fails with invalid credentials

Check `DEFAULT_USERNAME` / `DEFAULT_PASSWORD` in `.env`, or the profiles in `config/users.json`, and confirm the account exists in the environment pointed to by `BASE_URL`.

### Tests are slow or selectors can't find elements

Run with `npm run test:headed` or `npm run test:ui` to visually see what's happening in the browser during the run.

### `\` vs `/` in paths

The project code uses Node.js's `path.join`/`path.resolve` to build file paths, so it works the same way on Windows and macOS without manual changes.

---

## Best practices and security

- **Never push `.env` or `config/users.json` to the repository.** They're already in `.gitignore`.
- Don't share real credentials outside authorized internal channels.
- Before committing, check that no files with sensitive data are included (`git status` / `git diff`).
- Files in `data/uploads/` used by tests should be test data, not real customer information.
