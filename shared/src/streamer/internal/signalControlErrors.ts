export function mapStreamerControlResultProtocolError(code: number): string {
  switch (code) {
    case 0:
      return "protocol_error_0";
    case 100001:
      return "protocol_error_2021";
    case 100002:
      return "protocol_error_2022";
    case 900001:
      return "protocol_error_2004";
    case 900002:
      return "protocol_error_2023";
    case 900003:
      return "protocol_error_2024";
    default:
      return "protocol_error_2025";
  }
}
