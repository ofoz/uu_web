export const STREAMER_CLIPBOARD_RPC_WIRE_FIELDS = {
  envelope: { sequenceTag: 1, timestampMsTag: 2, rpcRequestTag: 21, rpcResponseTag: 22 },
  request: { headerTag: 1, textChangeRequestTag: 10 },
  response: { headerTag: 1, textChangeResponseTag: 6 },
  header: { requestIdTag: 1 },
  textChangeRequest: { formatIdTag: 1, textTag: 2 },
  textChangeResponse: { resultTag: 1 },
} as const;

export const STREAMER_CLIPBOARD_V4_RPC_WIRE_FIELDS = {
  request: { clipRequestTag: 9 },
  response: { clipResponseTag: 5 },
  clipRequest: { formatDataAskTag: 2, dataBlockTag: 3 },
  clipResponse: { formatDataConfirmTag: 2, dataBlockConfirmTag: 3 },
  formatDataAsk: { formatIdTag: 1, blockKeyTag: 2, formatNameTag: 3 },
  formatDataConfirm: { resultTag: 1, blockKeyTag: 2, blockCountTag: 3 },
  dataBlock: { blockKeyTag: 1, blockIdTag: 2, dataTag: 3 },
  dataBlockConfirm: { blockKeyTag: 1, blockIdTag: 2, resultTag: 3 },
} as const;
