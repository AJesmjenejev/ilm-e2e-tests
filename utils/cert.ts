import * as fs from 'fs';
import * as path from 'path';

const CERT_DIR = path.join(__dirname, '..', 'certs');

export const ROOT_CA_PEM  = path.join(CERT_DIR, 'root-ca.cert.pem');
export const ADMIN_PEM    = path.join(CERT_DIR, 'admin.cert.pem');

/** Extract base64 DER from a PEM file (handles text/openssl-x509 headers before the block). */
export function pemToBase64(pemPath: string): string {
  const pem = fs.readFileSync(pemPath, 'utf-8');
  const match = pem.match(/-----BEGIN CERTIFICATE-----\s*([\s\S]+?)\s*-----END CERTIFICATE-----/);
  if (!match) throw new Error(`No PEM certificate block found in ${pemPath}`);
  return match[1].replace(/\s+/g, '');
}

/**
 * Returns the base64 DER for the admin certificate.
 * Prefers ADMIN_CERT_B64 env var (faster, no disk read on CI);
 * falls back to the downloaded PEM file.
 */
export function adminCertBase64(): string {
  if (process.env.ADMIN_CERT_B64) return process.env.ADMIN_CERT_B64.trim();
  return pemToBase64(ADMIN_PEM);
}