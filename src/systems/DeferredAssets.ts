/**
 * Heavy assets now load in PreloadScene through compact startup textures.
 * Keep this API as a no-op guard so old call sites cannot restart background loading.
 */
export function startDeferredAssetLoading(
  _scene?: unknown,
  _opts?: { readonly delayMs?: number },
): void {
  writeProgress(1);
}

export function deferredAssetProgress(): number {
  return 1;
}

function writeProgress(progress: number): void {
  const clamped = Math.max(0, Math.min(1, progress));
  (globalThis as { __HAIBAO_DEFERRED_ASSET_PROGRESS__?: number }).__HAIBAO_DEFERRED_ASSET_PROGRESS__ =
    clamped;
  globalThis.dispatchEvent?.(
    new CustomEvent('haibao:deferred-assets-progress', { detail: { progress: clamped } }),
  );
}
