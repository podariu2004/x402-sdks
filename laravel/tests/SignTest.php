<?php

declare(strict_types=1);

namespace X402\Laravel\Tests;

use PHPUnit\Framework\TestCase;
use X402\Laravel\Sign;

final class SignTest extends TestCase
{
    /** @var array<string,mixed> */
    private static array $vectors;

    public static function setUpBeforeClass(): void
    {
        self::$vectors = json_decode(
            (string) file_get_contents(
                dirname(__DIR__, 3) . '/docs/api/x402-conformance-vectors.json'
            ),
            true,
            512,
            JSON_THROW_ON_ERROR
        );
    }

    public function testSchemeIsFrozen(): void
    {
        $this->assertSame('X402v1', Sign::SCHEME);
    }

    public function testCanonicalIsTheFrozenLayout(): void
    {
        $c = Sign::canonical('post', '/api/v1/verify', 1700000000, 'nonce-1', '{"a":1}');
        $expected = "X402v1\nPOST\n/api/v1/verify\n1700000000\nnonce-1\n" . hash('sha256', '{"a":1}');
        $this->assertSame($expected, $c);
        $this->assertSame(self::$vectors['kat']['canonical'], $c);
    }

    public function testEmptyBodyHash(): void
    {
        $c = Sign::canonical('GET', '/api/v1/challenge', 1, 'n', '');
        $this->assertStringEndsWith("\n" . self::$vectors['body_hashes'][0]['sha256'], $c);
    }

    public function testKatSignatureMatchesFrozenVector(): void
    {
        $k = self::$vectors['kat'];
        $got = Sign::sign($k['secret'], $k['method'], $k['path'], $k['timestamp'], $k['nonce'], $k['body']);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $got);
        $this->assertSame($k['signature'], $got);
    }

    public function testUnicodeBodyHashesRawUtf8Bytes(): void
    {
        $body = '{"name":"こんにちは"}';
        $c = Sign::canonical('POST', '/api/v1/verify', 1700000000, 'n', $body);
        $this->assertStringEndsWith("\n" . hash('sha256', $body), $c);
    }

    public function testNonIntTimestampRejected(): void
    {
        $this->expectException(\TypeError::class);
        // @phpstan-ignore-next-line — intentionally wrong type under strict_types
        Sign::canonical('POST', '/p', '1700000000', 'n', '');
    }

    public function testSignedHeadersShape(): void
    {
        $h = Sign::signedHeaders('x402_test_abc', 'x402sk_test_x', 'POST', '/api/v1/challenge', '{"route":"/p"}');
        $this->assertSame('x402_test_abc', $h['X-X402-Key']);
        $this->assertMatchesRegularExpression('/^\d+$/', $h['X-X402-Timestamp']);
        $this->assertGreaterThanOrEqual(16, strlen($h['X-X402-Nonce']));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $h['X-X402-Signature']);
        $ts = (int) $h['X-X402-Timestamp'];
        $this->assertSame(
            Sign::sign('x402sk_test_x', 'POST', '/api/v1/challenge', $ts, $h['X-X402-Nonce'], '{"route":"/p"}'),
            $h['X-X402-Signature']
        );
    }

    public function testSignedHeadersNoncesUnique(): void
    {
        $a = Sign::signedHeaders('k', 's', 'POST', '/api/v1/challenge', '');
        $b = Sign::signedHeaders('k', 's', 'POST', '/api/v1/challenge', '');
        $this->assertNotSame($a['X-X402-Nonce'], $b['X-X402-Nonce']);
    }

    public function testSharedVectorsFullConformance(): void
    {
        foreach (self::$vectors['body_hashes'] as $v) {
            $this->assertSame($v['sha256'], hash('sha256', $v['body']));
        }
        $k = self::$vectors['kat'];
        $this->assertSame($k['canonical'], Sign::canonical($k['method'], $k['path'], $k['timestamp'], $k['nonce'], $k['body']));
        $this->assertSame($k['signature'], Sign::sign($k['secret'], $k['method'], $k['path'], $k['timestamp'], $k['nonce'], $k['body']));
    }
}
