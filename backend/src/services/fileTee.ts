import { createWriteStream, mkdirSync, rename, statSync, type WriteStream } from "node:fs";
import { dirname } from "node:path";

export function installFileTee(target: string, maxBytes: number): void {
  if (!target) return;

  try {
    mkdirSync(dirname(target), { recursive: true });
  } catch {
    return;
  }

  let bytesWritten = readInitialSize(target);
  let stream = openStream(target);
  let rotating = false;
  const queuedLines: string[] = [];

  const append = (kind: "stdout" | "stderr", chunk: unknown): void => {
    const text = toLogText(chunk);
    if (!text) return;
    const timestamp = new Date().toISOString();
    const line = `${timestamp} ${kind} ${text.endsWith("\n") ? text : `${text}\n`}`;
    if (rotating) {
      queuedLines.push(line);
      return;
    }
    if (bytesWritten + Buffer.byteLength(line) > maxBytes) {
      queuedLines.push(line);
      rotate();
      return;
    }
    stream.write(line);
    bytesWritten += Buffer.byteLength(line);
  };

  const rotate = (): void => {
    if (rotating) return;
    rotating = true;
    stream.end(() => {
      rename(target, `${target}.1`, () => {
        bytesWritten = 0;
        stream = openStream(target);
        rotating = false;
        for (const line of queuedLines.splice(0)) {
          stream.write(line);
          bytesWritten += Buffer.byteLength(line);
        }
      });
    });
  };

  const originalStdout = process.stdout.write.bind(process.stdout);
  const originalStderr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((data: unknown, ...rest: unknown[]) => {
    append("stdout", data);
    return (originalStdout as (data: unknown, ...args: unknown[]) => boolean)(data, ...rest);
  }) as typeof process.stdout.write;
  process.stderr.write = ((data: unknown, ...rest: unknown[]) => {
    append("stderr", data);
    return (originalStderr as (data: unknown, ...args: unknown[]) => boolean)(data, ...rest);
  }) as typeof process.stderr.write;
}

function openStream(target: string): WriteStream {
  const stream = createWriteStream(target, { flags: "a" });
  stream.on("error", () => {
    // Logging failures must not take down the server.
  });
  return stream;
}

function readInitialSize(target: string): number {
  try {
    return statSync(target).size;
  } catch {
    return 0;
  }
}

function toLogText(chunk: unknown): string {
  if (typeof chunk === "string") return chunk;
  if (Buffer.isBuffer(chunk)) return chunk.toString("utf8");
  if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString("utf8");
  return "";
}
