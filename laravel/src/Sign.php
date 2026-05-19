<?php

declare(strict_types=1);

namespace X402\Laravel;

/**
 * X402v1 signing — pure PHP, byte-identical to the platform's
 * X402ApiKey::sign oracle and the frozen contract (docs/api/x402-contract.md):
 *
 *   canonical = "X402v1" LF METHOD LF path LF timestamp LF nonce LF sha256hex(body)
 *   signature = hash_hmac('sha256', canonical, secret)  // lowercase hex, 64 chars
 *
 * declare(strict_types=1) makes a non-int $timestamp a TypeError — satisfies
 * the contract's "reject non-integer timestamp" rule.
 */
final class Sign
{
    /** MUST match the platform's X402ApiKey::SCHEME. */
    public const SCHEME = 'X402v1';

    public static function canonical(
        string $method,
        string $path,
        int $timestamp,
        string $nonce,
        string $body
    ): string {
        return self::SCHEME . "\n"
            . strtoupper($method) . "\n"
            . $path . "\n"
            . $timestamp . "\n"
            . $nonce . "\n"
            . hash('sha256', $body); // body hashed as raw bytes — matches Node/Python/Go
    }

    public static function sign(
        string $secret,
        string $method,
        string $path,
        int $timestamp,
        string $nonce,
        string $body
    ): string {
        return hash_hmac('sha256', self::canonical($method, $path, $timestamp, $nonce, $body), $secret);
    }

    /** @return array<string,string> */
    public static function signedHeaders(
        string $keyId,
        string $secret,
        string $method,
        string $path,
        string $body
    ): array {
        $timestamp = time();
        $nonce = self::uuid4();

        return [
            'X-X402-Key' => $keyId,
            'X-X402-Timestamp' => (string) $timestamp,
            'X-X402-Nonce' => $nonce,
            'X-X402-Signature' => self::sign($secret, $method, $path, $timestamp, $nonce, $body),
        ];
    }

    /** RFC 4122 v4 UUID, no extra dependency. */
    private static function uuid4(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
