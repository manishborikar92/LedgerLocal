#!/usr/bin/env node
/** Pre-build: copy the pdf.js worker into public/ (self-hosted, no CDN). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
fs.mkdirSync(path.join(pub, 'pdfjs'), { recursive: true });

const worker = path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
if (!fs.existsSync(worker)) { console.error('pdfjs-dist is not installed: run npm ci'); process.exit(1); }
fs.copyFileSync(worker, path.join(pub, 'pdfjs/pdf.worker.min.mjs'));

console.log('prebuild ok');
