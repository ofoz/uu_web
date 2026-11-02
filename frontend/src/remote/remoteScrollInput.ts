const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

const WHEEL_PIXELS_PER_LINE = 18;
const WHEEL_LINES_PER_PAGE = 16;
const DEFAULT_WHEEL_PAGE_PIXELS = WHEEL_PIXELS_PER_LINE * WHEEL_LINES_PER_PAGE;
const DOMINANT_AXIS_RATIO = 1.6;
const DESKTOP_SCROLL_GAIN = 0.5;
const WINDOWS_PLATFORM = 1;
const MACOS_PLATFORM = 4;

interface BrowserWheelDeltaInput {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  pageHeight: number;
  desktopTarget: boolean;
}

interface RemoteScrollDelta {
  deltaX: number;
  deltaY: number;
}

export class RemoteScrollDeltaAccumulator {
  private remainderX = 0;
  private remainderY = 0;

  push(input: BrowserWheelDeltaInput): RemoteScrollDelta | undefined {
    const scale = wheelDeltaScale(input.deltaMode, input.pageHeight);
    const gain = input.desktopTarget ? DESKTOP_SCROLL_GAIN : 1;
    let scaledDeltaX = finiteDelta(input.deltaX) * scale * gain;
    let scaledDeltaY = finiteDelta(input.deltaY) * scale * gain;

    if (input.desktopTarget) {
      // Preserve intentional diagonals while suppressing clear cross-axis trackpad noise.
      const absoluteDeltaX = Math.abs(scaledDeltaX);
      const absoluteDeltaY = Math.abs(scaledDeltaY);
      if (absoluteDeltaX >= absoluteDeltaY * DOMINANT_AXIS_RATIO) scaledDeltaY = 0;
      else if (absoluteDeltaY >= absoluteDeltaX * DOMINANT_AXIS_RATIO) scaledDeltaX = 0;
    }

    this.remainderX += scaledDeltaX;
    this.remainderY += scaledDeltaY * (input.desktopTarget ? -1 : 1);

    const deltaX = Math.trunc(this.remainderX);
    const deltaY = Math.trunc(this.remainderY);
    this.remainderX -= deltaX;
    this.remainderY -= deltaY;

    if (deltaX === 0 && deltaY === 0) return undefined;
    return { deltaX, deltaY };
  }

  reset(): void {
    this.remainderX = 0;
    this.remainderY = 0;
  }
}

export function isDesktopRemoteScrollTarget(targetPlatform: number | undefined): boolean {
  // DOM vertical deltas follow content direction; UU desktop input follows the native wheel direction.
  return targetPlatform === WINDOWS_PLATFORM || targetPlatform === MACOS_PLATFORM;
}

function wheelDeltaScale(deltaMode: number, pageHeight: number): number {
  if (deltaMode === DOM_DELTA_LINE) return WHEEL_PIXELS_PER_LINE;
  if (deltaMode === DOM_DELTA_PAGE) {
    return Number.isFinite(pageHeight) && pageHeight > 0 ? pageHeight : DEFAULT_WHEEL_PAGE_PIXELS;
  }
  return 1;
}

function finiteDelta(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
