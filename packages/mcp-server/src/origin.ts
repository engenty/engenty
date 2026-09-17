import {
  originValidationResponse,
  validateOriginHeader,
} from "@modelcontextprotocol/server";

export function mcpOriginRejected(
  request: Request,
  allowedOriginHostnames: string[]
): Response | undefined {
  return originValidationResponse(request, allowedOriginHostnames);
}

export function isMcpOriginAllowed(
  originHeader: string | null | undefined,
  allowedOriginHostnames: string[]
): boolean {
  return validateOriginHeader(originHeader, allowedOriginHostnames).ok;
}
