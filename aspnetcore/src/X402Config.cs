using System;

namespace X402.AspNetCore;

/// <summary>
/// Resolved server-side configuration.
///
/// <para>Kept identical in spirit to the other SDK references so all default
/// to the same platform.</para>
/// </summary>
public sealed class X402Config
{
    /// <summary>
    /// Default platform base URL — identical across all x402 SDKs.
    /// TODO: replace with the production platform domain before GA.
    /// </summary>
    public const string DefaultBaseUrl = "https://api.x402.dev";

    public string KeyId { get; }
    public string Secret { get; }
    public string BaseUrl { get; }

    /// <summary>"production" | "sandbox"</summary>
    public string Env { get; }

    public X402Config(string keyId, string secret, string baseUrl, string env)
    {
        KeyId = keyId;
        Secret = secret;
        BaseUrl = baseUrl;
        Env = env;
    }

    /// <summary>
    /// Resolves config via the provided getter (pass <c>Environment.GetEnvironmentVariable</c>
    /// in production; an injected function in tests).
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// if X402_API_KEY or X402_SECRET is missing.
    /// </exception>
    public static X402Config Resolve(Func<string, string?>? getenv)
    {
        var g = getenv ?? Environment.GetEnvironmentVariable;

        var keyId = NullToEmpty(g("X402_API_KEY"));
        var secret = NullToEmpty(g("X402_SECRET"));
        if (keyId.Length == 0 || secret.Length == 0)
        {
            throw new InvalidOperationException(
                "x402: X402_API_KEY and X402_SECRET must be set (server-side env)");
        }

        var mode = NullToEmpty(g("X402_ENV")).ToLowerInvariant();
        if (mode.Length == 0)
        {
            mode = "production";
        }

        var baseUrl = NullToEmpty(g("X402_BASE_URL"));
        if (baseUrl.Length == 0)
        {
            baseUrl = DefaultBaseUrl;
        }
        baseUrl = baseUrl.TrimEnd('/');

        var env = mode == "sandbox" ? "sandbox" : "production";
        return new X402Config(keyId, secret, baseUrl, env);
    }

    private static string NullToEmpty(string? s) => s ?? string.Empty;
}
