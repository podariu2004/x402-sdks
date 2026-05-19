<?php

declare(strict_types=1);

namespace X402\Laravel\Tests;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PHPUnit\Framework\TestCase;
use X402\Laravel\Config;
use X402\Laravel\PlatformClient;
use X402\Laravel\X402Middleware;

final class E2ETest extends TestCase
{
    public function testFullTestModeFlowChallengeThen402ThenVerifyAllow(): void
    {
        $cfg = new Config('x402_test_k', 'x402sk_test_s', 'https://plat.test', 'sandbox');

        // Mock the platform: challenge issues a nonce; verify allows iff
        // that nonce is presented. Exercises Sign + PlatformClient + middleware.
        $transport = static function (string $m, string $u, array $h, string $b): array {
            $path = parse_url($u, PHP_URL_PATH);
            if ($path === '/api/v1/challenge') {
                return ['status' => 200, 'body' => [
                    'paymentRequired' => true, 'amount' => '0.10', 'currency' => 'USDC',
                    'network' => 'base', 'recipient' => '0xPLAT', 'resource' => '/premium',
                    'nonce' => 'chal-nonce-1', 'expiresAt' => '2030-01-01T00:00:00+00:00',
                ]];
            }
            if ($path === '/api/v1/verify') {
                $sent = json_decode($b, true);
                $ok = ($sent['nonce'] ?? null) === 'chal-nonce-1';

                return ['status' => $ok ? 200 : 402, 'body' => $ok
                    ? ['allowed' => true]
                    : ['allowed' => false, 'reason' => 'bad_nonce']];
            }

            return ['status' => 404, 'body' => ['error' => 'no_such_route']];
        };

        $client = new PlatformClient($cfg, $transport);
        $mw = new X402Middleware($cfg, $client);
        $handler = static fn () => new JsonResponse(['data' => 'paid content']);

        $first = $mw->handle(Request::create('/premium', 'GET'), $handler, '0.10');
        $this->assertSame(402, $first->getStatusCode());
        $challenge = $first->getData(true);
        $this->assertTrue($challenge['paymentRequired']);
        $this->assertSame('chal-nonce-1', $challenge['nonce']);

        $paid = $mw->handle(
            Request::create('/premium', 'GET', server: ['HTTP_X_PAYMENT_NONCE' => $challenge['nonce']]),
            $handler,
            '0.10'
        );
        $this->assertSame(200, $paid->getStatusCode());
        $this->assertSame(['data' => 'paid content'], $paid->getData(true));
    }
}
