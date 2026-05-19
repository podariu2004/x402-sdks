<?php

declare(strict_types=1);

namespace X402\Laravel\Tests;

use PHPUnit\Framework\TestCase;
use X402\Laravel\Config;
use X402\Laravel\PlatformClient;
use X402\Laravel\Sign;

final class PlatformClientTest extends TestCase
{
    private function cfg(): Config
    {
        return new Config('x402_test_k', 'x402sk_test_s', 'https://plat.test', 'sandbox');
    }

    public function testPostSignsExactBodyBytesAndPathWithUnescapedSlash(): void
    {
        $captured = [];
        $transport = function (string $m, string $u, array $h, string $b) use (&$captured): array {
            $captured = compact('m', 'u', 'h', 'b');

            return ['status' => 200, 'body' => ['paymentRequired' => true]];
        };

        $client = new PlatformClient($this->cfg(), $transport);
        $res = $client->challenge(['route' => '/premium', 'method' => 'GET']);

        $this->assertSame(200, $res['status']);
        $this->assertTrue($res['body']['paymentRequired']);
        $this->assertSame('https://plat.test/api/v1/challenge', $captured['u']);
        // JSON_UNESCAPED_SLASHES: slash NOT escaped — byte-matches JS JSON.stringify.
        $this->assertSame('{"route":"/premium","method":"GET"}', $captured['b']);
        $this->assertSame('application/json', $captured['h']['Content-Type']);
        $this->assertSame('x402_test_k', $captured['h']['X-X402-Key']);
        $ts = (int) $captured['h']['X-X402-Timestamp'];
        $this->assertSame(
            Sign::sign('x402sk_test_s', 'POST', '/api/v1/challenge', $ts, $captured['h']['X-X402-Nonce'], $captured['b']),
            $captured['h']['X-X402-Signature']
        );
    }

    public function testUnicodePayloadIsRawUtf8(): void
    {
        $captured = '';
        $transport = function (string $m, string $u, array $h, string $b) use (&$captured): array {
            $captured = $b;

            return ['status' => 200, 'body' => []];
        };
        (new PlatformClient($this->cfg(), $transport))->verify(['route' => '/п', 'method' => 'GET', 'nonce' => 'n']);
        // JSON_UNESCAPED_UNICODE: raw UTF-8, not \u-escaped.
        $this->assertStringContainsString("\u{043F}", $captured);
    }

    public function testTransportExceptionIsStatusZeroFailClosed(): void
    {
        $transport = function (): array {
            throw new \RuntimeException('boom');
        };
        $res = (new PlatformClient($this->cfg(), $transport))->verify(['route' => '/p', 'method' => 'GET', 'nonce' => 'n']);
        $this->assertSame(0, $res['status']);
        $this->assertSame([], $res['body']);
    }

    public function testNonArrayBodyBecomesEmptyArray(): void
    {
        $transport = fn (): array => ['status' => 500, 'body' => 'upstream exploded'];
        $res = (new PlatformClient($this->cfg(), $transport))->challenge(['route' => '/p', 'method' => 'GET']);
        $this->assertSame(500, $res['status']);
        $this->assertSame([], $res['body']);
    }
}
