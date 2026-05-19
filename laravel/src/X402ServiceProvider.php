<?php

declare(strict_types=1);

namespace X402\Laravel;

use Illuminate\Routing\Router;
use Illuminate\Support\ServiceProvider;

/**
 * Auto-discovered (composer extra.laravel.providers). Registers the
 * `x402` route-middleware alias so consumers write
 * `Route::middleware('x402:0.10')->get(...)`.
 */
final class X402ServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        /** @var Router $router */
        $router = $this->app->make(Router::class);
        $router->aliasMiddleware('x402', X402Middleware::class);
    }
}
