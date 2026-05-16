import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

export type TestEnv = {
  readonly baseUrl: string;    // UI — http://localhost:5173 (browser tests)
  readonly apiBaseUrl: string; // API — http://localhost:8280 (direct API calls)
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function loadEnv(): TestEnv {
  return {
    baseUrl:    required('BASE_URL'),
    apiBaseUrl: required('API_BASE_URL'),
  };
}