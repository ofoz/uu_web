import type { RemoteControlContext } from "../app/remoteControlTypes.js";
import { useRemoteControlController } from "../controllers/useRemoteControlController.js";
import { RemoteControlPage } from "./RemoteControlPage.js";
import { Toast } from "./Toast.js";

export function RemoteControlRoute({ context }: { context: RemoteControlContext }) {
  const controller = useRemoteControlController(context);

  return (
    <>
      <RemoteControlPage {...controller.page} />
      <Toast toast={controller.toast} onDismiss={controller.onDismissToast} placement="remote" />
    </>
  );
}
