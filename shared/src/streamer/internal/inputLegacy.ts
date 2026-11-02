export const STREAMER_INPUT_MANAGER_IME_CONTROL_CODES = {
  BACKSPACE: 14,
  ENTER: 28,
  HIDESELF: 100001,
} as const;

export const STREAMER_MUMU_SYSTEM_KEY_CODES = { BACK: 158, HOME: 172, MENU: 580 } as const;
export const STREAMER_INPUT_MANAGER_TOUCH_SLOTS = [26, 27, 28, 29, 30, 31] as const;

type StreamerImeControlKind = keyof typeof STREAMER_INPUT_MANAGER_IME_CONTROL_CODES;
type StreamerMumuSystemKey = keyof typeof STREAMER_MUMU_SYSTEM_KEY_CODES;

export interface StreamerTouchSurface {
  displayId: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface StreamerTouchPoint {
  id: number;
  relX: number;
  relY: number;
}

export interface StreamerTouchInputTracker {
  start(): string[];
  update(points: readonly StreamerTouchPoint[]): string[];
  end(): string[];
  reset(): string[];
}

export function buildStreamerImeTextInputMessage(text: string): string {
  return `TEXT:${text}`;
}

export function buildStreamerImeControlInputMessage(kind: StreamerImeControlKind): string {
  return `TEXT_CONTROL:${kind}`;
}

export function buildStreamerSystemKeyInputMessages(input: {
  displayId: number;
  key: StreamerMumuSystemKey;
}): string[] {
  const keyCode = STREAMER_MUMU_SYSTEM_KEY_CODES[input.key];
  return [`${input.displayId}:KBDPR:${keyCode}:1\n`, `${input.displayId}:KBDRL:${keyCode}:0\n`];
}

export function createStreamerTouchInputTracker(surface: StreamerTouchSurface): StreamerTouchInputTracker {
  return new TouchInputTracker(surface);
}

class TouchInputTracker implements StreamerTouchInputTracker {
  private readonly activeSlotsByTouchId = new Map<number, number>();

  constructor(private readonly surface: StreamerTouchSurface) {}

  start(): string[] {
    return this.reset();
  }

  update(points: readonly StreamerTouchPoint[]): string[] {
    const nextTouchIds = new Set(points.map((point) => point.id));
    const releaseSlots = [...this.activeSlotsByTouchId.entries()]
      .filter(([touchId]) => !nextTouchIds.has(touchId))
      .sort(([left], [right]) => left - right)
      .map(([touchId, slot]) => {
        this.activeSlotsByTouchId.delete(touchId);
        return slot;
      });

    const messages: string[] = [];
    if (releaseSlots.length > 0)
      messages.push(cook(this.surface.displayId, `SLOTMULTIRELEASE:${releaseSlots.join(":")}`));
    const pressParts: string[] = [];
    for (const point of points) {
      const slot = this.slotForTouch(point.id);
      if (slot === null) continue;
      const { x, y } = transformTouchPoint(this.surface, point);
      pressParts.push(`${slot}:${slot}:${x}:${y}`);
    }
    if (pressParts.length > 0) messages.push(cook(this.surface.displayId, `SLOTMULTIPRESS:${pressParts.join(":")}`));
    return messages;
  }

  end(): string[] {
    return this.reset();
  }

  reset(): string[] {
    this.activeSlotsByTouchId.clear();
    return [cook(this.surface.displayId, `SLOTMULTIRELEASE:${STREAMER_INPUT_MANAGER_TOUCH_SLOTS.join(":")}`)];
  }

  private slotForTouch(touchId: number): number | null {
    const current = this.activeSlotsByTouchId.get(touchId);
    if (current !== undefined) return current;
    const used = new Set(this.activeSlotsByTouchId.values());
    const slot = STREAMER_INPUT_MANAGER_TOUCH_SLOTS.find((candidate) => !used.has(candidate));
    if (slot === undefined) return null;
    this.activeSlotsByTouchId.set(touchId, slot);
    return slot;
  }
}

function transformTouchPoint(surface: StreamerTouchSurface, point: StreamerTouchPoint): { x: number; y: number } {
  let xRatio = point.relX;
  let yRatio = point.relY;
  if (surface.rotation === 90) {
    xRatio = 1 - point.relY;
    yRatio = point.relX;
  } else if (surface.rotation === 270) {
    xRatio = point.relY;
    yRatio = 1 - point.relX;
  }
  return { x: Math.round(xRatio * surface.width), y: Math.round(yRatio * surface.height) };
}

function cook(displayId: number, command: string): string {
  return `${displayId}:${command}\n`;
}
