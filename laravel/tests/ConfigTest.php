<?php

declare(strict_types=1);

namespace X402\Laravel\Tests;

use PHPUnit\Framework\TestCase;
use X402\Laravel\Config;

final class ConfigTest extends TestCase
{
    public function testResolvesFromInjectedEnvMap(): void
    {
        $c = Config::resolve(['X402_API_KEY' => 'x402_test_k', 'X402_SECRET' => 'x402sk_test_s']);
        $this->assertSame('x402_test_k', $c->keyId);
        $this->assertSame('x402sk_test_s', $c->secret);
        $this->assertSame(Config::DEFAULT_BASE_URL, $c->baseUrl);
        $this->assertSame('production', $c->env);
    }

    public function testSandboxAndTrailingSlashStripped(): void
    {
        $c = Config::resolve([
            'X402_API_KEY' => 'k',
            'X402_SECRET' => 's',
            'X402_ENV' => 'SANDBOX',
            'X402_BASE_URL' => 'https://staging.example.com///',
        ]);
        $this->assertSame('sandbox', $c->env);
        $this->assertSame('https://staging.example.com', $c->baseUrl);
    }

    /**
     * @dataProvider missingProvider
     * @param array<string,string> $env
     */
    public function testMissingCredentialsThrow(array $env): void
    {
        $this->expectException(\RuntimeException::class);
        Config::resolve($env);
    }

    /** @return array<string,array{array<string,string>}> */
    public static function missingProvider(): array
    {
        return [
            'both' => [[]],
            'key only' => [['X402_API_KEY' => 'k']],
            'secret only' => [['X402_SECRET' => 's']],
        ];
    }
}
