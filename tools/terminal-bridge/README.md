# Restaurant OS Universal Terminal Bridge

Restaurant OS exposes one stable local payment API (`POST /v1/pay`). The bridge converts that request to the protocol used by the card terminal/PSP. Card/PIN/EMV data never needs to enter Restaurant OS.

## Why a bridge/driver layer is required

Card terminals do not share one universal physical protocol. PSPs expose different ECR protocols, local HTTP services, TCP sockets, serial/USB SDKs and certified executables. Commercial POS products appear to “support every device” because the POS calls one internal interface and ships/adopts a driver for each PSP family. This bridge implements the same architecture.

## Built-in drivers

- `http-json`: local/cloud PSP HTTP API.
- `tcp-json`: LAN ECR endpoint that exchanges JSON.
- `tcp-text`: configurable text ECR protocol with templates + regex response mapping.
- `command`: invokes the official PSP/vendor SDK wrapper/executable. This is also the compatibility path for USB/Serial/COM devices.
- `mock`: end-to-end testing.

Copy `bridge.config.example.json` to `bridge.config.json`, then map either `terminal:<id>` or `provider:<provider>` to a profile. One bridge can therefore handle multiple terminal types.

## API

Restaurant OS sends:

```json
{
  "intentId": "server-generated-id",
  "amount": 185000,
  "currency": "IRR",
  "orderId": "order-id",
  "orderNumber": "B-1042",
  "terminalId": "configured-terminal-id",
  "provider": "psp-or-driver-key"
}
```

The bridge always normalizes the terminal response to:

```json
{
  "success": true,
  "trace": "123456",
  "rrn": "987654321012",
  "authCode": "optional",
  "message": "Approved"
}
```

## USB / Serial / COM terminals

Use the `command` driver with the PSP's official ECR SDK/EXE or a small vendor-specific adapter. This is intentional: raw USB/serial frame formats, baud rates, checksums, key management and certification are vendor-specific. Restaurant OS itself remains unchanged when a new device is added; only its bridge profile/driver is installed.

## Production safety

Bind the bridge to `127.0.0.1` unless the PSP explicitly requires LAN access. Use a long `BRIDGE_KEY`, restrict `BRIDGE_ALLOWED_ORIGINS`, use a trusted local TLS certificate for an HTTPS web app, and never collect PAN/PIN in the web application.
