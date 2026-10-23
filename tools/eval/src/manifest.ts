import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { COLORS, BRAGP, SHOWP } from '@snag/shared';
import { photoDir } from './paths.js';

export type Color = typeof COLORS[number]['k'];
export type ColorRole = 'true' | 'near' | 'hard' | 'distractor';
export interface Photo {
  id: string;
  file: string;
  title: string;
  subject: string;
  sourceUrl: string;
  imageUrl: string;
  downloadUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
  licenseEvidence: string;
  fetched: string;
  reason: string;
  kind: 'object' | 'face';
  colors: Partial<Record<Color, ColorRole>>;
  traits: string[];
  conditions: string[];
  sha256: string;
  bytes: number;
  sourceWidth: number;
  sourceHeight: number;
  expectedFaces?: number;
  faceBoxes?: [number, number, number, number][];
}
export interface Manifest {
  version: 1;
  description: string;
  capture: { size: number; jpegQuality: number; crop: string; encoder: string };
  photos: Photo[];
}

export async function readManifest(): Promise<Manifest> {
  const manifest = JSON.parse(await readFile(resolve(photoDir, 'manifest.json'), 'utf8')) as Manifest;
  const errors = coverageErrors(manifest);
  if (errors.length) throw new Error(errors.join('\n'));
  return manifest;
}

export function fixturePath(photo: Pick<Photo, 'file'>): string {
  const path = resolve(photoDir, photo.file);
  if (!relative(photoDir, path) || relative(photoDir, path).startsWith('..') || !photo.file.endsWith('.jpg')) {
    throw new Error('Only manifest-listed JPEG fixtures inside photos/ are accepted');
  }
  return path;
}

export function coverageErrors(manifest: Manifest): string[] {
  const errors: string[] = [];
  const photos = manifest.photos;
  const objects = photos.filter(p => p.kind === 'object');
  const faces = photos.filter(p => p.kind === 'face');
  if (manifest.version !== 1) errors.push('Unsupported manifest version');
  if (objects.length < 60 || objects.length > 80) errors.push('Need 60–80 object photos');
  if (faces.length < 10 || faces.length > 15) errors.push('Need 10–15 face photos');
  if (manifest.capture.size !== 720 || manifest.capture.jpegQuality !== 0.8) errors.push('Capture must be 720 square, JPEG q .8');
  if (new Set(photos.map(p => p.id)).size !== photos.length) errors.push('Duplicate photo IDs');
  if (new Set(photos.map(p => p.file)).size !== photos.length) errors.push('Duplicate photo paths');
  if (new Set(photos.map(p => p.sha256)).size !== photos.length) errors.push('Duplicate image bytes');
  for (const p of photos) {
    if (!p.author || !p.reason || !p.licenseEvidence || !/^\d{4}-\d{2}-\d{2}$/.test(p.fetched)) errors.push(`${p.id}: incomplete provenance`);
    for (const url of [p.sourceUrl, p.imageUrl, p.downloadUrl, p.licenseUrl]) {
      if (!/^https:\/\//.test(url)) errors.push(`${p.id}: missing HTTPS provenance URL`);
    }
    if (!/^(CC0|Public domain|CC BY(-SA)? \d)/.test(p.license) || /NC|ND/.test(p.license)) errors.push(`${p.id}: redistribution license not accepted`);
    if (p.kind === 'face' && (!/^(CC0|Public domain)/.test(p.license) || !p.file.startsWith('faces/'))) errors.push(`${p.id}: faces must be isolated and CC0/public domain`);
    if (p.kind === 'object' && p.file.startsWith('faces/')) errors.push(`${p.id}: object in faces folder`);
    if (p.kind === 'face' && !(p.expectedFaces && p.expectedFaces > 0)) errors.push(`${p.id}: missing face count`);
    if (p.kind === 'face' && (p.faceBoxes?.length !== p.expectedFaces || p.faceBoxes?.some(box => box.length !== 4 || box.some(v => !Number.isFinite(v)) || box[0] < 0 || box[1] < 0 || box[2] <= 0 || box[3] <= 0 || box[0] + box[2] > 720 || box[1] + box[3] > 720))) errors.push(`${p.id}: invalid expected face boxes`);
    if (!/^[a-f0-9]{64}$/.test(p.sha256) || p.bytes <= 0) errors.push(`${p.id}: missing image receipt`);
    try { fixturePath(p); } catch { errors.push(`${p.id}: unsafe fixture path`); }
    for (const [color, role] of Object.entries(p.colors)) {
      if (!COLORS.some(c => c.k === color) || !['true', 'near', 'hard', 'distractor'].includes(role!)) errors.push(`${p.id}: invalid color tag`);
    }
  }
  for (const { k } of COLORS) {
    for (const [role, min] of [['true', 3], ['near', 2], ['hard', 1]] as const) {
      if (objects.filter(p => p.colors[k] === role).length < min) errors.push(`${k}: need at least ${min} ${role} photos`);
    }
    if (objects.filter(p => p.colors[k] === 'distractor').length < 4) errors.push(`${k}: need at least four distractors`);
  }
  for (const { t } of [...BRAGP, ...SHOWP]) {
    if (objects.filter(p => p.traits.includes(t)).length < 2) errors.push(`${t}: need at least two strong trait candidates`);
  }
  if (objects.filter(p => p.conditions.includes('messy')).length < 5) errors.push('Need five messy-reality fixtures');
  return errors;
}
