export interface LandscapeHost {
  fullscreenElement: unknown | null;
  documentElement: {
    requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
  };
}

export interface LandscapeOrientation {
  lock?: (orientation: "landscape") => Promise<void>;
}

/** Call from a user gesture; support and permission vary between browsers. */
export async function requestLandscape(
  host: LandscapeHost,
  orientation: LandscapeOrientation | undefined,
): Promise<{ fullscreen: boolean; locked: boolean }> {
  if (!host.fullscreenElement && host.documentElement.requestFullscreen) {
    try {
      await host.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {
      // Standalone browsers may allow orientation lock without fullscreen.
    }
  }

  let locked = false;
  if (orientation?.lock) {
    try {
      await orientation.lock("landscape");
      locked = true;
    } catch {
      // The rotate-device prompt remains the fallback when locking is denied.
    }
  }
  return { fullscreen: Boolean(host.fullscreenElement), locked };
}
