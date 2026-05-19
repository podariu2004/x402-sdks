export interface ChallengeRequest {
  route: string;
  method?: string;
}
export interface ChallengeBody {
  paymentRequired: boolean;
  amount: string;
  currency: string;
  network: string;
  recipient: string;
  resource: string;
  nonce: string;
  expiresAt: string;
}
export interface VerifyRequest {
  route: string;
  method?: string;
  nonce: string;
  payer?: string;
  payment_proof?: unknown;
}
export interface VerifyBody {
  allowed: boolean;
  reason?: string;
}
/** status 0 = transport failure (no HTTP response). */
export interface PlatformResponse<T> {
  status: number;
  body: T;
}
