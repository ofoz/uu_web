import { STREAMER_SIMPLE_ACTION_TYPES } from "./controlChannelProtocol.js";
import {
  STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS,
  STREAMER_ROM_MESSAGE_TYPES,
  STREAMER_SEND_TO_ROM_WIRE_FIELDS,
  STREAMER_SIMPLE_ACTION_FEATURE_FLAG_FIELDS,
  STREAMER_SIMPLE_ACTION_WIRE_FIELDS,
  type StreamerSimpleActionFeatureFlags,
} from "./internal/controlChannelSchema.js";
import { pushInt32Field, pushMessageField, pushStringField, pushVarintField } from "./internal/protobufWire.js";

interface BaseControlMessageInput {
  sequence: number | bigint;
  timestampMs: number | bigint;
}

interface StreamerInputMessage extends BaseControlMessageInput {
  inputMessage: string;
  displayId?: number;
}

interface EchoRequestInput extends BaseControlMessageInput {
  featureFlags?: StreamerSimpleActionFeatureFlags | null;
}

interface EchoResponseInput extends EchoRequestInput {
  responseSequence: number | bigint;
}

export function encodeStreamerInputMessage(input: StreamerInputMessage): Uint8Array {
  return encodeStreamerRomMessage(input, STREAMER_ROM_MESSAGE_TYPES.RomMsg_VINPUT);
}

export function encodeStreamerTextMessage(input: StreamerInputMessage): Uint8Array {
  return encodeStreamerRomMessage(input, STREAMER_ROM_MESSAGE_TYPES.RomMsg_Text);
}

export function encodeStreamerEchoRequestMessage(input: EchoRequestInput): Uint8Array {
  return encodeSimpleAction({
    ...input,
    actionType: STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST,
    args: `{"seq":${formatJsonNumber(input.sequence)}}`,
  });
}

export function encodeStreamerEchoResponseMessage(input: EchoResponseInput): Uint8Array {
  return encodeSimpleAction({
    ...input,
    actionType: STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_RESPONSE,
    args: `{"seq":${formatJsonNumber(input.responseSequence)}}`,
  });
}

function encodeStreamerRomMessage(input: StreamerInputMessage, inputType: number): Uint8Array {
  const body: number[] = [];
  if (inputType !== STREAMER_ROM_MESSAGE_TYPES.RomMsg_VINPUT) {
    pushVarintField(body, STREAMER_SEND_TO_ROM_WIRE_FIELDS.inputTypeTag, inputType);
  }
  if (input.inputMessage !== "")
    pushStringField(body, STREAMER_SEND_TO_ROM_WIRE_FIELDS.inputMessageTag, input.inputMessage);
  if (input.displayId) pushVarintField(body, STREAMER_SEND_TO_ROM_WIRE_FIELDS.displayIdTag, input.displayId);
  return encodeEnvelope(input, STREAMER_SEND_TO_ROM_WIRE_FIELDS.envelopeTag, new Uint8Array(body));
}

function encodeSimpleAction(input: EchoRequestInput & { actionType: number; args: string }): Uint8Array {
  const body: number[] = [];
  if (input.actionType !== STREAMER_SIMPLE_ACTION_TYPES.ACTION_TYPE_ECHO_REQUEST) {
    pushVarintField(body, STREAMER_SIMPLE_ACTION_WIRE_FIELDS.actionTag, input.actionType);
  }
  pushStringField(body, STREAMER_SIMPLE_ACTION_WIRE_FIELDS.argsTag, input.args);
  pushMessageField(
    body,
    STREAMER_SIMPLE_ACTION_WIRE_FIELDS.featureFlagTag,
    encodeFeatureFlags(input.featureFlags ?? STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS),
  );
  return encodeEnvelope(input, STREAMER_SIMPLE_ACTION_WIRE_FIELDS.envelopeTag, new Uint8Array(body));
}

function encodeEnvelope(input: BaseControlMessageInput, tag: number, body: Uint8Array): Uint8Array {
  const envelope: number[] = [];
  pushVarintField(envelope, 1, input.sequence);
  pushVarintField(envelope, 2, input.timestampMs);
  pushMessageField(envelope, tag, body);
  return new Uint8Array(envelope);
}

function encodeFeatureFlags(input: StreamerSimpleActionFeatureFlags): Uint8Array {
  const bytes: number[] = [];
  for (const field of STREAMER_SIMPLE_ACTION_FEATURE_FLAG_FIELDS) {
    const value = input[field.name] ?? 0;
    if (value) pushInt32Field(bytes, field.tag, value);
  }
  return new Uint8Array(bytes);
}

function formatJsonNumber(value: number | bigint): string {
  return BigInt(value).toString();
}
