<?php

declare(strict_types=1);

namespace X402\Laravel;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use X402\Laravel\Contracts\PlatformClientInterface;

/**
 * Route middleware: `->middleware('x402:0.10')`. No business/settlement
 * logic — relays to the platform's signed challenge/verify and fails
 * closed. $next runs ONLY when the platform explicitly allows the request.
 *
 * $price is a telemetry hint (the middleware parameter); the authoritative
 * price is the merchant route registered on the platform.
 */
final class X402Middleware
{
    public function __construct(
        private ?Config $cfg = null,
        private ?PlatformClientInterface $client = null,
    ) {
    }

    public function handle(Request $request, Closure $next, ?string $price = null): mixed
    {
        $cfg = $this->cfg ?? Config::resolve();
        $client = $this->client ?? new PlatformClient($cfg);

        $route = '/' . ltrim($request->path(), '/');
        $method = $request->method();
        $fail = static fn (): JsonResponse => new JsonResponse(['error' => 'x402_platform_unavailable'], 502);

        $proofNonce = $request->header('X-Payment-Nonce');
        if (! $proofNonce) {
            $ch = $client->challenge(['route' => $route, 'method' => $method]);
            if ($ch['status'] === 200) {
                return new JsonResponse($ch['body'], 402);
            }
            if ($ch['status'] === 404) {
                return new JsonResponse($ch['body'], 404);
            }

            return $fail();
        }

        $proof = null;
        $raw = $request->header('X-Payment');
        if ($raw !== null) {
            $decoded = json_decode($raw, true);
            $proof = json_last_error() === JSON_ERROR_NONE ? $decoded : $raw;
        }

        $vreq = ['route' => $route, 'method' => $method, 'nonce' => $proofNonce];
        $payer = $request->header('X-Payment-Payer');
        if ($payer !== null) {
            $vreq['payer'] = $payer;
        }
        if ($proof !== null) {
            $vreq['payment_proof'] = $proof;
        }

        $vr = $client->verify($vreq);
        if ($vr['status'] === 200 && ($vr['body']['allowed'] ?? null) === true) {
            return $next($request);
        }
        if ($vr['status'] === 402) {
            return new JsonResponse($vr['body'], 402);
        }

        return $fail();
    }
}
