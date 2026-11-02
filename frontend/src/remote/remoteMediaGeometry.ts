type RemoteMediaObjectFit = "contain" | "cover";

interface RemoteMediaRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface RemoteMediaPoint {
  x: number;
  y: number;
}

export interface RemoteMediaGeometry {
  containerRect: RemoteMediaRect;
  displayRect: RemoteMediaRect;
  visibleRect: RemoteMediaRect;
  mediaWidth: number;
  mediaHeight: number;
  scale: number;
}

interface RemoteMediaNormalizedPoint extends RemoteMediaPoint {
  insideVisibleMedia: boolean;
}

export function computeRemoteMediaGeometry(input: {
  containerRect: RemoteMediaRect;
  mediaWidth: number;
  mediaHeight: number;
  objectFit: RemoteMediaObjectFit;
}): RemoteMediaGeometry | undefined {
  const { containerRect, mediaWidth, mediaHeight, objectFit } = input;
  if (!isValidRect(containerRect) || !isPositiveFinite(mediaWidth) || !isPositiveFinite(mediaHeight)) {
    return undefined;
  }

  const widthScale = containerRect.width / mediaWidth;
  const heightScale = containerRect.height / mediaHeight;
  const scale = objectFit === "cover" ? Math.max(widthScale, heightScale) : Math.min(widthScale, heightScale);
  const displayRect = {
    left: containerRect.left + (containerRect.width - mediaWidth * scale) / 2,
    top: containerRect.top + (containerRect.height - mediaHeight * scale) / 2,
    width: mediaWidth * scale,
    height: mediaHeight * scale,
  };

  return {
    containerRect: { ...containerRect },
    displayRect,
    visibleRect: intersectRects(containerRect, displayRect),
    mediaWidth,
    mediaHeight,
    scale,
  };
}

export function clientPointToRemoteMedia(
  geometry: RemoteMediaGeometry,
  clientPoint: RemoteMediaPoint,
  options: { clamp?: boolean } = {},
): RemoteMediaNormalizedPoint {
  const normalizedX = (clientPoint.x - geometry.displayRect.left) / geometry.displayRect.width;
  const normalizedY = (clientPoint.y - geometry.displayRect.top) / geometry.displayRect.height;
  const shouldClamp = options.clamp ?? true;

  return {
    x: shouldClamp ? clampUnit(normalizedX) : normalizedX,
    y: shouldClamp ? clampUnit(normalizedY) : normalizedY,
    insideVisibleMedia: containsPoint(geometry.visibleRect, clientPoint),
  };
}

function intersectRects(left: RemoteMediaRect, right: RemoteMediaRect): RemoteMediaRect {
  const intersectionLeft = Math.max(left.left, right.left);
  const intersectionTop = Math.max(left.top, right.top);
  const intersectionRight = Math.min(left.left + left.width, right.left + right.width);
  const intersectionBottom = Math.min(left.top + left.height, right.top + right.height);
  return {
    left: intersectionLeft,
    top: intersectionTop,
    width: Math.max(0, intersectionRight - intersectionLeft),
    height: Math.max(0, intersectionBottom - intersectionTop),
  };
}

function containsPoint(rect: RemoteMediaRect, point: RemoteMediaPoint): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

function isValidRect(rect: RemoteMediaRect): boolean {
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    isPositiveFinite(rect.width) &&
    isPositiveFinite(rect.height)
  );
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}
