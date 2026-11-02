export type RemoteShortcut =
  | "escape"
  | "windows-ctrl-alt-del"
  | "windows-alt-tab"
  | "windows-alt-f4"
  | "windows-win-d"
  | "windows-win-l"
  | "windows-task-manager"
  | "mac-cmd-tab"
  | "mac-spotlight"
  | "mac-force-quit"
  | "mac-cmd-q"
  | "mac-cmd-w"
  | "mac-hide-app";

type RemoteShortcutDefinition = {
  id: RemoteShortcut;
  label: string;
  keys: number[];
};

type RemoteShortcutGroup = {
  title: string;
  shortcuts: RemoteShortcutDefinition[];
};

type RemoteKeyboardSender = {
  sendKeyboardInput(input: { action: "keyboardPress" | "keyboardRelease"; value: string | number }): void;
};

const KEY = {
  altLeft: 57,
  controlLeft: 113,
  delete: 112,
  escape: 111,
  f4: 134,
  metaLeft: 117,
  q: 45,
  shiftLeft: 59,
  space: 62,
  tab: 61,
  w: 51,
  d: 32,
  h: 36,
  l: 40,
} as const;

const REMOTE_SHORTCUT_GROUPS: RemoteShortcutGroup[] = [
  {
    title: "Windows",
    shortcuts: [
      { id: "windows-ctrl-alt-del", label: "Ctrl Alt Del", keys: [KEY.controlLeft, KEY.altLeft, KEY.delete] },
      { id: "windows-alt-tab", label: "Alt Tab", keys: [KEY.altLeft, KEY.tab] },
      { id: "windows-alt-f4", label: "Alt F4", keys: [KEY.altLeft, KEY.f4] },
      { id: "windows-win-d", label: "Win D", keys: [KEY.metaLeft, KEY.d] },
      { id: "windows-win-l", label: "Win L", keys: [KEY.metaLeft, KEY.l] },
      { id: "windows-task-manager", label: "Ctrl Shift Esc", keys: [KEY.controlLeft, KEY.shiftLeft, KEY.escape] },
    ],
  },
  {
    title: "Mac",
    shortcuts: [
      { id: "mac-cmd-tab", label: "Cmd Tab", keys: [KEY.metaLeft, KEY.tab] },
      { id: "mac-spotlight", label: "Cmd Space", keys: [KEY.metaLeft, KEY.space] },
      { id: "mac-force-quit", label: "Cmd Opt Esc", keys: [KEY.metaLeft, KEY.altLeft, KEY.escape] },
      { id: "mac-cmd-q", label: "Cmd Q", keys: [KEY.metaLeft, KEY.q] },
      { id: "mac-cmd-w", label: "Cmd W", keys: [KEY.metaLeft, KEY.w] },
      { id: "mac-hide-app", label: "Cmd H", keys: [KEY.metaLeft, KEY.h] },
    ],
  },
  {
    title: "通用",
    shortcuts: [{ id: "escape", label: "Esc", keys: [KEY.escape] }],
  },
];

// 被控端平台 → 优先展示的快捷键分组标题；未知平台不调整顺序。
export function remoteShortcutGroupTitleForPlatform(platform: number | undefined): string {
  if (platform === 1) return "Windows";
  if (platform === 4) return "Mac";
  return "";
}

// 把与被控系统匹配的分组置顶，其余分组保持原相对顺序（“通用”始终在末尾）。
export function orderRemoteShortcutGroups(preferredTitle: string): RemoteShortcutGroup[] {
  if (!preferredTitle) return REMOTE_SHORTCUT_GROUPS;
  const preferred = REMOTE_SHORTCUT_GROUPS.filter((group) => group.title === preferredTitle);
  if (preferred.length === 0) return REMOTE_SHORTCUT_GROUPS;
  const rest = REMOTE_SHORTCUT_GROUPS.filter((group) => group.title !== preferredTitle);
  return [...preferred, ...rest];
}

const SHORTCUTS_BY_ID = new Map(
  REMOTE_SHORTCUT_GROUPS.flatMap((group) => group.shortcuts.map((shortcut) => [shortcut.id, shortcut] as const)),
);

export function sendRemoteShortcut(sender: RemoteKeyboardSender, shortcutId: RemoteShortcut): void {
  const shortcut = SHORTCUTS_BY_ID.get(shortcutId);
  if (!shortcut) return;

  const keys = shortcut.keys;
  const terminalKey = keys.at(-1);
  if (terminalKey === undefined) return;

  const modifiers = keys.slice(0, -1);
  for (const key of modifiers) {
    sender.sendKeyboardInput({ action: "keyboardPress", value: key });
  }
  sender.sendKeyboardInput({ action: "keyboardPress", value: terminalKey });
  sender.sendKeyboardInput({ action: "keyboardRelease", value: terminalKey });
  for (const key of [...modifiers].reverse()) {
    sender.sendKeyboardInput({ action: "keyboardRelease", value: key });
  }
}
