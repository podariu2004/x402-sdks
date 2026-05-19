using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace X402.AspNetCore;

/// <summary>
/// Thin transport to the x402 platform's signed challenge/verify endpoints.
///
/// <para>Request bodies are built as COMPACT JSON BY HAND, field by field in
/// the exact contract order, so the bytes that are signed are byte-identical
/// to the bytes that are sent (no reflective serializer is involved). Any
/// exception — transport failure or timeout — is surfaced as
/// <c>Status == 0</c> so the middleware fails closed.</para>
/// </summary>
public sealed class PlatformClient
{
    internal const string ChallengePath = "/api/v1/challenge";
    internal const string VerifyPath = "/api/v1/verify";
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(10);

    /// <summary>Result of a platform call. Status 0 == transport failure / timeout.</summary>
    public sealed class Result
    {
        public int Status { get; }
        public string Body { get; }

        public Result(int status, string? body)
        {
            Status = status;
            Body = body ?? string.Empty;
        }

        /// <summary>Best-effort boolean field lookup on a flat JSON object body.</summary>
        public bool JsonBoolean(string key) => JsonLite.BoolField(Body, key);
    }

    /// <summary>Seam so tests can inject a fake transport instead of real HTTP.</summary>
    public interface ITransport
    {
        /// <returns>status code, or 0 on any transport failure / timeout</returns>
        Result Send(string url, string body, IDictionary<string, string> headers);
    }

    private readonly X402Config _cfg;
    private readonly ITransport _transport;

    public PlatformClient(X402Config cfg, ITransport? transport = null)
    {
        _cfg = cfg;
        _transport = transport ?? new HttpClientTransport();
    }

    /// <summary>POST /api/v1/challenge — body {"route":...}(+"method").</summary>
    public Result Challenge(string route, string? method)
    {
        var sb = new StringBuilder();
        sb.Append('{').Append(JsonLite.Kv("route", route));
        if (!string.IsNullOrEmpty(method))
        {
            sb.Append(',').Append(JsonLite.Kv("method", method!));
        }
        sb.Append('}');
        return Post(ChallengePath, sb.ToString());
    }

    /// <summary>POST /api/v1/verify — body {"route","method","nonce","payer","payment_proof"}.</summary>
    public Result Verify(string route, string? method, string nonce, string? payer, string? paymentProofJson)
    {
        var sb = new StringBuilder();
        sb.Append('{').Append(JsonLite.Kv("route", route));
        if (!string.IsNullOrEmpty(method))
        {
            sb.Append(',').Append(JsonLite.Kv("method", method!));
        }
        sb.Append(',').Append(JsonLite.Kv("nonce", nonce));
        if (!string.IsNullOrEmpty(payer))
        {
            sb.Append(',').Append(JsonLite.Kv("payer", payer!));
        }
        if (!string.IsNullOrEmpty(paymentProofJson))
        {
            // payment_proof is forwarded as a raw JSON value (the platform is
            // the single decision point); strings are quoted/escaped.
            sb.Append(',').Append(JsonLite.RawOrString("payment_proof", paymentProofJson!));
        }
        sb.Append('}');
        return Post(VerifyPath, sb.ToString());
    }

    private Result Post(string path, string body)
    {
        var headers = Sign.SignedHeaders(_cfg.KeyId, _cfg.Secret, "POST", path, body);
        headers["Content-Type"] = "application/json";
        try
        {
            return _transport.Send(_cfg.BaseUrl + path, body, headers);
        }
        catch (Exception)
        {
            return new Result(0, string.Empty);
        }
    }

    /// <summary>Default <see cref="HttpClient"/> transport; exceptions ⇒ status 0.</summary>
    internal sealed class HttpClientTransport : ITransport
    {
        private static readonly HttpClient Http = new() { Timeout = RequestTimeout };

        public Result Send(string url, string body, IDictionary<string, string> headers)
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Post, url);
                var content = new StringContent(body, Encoding.UTF8);
                // Set Content-Type explicitly without the charset suffix.
                content.Headers.ContentType =
                    new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
                req.Content = content;
                foreach (var kv in headers)
                {
                    if (string.Equals(kv.Key, "Content-Type", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                    req.Headers.TryAddWithoutValidation(kv.Key, kv.Value);
                }

                using var cts = new CancellationTokenSource(RequestTimeout);
                using var resp = Http.Send(req, HttpCompletionOption.ResponseContentRead, cts.Token);
                var respBody = resp.Content
                    .ReadAsStringAsync(cts.Token)
                    .GetAwaiter()
                    .GetResult();
                return new Result((int)resp.StatusCode, respBody);
            }
            catch (Exception)
            {
                // Transport failure / timeout / cancellation ⇒ fail closed.
                return new Result(0, string.Empty);
            }
        }
    }
}

/// <summary>
/// Minimal compact-JSON helpers — deliberately NOT a general serializer.
///
/// <para><see cref="Kv"/> emits one <c>"key":"value"</c> pair with the value
/// escaped per RFC 8259, so request bodies are built field-by-field in exact
/// contract order and the signed bytes equal the sent bytes.
/// <see cref="BoolField"/> is a best-effort reader for the platform's flat
/// <c>{"allowed":true}</c> replies.</para>
/// </summary>
internal static class JsonLite
{
    /// <summary><c>"key":"value"</c> with the string value JSON-escaped.</summary>
    public static string Kv(string key, string value) => Quote(key) + ":" + Quote(value);

    /// <summary>
    /// <c>"key":&lt;raw&gt;</c> if <paramref name="raw"/> is already a JSON value
    /// (object/array/string/number/bool/null), else <c>"key":"&lt;escaped&gt;"</c>.
    /// </summary>
    public static string RawOrString(string key, string raw)
    {
        var t = raw.Trim();
        var isJson = t.Length > 0 && (
            t[0] == '{' || t[0] == '[' || t[0] == '"'
            || t == "true" || t == "false" || t == "null"
            || Regex.IsMatch(t, @"^-?\d+(\.\d+)?([eE][+-]?\d+)?$"));
        return Quote(key) + ":" + (isJson ? raw : Quote(raw));
    }

    public static string Quote(string s)
    {
        var sb = new StringBuilder(s.Length + 2);
        sb.Append('"');
        foreach (var c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                case '\b': sb.Append("\\b"); break;
                case '\f': sb.Append("\\f"); break;
                default:
                    if (c < 0x20)
                    {
                        sb.Append("\\u").Append(((int)c).ToString("x4"));
                    }
                    else
                    {
                        sb.Append(c);
                    }
                    break;
            }
        }
        sb.Append('"');
        return sb.ToString();
    }

    /// <summary>
    /// Best-effort: returns true iff the JSON object string contains
    /// <c>"key": true</c> (whitespace-tolerant). Any parse ambiguity ⇒ false
    /// (fail-closed).
    /// </summary>
    public static bool BoolField(string? json, string key)
    {
        if (json == null)
        {
            return false;
        }
        var m = Regex.Match(json, "\"" + Regex.Escape(key) + "\"\\s*:\\s*(true|false)");
        return m.Success && m.Groups[1].Value == "true";
    }
}
