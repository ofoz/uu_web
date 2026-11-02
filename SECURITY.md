# Security Policy

[中文](SECURITY.zh-CN.md)

## Supported versions

Security fixes target the current `main` branch and the latest published release. Older commits and images may not receive backports.

## Reporting a vulnerability

Send vulnerabilities and possible credential exposure to `iola1999@foxmail.com`. Keep security details out of public issues.

Useful reports include:

- affected commit, image tag, or deployment date
- deployment mode, such as Cloudflare Worker, Docker, or the public instance
- reproducible steps and expected impact
- redacted browser console, Worker, or Node logs

Do not include real SMS codes, exported login-state JSON, UU tokens, room tokens, complete device IDs, private addresses, or unredacted request and response bodies.

## Trust model

UU Remote Web stores login state in browser `localStorage` and sends authenticated UU API requests through the active deployment. The deployment operator can technically observe requests passing through that instance. Log in, enter SMS codes, and import credentials only on deployments you control or fully trust.

Each browser tab creates a random session capability that isolates signal state in the Node process or Cloudflare Durable Object. Access to the deployment still needs its own authentication. Put public self-hosted instances behind Cloudflare Access, an authenticated reverse proxy, or another access gateway.

The browser negotiates remote media and data channels with the controlled device through WebRTC. Automatic routing can use LAN or P2P connectivity and fall back to UU relay when required. The Cloudflare Worker serves the application, forwards UU API traffic, and runs the signal gateway. It does not carry WebRTC media or disable direct connectivity.

## Public instance

A public instance is available at [https://uurc.678234.xyz](https://uurc.678234.xyz) for quickly reviewing the interface and basic flow. Self-hosting is recommended for regular use, especially when login state will be stored for a long time or remote control is used frequently.

Confirm that you trust the operator before using any shared instance. Logging out clears the login state stored by this application in the current browser. Server logs, network proxies, and the deployment environment remain under the operator's control.

## Known security boundaries

- The UU API proxy allows only project-defined upstream paths, while valid requests still carry the account data required by UU.
- Random session capabilities isolate signal state between browser tabs. They do not authenticate users.
- Remote diagnostics may contain device IDs, network candidate addresses, room state, and upstream errors. Redact them before sharing.
- Wisp is disabled by default. When enabled, host, port, loopback, and private-network restrictions still apply.
