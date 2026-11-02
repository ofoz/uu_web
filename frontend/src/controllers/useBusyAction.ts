import { useCallback, useState } from "react";

import type { BusyAction } from "../app/remoteControlTypes.js";
import { toFriendlyControllerError } from "./controllerErrors.js";

type Action = Exclude<BusyAction, null>;

export function useBusyAction(initialAction: BusyAction = null) {
  const [busy, setBusy] = useState<BusyAction>(initialAction);
  const [error, setError] = useState("");

  const run = useCallback(async (action: Action, task: () => Promise<void>): Promise<boolean> => {
    setBusy(action);
    setError("");
    try {
      await task();
      return true;
    } catch (caught) {
      setError(toFriendlyControllerError(caught instanceof Error ? caught.message : String(caught)));
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  return { busy, error, run, setError };
}
