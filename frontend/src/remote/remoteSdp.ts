const OPUS_RECEIVER_PARAMETERS = [
  ["minptime", "10"],
  ["stereo", "1"],
  ["useinbandfec", "1"],
  ["maxplaybackrate", "48000"],
  ["maxaveragebitrate", "128000"],
] as const;

const OPUS_RECEIVER_PARAMETER_NAMES = new Set<string>(OPUS_RECEIVER_PARAMETERS.map(([name]) => name));

export function applyOpusReceiverPreferencesToSdp(sdp: string | undefined): string | undefined {
  if (!sdp) return sdp;

  const lineSeparator = sdp.match(/\r\n|\n|\r/)?.[0] ?? "\r\n";
  const lines = sdp.split(/\r\n|\n|\r/);
  const output: string[] = [];
  let sectionStart = 0;

  for (let index = 0; index <= lines.length; index += 1) {
    if (index < lines.length && !lines[index].startsWith("m=")) continue;
    output.push(...applyOpusReceiverPreferencesToMediaSection(lines.slice(sectionStart, index)));
    sectionStart = index;
  }

  return output.join(lineSeparator);
}

function applyOpusReceiverPreferencesToMediaSection(section: string[]): string[] {
  if (!section[0]?.match(/^m=audio(?:\s|$)/i)) return section;

  const offeredPayloadTypes = new Set(section[0].trim().split(/\s+/).slice(3));
  const opusPayloadTypes: string[] = [];

  for (const line of section) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000\/2\s*$/i);
    if (match && offeredPayloadTypes.has(match[1])) opusPayloadTypes.push(match[1]);
  }

  if (opusPayloadTypes.length === 0) return section;

  const output = [...section];
  for (const payloadType of opusPayloadTypes) {
    const fmtpPattern = new RegExp(`^a=fmtp:${payloadType}(?:\\s+(.*))?$`, "i");
    const fmtpIndex = output.findIndex((line) => fmtpPattern.test(line));
    if (fmtpIndex >= 0) {
      const parameters = output[fmtpIndex].match(fmtpPattern)?.[1] ?? "";
      output[fmtpIndex] = `a=fmtp:${payloadType} ${mergeOpusReceiverParameters(parameters)}`;
      continue;
    }

    const rtpmapIndex = output.findIndex((line) =>
      new RegExp(`^a=rtpmap:${payloadType}\\s+opus\\/48000\\/2\\s*$`, "i").test(line),
    );
    output.splice(rtpmapIndex + 1, 0, `a=fmtp:${payloadType} ${mergeOpusReceiverParameters("")}`);
  }

  return output;
}

function mergeOpusReceiverParameters(parameters: string): string {
  const preservedParameters = parameters
    .split(";")
    .map((parameter) => parameter.trim())
    .filter((parameter) => {
      if (!parameter) return false;
      const separatorIndex = parameter.indexOf("=");
      const name = (separatorIndex >= 0 ? parameter.slice(0, separatorIndex) : parameter).trim().toLowerCase();
      return !OPUS_RECEIVER_PARAMETER_NAMES.has(name);
    });

  return [...OPUS_RECEIVER_PARAMETERS.map(([name, value]) => `${name}=${value}`), ...preservedParameters].join(";");
}
