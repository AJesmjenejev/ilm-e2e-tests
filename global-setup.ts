import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const CERT_DIR = path.join(__dirname, 'certs');

const CERTS = [
  {
    filename: 'root-ca.cert.pem',
    url: 'https://raw.githubusercontent.com/OmniTrustILM/helm-charts/main/dummy-certificates/certs/root-ca.cert.pem',
  },
  {
    filename: 'admin.cert.pem',
    url: 'https://raw.githubusercontent.com/OmniTrustILM/helm-charts/main/dummy-certificates/certs/admin.cert.pem',
  },
];

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(download(res.headers.location, dest));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed (${res.statusCode}): ${url}`));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

export default async function globalSetup(): Promise<void> {
  fs.mkdirSync(CERT_DIR, { recursive: true });

  for (const { filename, url } of CERTS) {
    const dest = path.join(CERT_DIR, filename);
    if (fs.existsSync(dest)) {
      console.log(`[setup] ${filename} already present — skipping download`);
      continue;
    }
    console.log(`[setup] downloading ${filename}...`);
    await download(url, dest);
    console.log(`[setup] saved ${filename}`);
  }
}