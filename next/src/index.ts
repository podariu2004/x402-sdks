export { withX402, x402EdgeGuard } from "./middleware.js";
export type { X402Options, RouteHandler } from "./middleware.js";
export { resolveConfig, DEFAULT_BASE_URL } from "./config.js";
export type { X402Config } from "./config.js";
export { sign, signedHeaders, canonical, SCHEME } from "./sign.js";
export { PlatformClient } from "./client.js";
export type {
  ChallengeBody,
  VerifyBody,
  ChallengeRequest,
  VerifyRequest,
  PlatformResponse,
} from "./types.js";
