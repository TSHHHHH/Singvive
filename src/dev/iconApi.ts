export const MAX_ICON_BYTES = 64 * 1024;
/** Either edge of an uploaded icon must be ≤ this (UI tiles). */
export const MAX_ICON_EDGE = 256;

export type IconAssetInfo = { key: string; file: string; bytes: number };

export async function fetchChromeIcons(): Promise<{
  maxBytes: number;
  maxEdge: number;
  icons: IconAssetInfo[];
}> {
  const res = await fetch('/__dev/icons');
  if (!res.ok) throw new Error(`Failed to list icons (${res.status})`);
  return (await res.json()) as {
    maxBytes: number;
    maxEdge: number;
    icons: IconAssetInfo[];
  };
}

export async function uploadChromeIcon(
  key: string,
  file: File,
): Promise<{ key: string; file: string; bytes: number }> {
  if (file.size > MAX_ICON_BYTES) {
    throw new Error(`Icon exceeds ${MAX_ICON_BYTES} byte limit (${file.size} bytes)`);
  }
  if (file.type !== 'image/png' && file.type !== 'image/webp') {
    throw new Error('Only PNG and WebP uploads are allowed');
  }
  const size = await readImageSize(file);
  if (size.w > MAX_ICON_EDGE || size.h > MAX_ICON_EDGE) {
    throw new Error(
      `Icon too large (${size.w}×${size.h}). Max edge is ${MAX_ICON_EDGE}px.`,
    );
  }
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const dataBase64 = btoa(binary);

  const res = await fetch('/__dev/icon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key,
      mime: file.type,
      dataBase64,
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    key?: string;
    file?: string;
    bytes?: number;
  } | null;
  if (!res.ok) {
    throw new Error(body?.error ?? `Upload failed (${res.status})`);
  }
  return {
    key: body!.key!,
    file: body!.file!,
    bytes: body!.bytes!,
  };
}

export async function clearChromeIcon(
  key: string,
): Promise<{ key: string; removed: string | null }> {
  const res = await fetch(`/__dev/icon?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    key?: string;
    removed?: string | null;
  } | null;
  if (!res.ok) {
    throw new Error(body?.error ?? `Clear failed (${res.status})`);
  }
  return {
    key: body!.key!,
    removed: body!.removed ?? null,
  };
}

function readImageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      URL.revokeObjectURL(url);
      resolve({ w, h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image'));
    };
    img.src = url;
  });
}
