export function metricValue(metrics: Array<{ label: string; value: string }>, label: string): string {
  return metrics.find((metric) => metric.label === label)?.value ?? "";
}

export function rectFrom(input: { left: number; top: number; width: number; height: number }): DOMRect {
  return {
    ...input,
    x: input.left,
    y: input.top,
    right: input.left + input.width,
    bottom: input.top + input.height,
    toJSON: () => input,
  } as DOMRect;
}
