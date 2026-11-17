import type { AudioManifest } from '../audio/cues';

/** DEV client for vite.sound-dev-api.ts. */

export interface SoundListing {
  manifest: AudioManifest;
  maxBytes: number;
  exts: string[];
  orphans: { file: string; bytes: number }[];
  sizes: Record<string, number>;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  return body;
}

export function fetchSounds(): Promise<SoundListing> {
  return call<SoundListing>('/__dev/audio', { cache: 'no-cache' });
}

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    r.onerror = () => reject(r.error ?? new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

export function extOf(file: File): string {
  const m = /\.([a-z0-9]+)$/i.exec(file.name);
  return m ? m[1]!.toLowerCase() : '';
}

export async function uploadSound(
  cue: string,
  file: File,
  maxBytes: number,
): Promise<{ manifest: AudioManifest; file: string; bytes: number }> {
  if (file.size > maxBytes) {
    throw new Error(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB; the limit is ${maxBytes / 1048576} MB`);
  }
  return call('/__dev/audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cue, ext: extOf(file), dataBase64: await fileBase64(file) }),
  });
}

export function saveSoundSettings(
  cue: string,
  settings: { volume?: number; pitchVar?: number; loop?: boolean },
): Promise<{ manifest: AudioManifest }> {
  return call('/__dev/audio/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cue, ...settings }),
  });
}

export function clearSound(cue: string): Promise<{ manifest: AudioManifest; removed: string | null }> {
  return call(`/__dev/audio?cue=${encodeURIComponent(cue)}`, { method: 'DELETE' });
}
