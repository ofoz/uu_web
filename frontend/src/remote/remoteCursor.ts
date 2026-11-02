import type { DecodedStreamerCursorShape } from "@uurc/shared/streamer/controlChannelDecode";

export const REMOTE_CURSOR_LOCAL_RENDERING_ENABLED = import.meta.env.VITE_REMOTE_CURSOR_LOCAL_RENDERING !== "false";

export const REMOTE_CURSOR_IMAGE_LIMITS = {
  maxBytes: 512 * 1024,
  maxDimension: 4096,
  maxPixels: 4 * 1024 * 1024,
  maxRenderedDimension: 128,
} as const;

type RemoteCursorKind =
  | "default"
  | "text"
  | "wait"
  | "crosshair"
  | "move"
  | "nwse-resize"
  | "nesw-resize"
  | "ew-resize"
  | "ns-resize"
  | "not-allowed"
  | "pointer"
  | "progress"
  | "help";

export interface RemoteCursorPresentation {
  hidden: boolean;
  kind: RemoteCursorKind;
  cssFallback: string;
  imageBytes?: Uint8Array;
  imageWidth?: number;
  imageHeight?: number;
  renderWidth: number;
  renderHeight: number;
  hotspotX: number;
  hotspotY: number;
  imageDensity: number;
  requiresImageResize: boolean;
  screenId?: number;
}

const DEFAULT_CURSOR_SIZE = { width: 20, height: 24, hotspotX: 1, hotspotY: 1 } as const;

export function createDefaultRemoteCursorPresentation(): RemoteCursorPresentation {
  return {
    hidden: false,
    kind: "default",
    cssFallback: "default",
    renderWidth: DEFAULT_CURSOR_SIZE.width,
    renderHeight: DEFAULT_CURSOR_SIZE.height,
    hotspotX: DEFAULT_CURSOR_SIZE.hotspotX,
    hotspotY: DEFAULT_CURSOR_SIZE.hotspotY,
    imageDensity: 1,
    requiresImageResize: false,
  };
}

export function createRemoteCursorPresentation(shape: DecodedStreamerCursorShape): RemoteCursorPresentation {
  const kind = remoteCursorKind(shape.cursorType);
  const fallback = remoteCursorCssFallback(kind);
  if (shape.cursorType === -1) {
    return {
      hidden: true,
      kind,
      cssFallback: "none",
      renderWidth: 1,
      renderHeight: 1,
      hotspotX: 0,
      hotspotY: 0,
      imageDensity: 1,
      requiresImageResize: false,
      screenId: safeInt32(shape.screenId),
    };
  }

  const image = validateCursorPng(shape.byteValue);
  const reportedWidth = positiveInteger(shape.width);
  const reportedHeight = positiveInteger(shape.height);
  const logicalWidth = reportedWidth ?? image?.width;
  const logicalHeight = reportedHeight ?? image?.height;
  if (!image || !logicalWidth || !logicalHeight || !validCursorDimensions(logicalWidth, logicalHeight)) {
    const fallbackMetrics = cursorFallbackMetrics(kind);
    return {
      ...fallbackMetrics,
      hidden: false,
      kind,
      cssFallback: fallback,
      imageDensity: 1,
      requiresImageResize: false,
      screenId: safeInt32(shape.screenId),
    };
  }

  // Cursor bitmaps may be Retina assets while width/height describe their logical bounds.
  // A single density keeps the source aspect ratio intact even when protocol axis scales differ.
  const renderScale = Math.min(
    1,
    logicalWidth / image.width,
    logicalHeight / image.height,
    REMOTE_CURSOR_IMAGE_LIMITS.maxRenderedDimension / image.width,
    REMOTE_CURSOR_IMAGE_LIMITS.maxRenderedDimension / image.height,
  );
  const renderWidth = Math.max(1, Math.round(image.width * renderScale));
  const renderHeight = Math.max(1, Math.round(image.height * renderScale));
  const sourceHotspotX = clamp(safeInt32(shape.posX) ?? 0, 0, Math.max(0, logicalWidth - 1));
  const sourceHotspotY = clamp(safeInt32(shape.posY) ?? 0, 0, Math.max(0, logicalHeight - 1));

  return {
    hidden: false,
    kind,
    cssFallback: fallback,
    imageBytes: image.bytes,
    imageWidth: image.width,
    imageHeight: image.height,
    renderWidth,
    renderHeight,
    hotspotX: clamp(Math.round((sourceHotspotX / logicalWidth) * renderWidth), 0, renderWidth - 1),
    hotspotY: clamp(Math.round((sourceHotspotY / logicalHeight) * renderHeight), 0, renderHeight - 1),
    imageDensity: 1 / renderScale,
    requiresImageResize: image.width !== renderWidth || image.height !== renderHeight,
    screenId: safeInt32(shape.screenId),
  };
}

function remoteCursorKind(cursorType: number | undefined): RemoteCursorKind {
  switch (cursorType) {
    case 0x7f01:
      return "text";
    case 0x7f02:
      return "wait";
    case 0x7f03:
      return "crosshair";
    case 0x7f80:
    case 0x7f86:
      return "move";
    case 0x7f82:
      return "nwse-resize";
    case 0x7f83:
      return "nesw-resize";
    case 0x7f84:
      return "ew-resize";
    case 0x7f85:
      return "ns-resize";
    case 0x7f88:
      return "not-allowed";
    case 0x7f89:
      return "pointer";
    case 0x7f8a:
      return "progress";
    case 0x7f8b:
      return "help";
    default:
      return "default";
  }
}

function remoteCursorCssFallback(kind: RemoteCursorKind): string {
  return kind;
}

function cursorFallbackMetrics(kind: RemoteCursorKind): {
  renderWidth: number;
  renderHeight: number;
  hotspotX: number;
  hotspotY: number;
} {
  if (kind === "text") return { renderWidth: 18, renderHeight: 24, hotspotX: 9, hotspotY: 12 };
  if (kind === "pointer") return { renderWidth: 22, renderHeight: 24, hotspotX: 7, hotspotY: 2 };
  if (kind !== "default") return { renderWidth: 22, renderHeight: 22, hotspotX: 11, hotspotY: 11 };
  return {
    renderWidth: DEFAULT_CURSOR_SIZE.width,
    renderHeight: DEFAULT_CURSOR_SIZE.height,
    hotspotX: DEFAULT_CURSOR_SIZE.hotspotX,
    hotspotY: DEFAULT_CURSOR_SIZE.hotspotY,
  };
}

function validateCursorPng(
  bytes: Uint8Array | undefined,
): { bytes: Uint8Array; width: number; height: number } | undefined {
  if (!bytes || bytes.byteLength < 24 || bytes.byteLength > REMOTE_CURSOR_IMAGE_LIMITS.maxBytes) return undefined;
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!pngSignature.every((byte, index) => bytes[index] === byte)) return undefined;
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return undefined;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (!validCursorDimensions(width, height)) return undefined;
  return { bytes: bytes.slice(), width, height };
}

function validCursorDimensions(width: number, height: number): boolean {
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= REMOTE_CURSOR_IMAGE_LIMITS.maxDimension &&
    height <= REMOTE_CURSOR_IMAGE_LIMITS.maxDimension &&
    width * height <= REMOTE_CURSOR_IMAGE_LIMITS.maxPixels
  );
}

function positiveInteger(value: number | undefined): number | undefined {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function safeInt32(value: number | undefined): number | undefined {
  return value !== undefined && Number.isSafeInteger(value) && value >= -0x80000000 && value <= 0x7fffffff
    ? value
    : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
