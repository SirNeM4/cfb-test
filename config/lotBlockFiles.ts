export interface LotBlockFileConfig {
  /** Must exist as data/uploads/<file>. */
  file: string;
  /** Short identifier used to name this file's visual-regression baseline screenshot. */
  key: string;
}

/**
 * Files used by the Lot Block V2 upload tests.
 * Add or remove entries here to change which files get exercised by the test suite.
 */
export const lotBlockFiles: LotBlockFileConfig[] = [
  { file: 'Lake Louisa without sidewalk.json', key: 'lake-louisa' },
  { file: 'ColemanRidgePH1.json', key: 'coleman-ridge' },
  { file: 'Goose-Creek107-09102026.json', key: 'goose-creek' },
  { file: 'LSF-Phase1-09162026.json', key: 'lsf-phase1' },
  { file: 'LSF-Phase2-09162026.json', key: 'lsf-phase2' },
];
