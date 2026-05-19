<?php

declare(strict_types=1);

namespace X402\Laravel;

use Illuminate\Support\Facades\Http;
use X402\Laravel\Contracts\PlatformClientInterface;

/**
 * Relays signed challenge/verify to the platform. Fails closed: any
 * transport error/timeout → status 0 (the gate never hangs, never serves
 * paid content). The signed body string and the bytes POSTed are identical.
 */
final class PlatformClient implements PlatformClientInterface
{
    private const CHALLENGE_PATH = '/api/v1/challenge';
    private const VERIFY_PATH = '/api/v1/verify';
    private const TIMEOUT_S = 10;

    /** @var \Closure(string,string,array<string,string>,string):array{status:int,body:mixed} */
    private \Closure $transport;

    /**
     * @param (\Closure(string,string,array<string,string>,string):array{status:int,body:mixed})|null $transport
     */
    public function __construct(
        private readonly Config $cfg,
        ?\Closure $transport = null,
    ) {
        $this->transport = $transport ?? self::defaultTransport();
    }

    /** @param array<string,mixed> $req @return array{status:int,body:array<mixed>} */
    public function challenge(array $req): array
    {
        return $this->post(self::CHALLENGE_PATH, $req);
    }

    /** @param array<string,mixed> $req @return array{status:int,body:array<mixed>} */
    public function verify(array $req): array
    {
        return $this->post(self::VERIFY_PATH, $req);
    }

    /**
     * @param array<string,mixed> $payload
     * @return array{status:int,body:array<mixed>}
     */
    private function post(string $path, array $payload): array
    {
        // JSON_UNESCAPED_SLASHES|UNICODE → byte-identical to JS JSON.stringify
        // so the signed body and the wire body match across SDKs.
        $body = (string) json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $headers = ['Content-Type' => 'application/json']
            + Sign::signedHeaders($this->cfg->keyId, $this->cfg->secret, 'POST', $path, $body);

        try {
            $res = ($this->transport)('POST', $this->cfg->baseUrl . $path, $headers, $body);
            $status = (int) ($res['status'] ?? 0);
            $b = $res['body'] ?? [];
            if (! is_array($b)) {
                $b = [];
            }

            return ['status' => $status, 'body' => $b];
        } catch (\Throwable) {
            return ['status' => 0, 'body' => []]; // fail closed
        }
    }

    /** @return \Closure(string,string,array<string,string>,string):array{status:int,body:mixed} */
    private static function defaultTransport(): \Closure
    {
        return static function (string $method, string $url, array $headers, string $body): array {
            $resp = Http::withHeaders($headers)
                ->withBody($body, 'application/json')
                ->timeout(self::TIMEOUT_S)
                ->send($method, $url);

            return ['status' => $resp->status(), 'body' => $resp->json() ?? []];
        };
    }
}
