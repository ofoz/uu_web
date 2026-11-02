export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function dropUndefinedFields<T extends object>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function isMacPlatform(platform: number | undefined): boolean {
  return platform === 4;
}

export function isWindowsPlatform(platform: number | undefined): boolean {
  return platform === 1;
}

export function isDesktopPlatform(platform: number | undefined): boolean {
  return isMacPlatform(platform) || isWindowsPlatform(platform);
}
