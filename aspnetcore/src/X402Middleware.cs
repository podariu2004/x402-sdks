using System;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace X402.AspNetCore;

/// <summary>
/// ASP.NET Core middleware that gates a route behind an x402 payment. No
/// business / settlement logic lives here: it relays to the platform's signed
/// challenge/verify and FAILS CLOSED — if the platform is unreachable the
/// route returns HTTP 502 and never serves paid content. The downstream
/// pipeline runs ONLY when the platform explicitly allows the request.
///
/// <para>Wire it with <c>app.UseX402("/premium", "0.10")</c>.</para>
/// </summary>
public sealed class X402Middleware
{
    private readonly RequestDelegate _next;

    /// <summary>The gated route path. Empty ⇒ use the incoming request path.</summary>
    private readonly string _route;

    /// <summary>Telemetry hint only; the authoritative price is the platform route.</summary>
    private readonly string _price;

    private readonly PlatformClient _client;

    /// <summary>Resolves config from the environment and builds a real HTTP client.</summary>
    public X402Middleware(RequestDelegate next, string route, string price)
        : this(next, route, price, new PlatformClient(X402Config.Resolve(null)))
    {
    }

    /// <summary>Injectable client (tests / custom config).</summary>
    public X402Middleware(RequestDelegate next, string route, string price, PlatformClient client)
    {
        _next = next;
        _route = route ?? string.Empty;
        _price = price;
        _client = client;
    }

    public string Price => _price;

    public async Task InvokeAsync(HttpContext ctx)
    {
        var routeKey = _route.Length == 0 ? ctx.Request.Path.ToString() : _route;
        var method = ctx.Request.Method;

        var proofNonce = ctx.Request.Headers["X-Payment-Nonce"].ToString();

        if (string.IsNullOrEmpty(proofNonce))
        {
            var ch = _client.Challenge(routeKey, method);
            switch (ch.Status)
            {
                case 200:
                    await Relay(ctx, 402, ch.Body);
                    return;
                case 404:
                    await Relay(ctx, 404, "{\"error\":\"no_such_route\"}");
                    return;
                default:
                    await FailClosed(ctx);
                    return;
            }
        }

        var proof = ctx.Request.Headers["X-Payment"].ToString();
        var payer = ctx.Request.Headers["X-Payment-Payer"].ToString();

        var vr = _client.Verify(routeKey, method, proofNonce, payer, proof);

        if (vr.Status == 200 && vr.JsonBoolean("allowed"))
        {
            await _next(ctx);
            return;
        }
        if (vr.Status == 402)
        {
            await Relay(ctx, 402, vr.Body);
            return;
        }
        await FailClosed(ctx);
    }

    private static async Task Relay(HttpContext ctx, int status, string body)
    {
        ctx.Response.StatusCode = status;
        ctx.Response.ContentType = "application/json";
        var payload = string.IsNullOrEmpty(body) ? "{}" : body;
        await ctx.Response.Body.WriteAsync(Encoding.UTF8.GetBytes(payload));
    }

    private static Task FailClosed(HttpContext ctx)
        => Relay(ctx, 502, "{\"error\":\"x402_platform_unavailable\"}");
}
