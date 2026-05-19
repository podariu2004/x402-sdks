<?php

declare(strict_types=1);

namespace X402\Laravel\Contracts;

interface PlatformClientInterface
{
    /**
     * @param array<string,mixed> $req
     * @return array{status:int, body:array<mixed>}
     */
    public function challenge(array $req): array;

    /**
     * @param array<string,mixed> $req
     * @return array{status:int, body:array<mixed>}
     */
    public function verify(array $req): array;
}
