import { describe, expect, it } from "vitest";
import { flattenDeviceGroups, pickControllableDesktop } from "../src/devices/deviceSummary.js";

describe("device summaries", () => {
  it("flattens UU device group responses into typed sections", () => {
    const result = flattenDeviceGroups({
      data: {
        desktop_devices: [
          {
            device_id: "pc-1",
            alias: "Studio PC",
            controllable: "true",
            platform: 3,
            status: "CONNECTED",
            version_name: "4.19.1",
            app_flag: { control_mode: null },
            participants_info: [
              {
                client_id: "client-1",
                device_id: "phone-1",
                alias: "Phone",
                platform: 2,
                user_join_type: 1,
                controlled_time: 180,
                app_flag: { control_mode: "second_screen" },
              },
            ],
          },
        ],
        mobile_devices: [{ device_id: "phone-1", alias: "Phone" }],
        tv_devices: [],
      },
    });

    expect(result.desktopDevices[0]).toMatchObject({
      deviceId: "pc-1",
      alias: "Studio PC",
      controllable: true,
      platform: 3,
      status: "CONNECTED",
      versionName: "4.19.1",
      appFlag: { control_mode: null },
      participantsInfo: [
        {
          clientId: "client-1",
          deviceId: "phone-1",
          alias: "Phone",
          platform: 2,
          joinType: 1,
          controlledSeconds: 180,
          appFlag: { control_mode: "second_screen" },
        },
      ],
      raw: expect.any(Object),
    });
    expect(result.mobileDevices).toHaveLength(1);
    expect(result.tvDevices).toHaveLength(0);
  });

  it("picks the first controllable desktop target", () => {
    const target = pickControllableDesktop([
      { deviceId: "pc-1", alias: "Offline", controllable: false, raw: {} },
      { deviceId: "pc-2", alias: "Ready", controllable: true, raw: {} },
    ]);

    expect(target?.deviceId).toBe("pc-2");
  });
});
