import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  baseUrl: process.env.BASE_URL ?? 'https://www.google.com',
  headless: (process.env.HEADLESS ?? 'false') === 'true',
  browserChannel: process.env.BROWSER_CHANNEL ?? 'chrome',

  // Paths used by tests to upload/download files
  uploadsDir: path.resolve(__dirname, '..', process.env.UPLOADS_DIR ?? 'data/uploads'),
  downloadsDir: path.resolve(__dirname, '..', process.env.DOWNLOADS_DIR ?? 'data/downloads'),

  // Default credentials (you can also use config/users.json for multiple profiles)
  defaultUser: {
    username: process.env.DEFAULT_USERNAME ?? '',
    password: process.env.DEFAULT_PASSWORD ?? '',
  },
};

export { required };
