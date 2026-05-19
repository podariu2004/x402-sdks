<?php

declare(strict_types=1);

namespace X402\Laravel;

/** Env resolution — same vars as the Express/FastAPI/Next references. */
final class Config
{
    // TODO: replace with the production platform domain before GA (kept
    // identical to the other SDK references so all default alike).
    public const DEFAULT_BASE_URL = 'https://api.x402.dev';

    public function __construct(
        public readonly string $keyId,
        public readonly string $secret,
        public readonly string $baseUrl,
        public readonly string $env,
    ) {
    }

    /**
     * @param array<string,string|null>|null $env Injected map for tests;
     *        null → read process env (getenv).
     */
    public static function resolve(?array $env = null): self
    {
        $get = static fn (string $k): ?string => $env !== null
            ? ($env[$k] ?? null)
            : (getenv($k) ?: null);

        $keyId = $get('X402_API_KEY');
        $secret = $get('X402_SECRET');
        if (! $keyId || ! $secret) {
            throw new \RuntimeException(
                'x402: X402_API_KEY and X402_SECRET must be set (server-side env).'
            );
        }

        $mode = strtolower($get('X402_ENV') ?: 'production');

        return new self(
            $keyId,
            $secret,
            rtrim($get('X402_BASE_URL') ?: self::DEFAULT_BASE_URL, '/'),
            $mode === 'sandbox' ? 'sandbox' : 'production',
        );
    }
}
