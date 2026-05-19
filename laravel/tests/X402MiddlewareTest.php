<?php

declare(strict_types=1);

namespace X402\Laravel\Tests;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PHPUnit\Framework\TestCase;
use X402\Laravel\Config;
use X402\Laravel\Contracts\PlatformClientInterface;
use X402\Laravel\X402Middleware;

final class FakeClient implements PlatformClientInterface
{
    /** @var array<int,array{0:string,1:array<mixed>}> */
    public array $calls = [];

    /** @param array{status:int,body:array<mixed>}|null $ch
     *  @param array{status:int,body:array<mixed>}|null $vr */
    public function __construct(private ?array $ch = null, private ?array $vr = null)
    {
    }

    public function challenge(array $req): array
    {
        $this->calls[] = ['challenge', $req];

        return $this->ch ?? ['status' => 0, 'body' => []];
    }

    public function verify(array $req): array
    {
        $this->calls[] = ['verify', $req];

        return $this->vr ?? ['status' => 0, 'body' => []];
    }
}

final class X402MiddlewareTest extends TestCase
{
    private function cfg(): Config
    {
        return new Config('k', 's', 'https://plat.test', 'sandbox');
    }

    /** @param array<string,string> $headers */
    private function req(string $uri = '/premium', array $headers = []): Request
    {
        $server = [];
        foreach ($headers as $k => $v) {
            $server['HTTP_' . strtoupper(str_replace('-', '_', $k))] = $v;
        }

        return Request::create($uri, 'GET', server: $server);
    }

    private function mw(FakeClient $c): X402Middleware
    {
        return new X402Middleware($this->cfg(), $c);
    }

    public function testNoProofReturns402WithChallengeBody(): void
    {
        $c = new FakeClient(ch: ['status' => 200, 'body' => ['paymentRequired' => true, 'amount' => '0.10']]);
        $res = $this->mw($c)->handle($this->req(), fn () => new JsonResponse(['x' => 1]), '0.10');
        $this->assertInstanceOf(JsonResponse::class, $res);
        $this->assertSame(402, $res->getStatusCode());
        $this->assertSame(['paymentRequired' => true, 'amount' => '0.10'], $res->getData(true));
        $this->assertSame(['challenge', ['route' => '/premium', 'method' => 'GET']], $c->calls[0]);
    }

    public function testUnknownRouteReturns404(): void
    {
        $c = new FakeClient(ch: ['status' => 404, 'body' => ['error' => 'no_such_route']]);
        $res = $this->mw($c)->handle($this->req(), fn () => new JsonResponse(['x' => 1]));
        $this->assertSame(404, $res->getStatusCode());
        $this->assertSame(['error' => 'no_such_route'], $res->getData(true));
    }

    public function testPlatformUnreachableFailsClosed502(): void
    {
        $c = new FakeClient(ch: ['status' => 0, 'body' => []]);
        $res = $this->mw($c)->handle($this->req(), fn () => new JsonResponse(['x' => 1]));
        $this->assertSame(502, $res->getStatusCode());
        $this->assertSame(['error' => 'x402_platform_unavailable'], $res->getData(true));
    }

    public function testProofPresentAndAllowedRunsNext(): void
    {
        $c = new FakeClient(vr: ['status' => 200, 'body' => ['allowed' => true]]);
        $req = $this->req('/premium', [
            'X-Payment-Nonce' => 'n1',
            'X-Payment-Payer' => '0xabc',
            'X-Payment' => '{"tx":"0x1"}',
        ]);
        $res = $this->mw($c)->handle($req, fn () => new JsonResponse(['data' => 'paid content']));
        $this->assertSame(200, $res->getStatusCode());
        $this->assertSame(['data' => 'paid content'], $res->getData(true));
        $this->assertSame([
            'verify',
            ['route' => '/premium', 'method' => 'GET', 'nonce' => 'n1', 'payer' => '0xabc', 'payment_proof' => ['tx' => '0x1']],
        ], $c->calls[0]);
    }

    public function testProofPresentButDeniedReturns402(): void
    {
        $c = new FakeClient(vr: ['status' => 402, 'body' => ['allowed' => false, 'reason' => 'unpaid']]);
        $res = $this->mw($c)->handle($this->req('/premium', ['X-Payment-Nonce' => 'n1']), fn () => new JsonResponse(['x' => 1]));
        $this->assertSame(402, $res->getStatusCode());
        $this->assertSame(['allowed' => false, 'reason' => 'unpaid'], $res->getData(true));
    }

    public function testNonJsonXPaymentForwardedRaw(): void
    {
        $c = new FakeClient(vr: ['status' => 200, 'body' => ['allowed' => true]]);
        $this->mw($c)->handle(
            $this->req('/premium', ['X-Payment-Nonce' => 'n1', 'X-Payment' => 'not-json']),
            fn () => new JsonResponse(['x' => 1])
        );
        $this->assertSame('not-json', $c->calls[0][1]['payment_proof']);
    }

    public function testVerify5xxFailsClosed502(): void
    {
        $c = new FakeClient(vr: ['status' => 500, 'body' => ['allowed' => false, 'reason' => 'server_error']]);
        $res = $this->mw($c)->handle($this->req('/premium', ['X-Payment-Nonce' => 'n1']), fn () => new JsonResponse(['x' => 1]));
        $this->assertSame(502, $res->getStatusCode());
    }

    public function testAllowedMustBeStrictlyTrue(): void
    {
        $c = new FakeClient(vr: ['status' => 200, 'body' => ['allowed' => 'true']]);
        $res = $this->mw($c)->handle($this->req('/premium', ['X-Payment-Nonce' => 'n1']), fn () => new JsonResponse(['x' => 1]));
        $this->assertSame(502, $res->getStatusCode());
    }
}
