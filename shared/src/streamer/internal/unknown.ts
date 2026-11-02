export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function assignOptionalString<T extends object, K extends keyof T>(target: T, key: K, value: unknown): void {
  if (typeof value === "string") {
    target[key] = value as T[K];
  }
}

export function assignOptionalNumber<T extends object, K extends keyof T>(target: T, key: K, value: unknown): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    target[key] = value as T[K];
  }
}

export function assignOptionalBoolean<T extends object, K extends keyof T>(target: T, key: K, value: unknown): void {
  if (typeof value === "boolean") {
    target[key] = value as T[K];
  }
}
