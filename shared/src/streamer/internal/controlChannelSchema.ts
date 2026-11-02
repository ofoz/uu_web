export const STREAMER_SEND_TO_ROM_WIRE_FIELDS = {
  envelopeTag: 11,
  inputTypeTag: 1,
  inputMessageTag: 2,
  displayIdTag: 3,
} as const;

export const STREAMER_ROM_MESSAGE_WIRE_FIELDS = {
  envelopeTag: 10,
  nameTag: 1,
  valueTag: 2,
  displayIdTag: 3,
  byteValueTag: 4,
} as const;

export const STREAMER_SIMPLE_ACTION_WIRE_FIELDS = {
  envelopeTag: 3,
  actionTag: 1,
  argsTag: 2,
  featureFlagTag: 4,
} as const;

export const STREAMER_SYSTEM_STATE_CHANGE_WIRE_FIELDS = { envelopeTag: 15, cursorShapeTag: 2 } as const;

export const STREAMER_CURSOR_SHAPE_WIRE_FIELDS = {
  posXTag: 1,
  posYTag: 2,
  widthTag: 3,
  heightTag: 4,
  byteValueTag: 5,
  cursorTypeTag: 6,
  coordinateXScaleTag: 7,
  coordinateYScaleTag: 8,
  screenIdTag: 9,
} as const;

export const STREAMER_ROM_MESSAGE_TYPES = {
  RomMsg_VINPUT: 0,
  RomMsg_Text: 1,
  RomMsg_Snapshot: 2,
  RomMsg_TabManage: 3,
  RomMsg_Rotation: 4,
  RomMsg_Volume: 5,
} as const;

export const STREAMER_CAPTURE_CHANGE_TYPES = {
  CT_DESKTOP: 0,
  CT_WINDOW: 1,
  CT_MUMU: 2,
  CT_HOOK: 3,
  CT_NONE: 99,
} as const;

export const STREAMER_SIMPLE_ACTION_FEATURE_FLAG_FIELDS = [
  { tag: 1, name: "useClipboard" },
  { tag: 2, name: "autoClipboard" },
  { tag: 3, name: "enableKeyMouse" },
  { tag: 4, name: "enableGamepad" },
  { tag: 6, name: "enableTouch" },
  { tag: 7, name: "enableIme" },
  { tag: 8, name: "enableDisplayControl" },
] as const;

export type StreamerSimpleActionFeatureFlagName = (typeof STREAMER_SIMPLE_ACTION_FEATURE_FLAG_FIELDS)[number]["name"];
export type StreamerSimpleActionFeatureFlags = Partial<Record<StreamerSimpleActionFeatureFlagName, number>>;

export const STREAMER_DEFAULT_SIMPLE_ACTION_FEATURE_FLAGS = {
  useClipboard: 2,
  autoClipboard: 1,
  enableKeyMouse: 2,
  enableGamepad: 2,
  enableTouch: 2,
  enableIme: 2,
  enableDisplayControl: 3,
} as const satisfies StreamerSimpleActionFeatureFlags;
