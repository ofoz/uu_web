export interface BackendConfig {
  host: string;
  port: number;
  enableDiagnostics: boolean;
  enableWisp: boolean;
}

export interface BackendConfigOverrides {
  host?: string;
  port?: number;
  enableDiagnostics?: boolean;
  enableWisp?: boolean;
}

export function createConfig(overrides: BackendConfigOverrides = {}): BackendConfig {
  return {
    host: overrides.host ?? process.env.HOST ?? "0.0.0.0",
    port: overrides.port ?? Number.parseInt(process.env.PORT ?? "8787", 10),
    enableDiagnostics: overrides.enableDiagnostics ?? process.env.ENABLE_DIAGNOSTICS !== "false",
    enableWisp: overrides.enableWisp ?? process.env.ENABLE_WISP === "true",
  };
}
