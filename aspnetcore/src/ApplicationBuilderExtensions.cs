using Microsoft.AspNetCore.Builder;

namespace X402.AspNetCore;

/// <summary>
/// Registration helper so a route can be gated with one line in
/// <c>Program.cs</c>.
/// </summary>
public static class ApplicationBuilderExtensions
{
    /// <summary>
    /// Gates <paramref name="route"/> behind an x402 payment. <paramref name="price"/>
    /// is a telemetry hint; the authoritative price is the route registered on
    /// the platform.
    ///
    /// <code>
    /// app.UseX402("/premium", "0.10");
    /// </code>
    /// </summary>
    public static IApplicationBuilder UseX402(
        this IApplicationBuilder app, string route, string price)
        => app.UseMiddleware<X402Middleware>(route, price);
}
