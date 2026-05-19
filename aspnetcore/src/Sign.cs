using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

namespace X402.AspNetCore;

/// <summary>
/// Frozen X402v1 signing primitives.
///
/// <code>
/// canonical = "X402v1" LF METHOD LF path LF timestamp LF nonce LF sha256hex(body)
/// signature = HMAC-SHA256(secret, canonical) -&gt; lowercase hex (64 chars)
/// </code>
///
/// Byte-identical to the Go / Node / Python / PHP / Java reference oracles.
/// The cross-SDK Known-Answer Test in <c>SignTests</c> is the conformance gate.
/// </summary>
public static class Sign
{
    /// <summary>Canonical-string version. MUST match the platform's X402ApiKey::SCHEME.</summary>
    public const string Scheme = "X402v1";

    private static string Hex(byte[] bytes)
        => Convert.ToHexString(bytes).ToLowerInvariant();

    /// <summary>Lowercase-hex SHA-256 of the exact UTF-8 body bytes.</summary>
    public static string Sha256Hex(string body)
        => Hex(SHA256.HashData(Encoding.UTF8.GetBytes(body)));

    /// <summary>
    /// Builds the frozen six-field canonical string. <paramref name="timestamp"/>
    /// is a <see cref="long"/> (unix seconds): the type makes a non-integer
    /// impossible at the call site, satisfying the contract's integer rule
    /// structurally.
    /// </summary>
    public static string Canonical(string method, string path, long timestamp, string nonce, string body)
        => string.Join("\n", new[]
        {
            Scheme,
            method.ToUpperInvariant(),
            path,
            timestamp.ToString(System.Globalization.CultureInfo.InvariantCulture),
            nonce,
            Sha256Hex(body),
        });

    /// <summary>Lowercase-hex HMAC-SHA256 of the canonical string.</summary>
    public static string Signature(string secret, string method, string path, long timestamp, string nonce, string body)
    {
        var sig = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(secret),
            Encoding.UTF8.GetBytes(Canonical(method, path, timestamp, nonce, body)));
        return Hex(sig);
    }

    /// <summary>The four X-X402 signed headers with a fresh nonce and current time.</summary>
    public static IDictionary<string, string> SignedHeaders(
        string keyId, string secret, string method, string path, string body)
    {
        var ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var nonce = Guid.NewGuid().ToString();
        return new Dictionary<string, string>
        {
            ["X-X402-Key"] = keyId,
            ["X-X402-Timestamp"] = ts.ToString(System.Globalization.CultureInfo.InvariantCulture),
            ["X-X402-Nonce"] = nonce,
            ["X-X402-Signature"] = Signature(secret, method, path, ts, nonce, body),
        };
    }
}
