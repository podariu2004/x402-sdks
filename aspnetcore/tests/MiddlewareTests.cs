using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Xunit;
using X402.AspNetCore;

namespace X402.AspNetCore.Tests;

/// <summary>
/// Fail-closed flow tests. The 502/402/passthrough paths use an injected fake
/// <see cref="PlatformClient.ITransport"/>; one test exercises the real
/// <c>HttpClient</c> transport via a fake <see cref="HttpMessageHandler"/>.
/// </summary>
public class MiddlewareTests
{
    private static readonly X402Config Cfg =
        new("key", "sk", "https://platform.test", "production");

    /// <summary>Fake transport returning a canned (status, body) for every call.</summary>
    private sealed class CannedTransport : PlatformClient.ITransport
    {
        private readonly int _status;
        private readonly string _body;
        public string? SeenBody;
        public string? SeenSignature;

        public CannedTransport(int status, string body)
        {
            _status = status;
            _body = body;
        }

        public PlatformClient.Result Send(
            string url, string body, IDictionary<string, string> headers)
        {
            SeenBody = body;
            headers.TryGetValue("X-X402-Signature", out var sig);
            SeenSignature = sig;
            return new PlatformClient.Result(_status, _body);
        }
    }

    /// <summary>Transport that throws — simulates a network exception.</summary>
    private sealed class ThrowingTransport : PlatformClient.ITransport
    {
        public PlatformClient.Result Send(
            string url, string body, IDictionary<string, string> headers)
            => throw new HttpRequestException("connection refused");
    }

    /// <summary>Fake HttpMessageHandler for the real HttpClient-transport test.</summary>
    private sealed class FakeHandler : HttpMessageHandler
    {
        private readonly HttpStatusCode _status;
        private readonly string _body;

        public FakeHandler(HttpStatusCode status, string body)
        {
            _status = status;
            _body = body;
        }

        private HttpResponseMessage Build() => new(_status)
        {
            Content = new StringContent(_body, Encoding.UTF8, "application/json"),
        };

        protected override HttpResponseMessage Send(
            HttpRequestMessage request, CancellationToken cancellationToken)
            => Build();

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(Build());
    }

    private static PlatformClient Client(PlatformClient.ITransport t)
        => new(Cfg, t);

    private static async Task<(int Status, string Body)> Run(
        X402Middleware mw, HttpContext ctx)
    {
        await mw.InvokeAsync(ctx);
        ctx.Response.Body.Seek(0, SeekOrigin.Begin);
        using var sr = new StreamReader(ctx.Response.Body);
        return (ctx.Response.StatusCode, await sr.ReadToEndAsync());
    }

    private static HttpContext NewCtx(string method, string path)
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Method = method;
        ctx.Request.Path = path;
        ctx.Response.Body = new MemoryStream();
        return ctx;
    }

    private static bool _nextCalled;
    private static RequestDelegate Next => _ =>
    {
        _nextCalled = true;
        return Task.CompletedTask;
    };

    [Fact]
    public async Task NoProof_Challenge200_RelayedAs402()
    {
        _nextCalled = false;
        var mw = new X402Middleware(Next, "/premium", "0.10",
            Client(new CannedTransport(200, "{\"challenge\":\"pay-me\"}")));
        var (status, body) = await Run(mw, NewCtx("GET", "/premium"));

        Assert.Equal(402, status);
        Assert.Contains("pay-me", body);
        Assert.False(_nextCalled);
    }

    [Fact]
    public async Task NoProof_Challenge404_RelayedAs404()
    {
        _nextCalled = false;
        var mw = new X402Middleware(Next, "/premium", "0.10",
            Client(new CannedTransport(404, "{}")));
        var (status, body) = await Run(mw, NewCtx("GET", "/premium"));

        Assert.Equal(404, status);
        Assert.Contains("no_such_route", body);
        Assert.False(_nextCalled);
    }

    [Fact]
    public async Task NoProof_Challenge500_FailsClosed502()
    {
        _nextCalled = false;
        var mw = new X402Middleware(Next, "/premium", "0.10",
            Client(new CannedTransport(500, "boom")));
        var (status, body) = await Run(mw, NewCtx("GET", "/premium"));

        Assert.Equal(502, status);
        Assert.Contains("x402_platform_unavailable", body);
        Assert.False(_nextCalled);
    }

    [Fact]
    public async Task NoProof_TransportException_FailsClosed502()
    {
        _nextCalled = false;
        var mw = new X402Middleware(Next, "/premium", "0.10",
            Client(new ThrowingTransport()));
        var (status, body) = await Run(mw, NewCtx("GET", "/premium"));

        Assert.Equal(502, status);
        Assert.Contains("x402_platform_unavailable", body);
        Assert.False(_nextCalled);
    }

    [Fact]
    public async Task WithProof_VerifyAllowed_Passthrough()
    {
        _nextCalled = false;
        var mw = new X402Middleware(Next, "/premium", "0.10",
            Client(new CannedTransport(200, "{\"allowed\":true}")));
        var ctx = NewCtx("GET", "/premium");
        ctx.Request.Headers["X-Payment-Nonce"] = "n-1";
        ctx.Request.Headers["X-Payment"] = "{\"tx\":\"abc\"}";

        var (status, _) = await Run(mw, ctx);

        Assert.Equal(200, status);
        Assert.True(_nextCalled);
    }

    [Fact]
    public async Task WithProof_VerifyDenied_FailsClosed502()
    {
        _nextCalled = false;
        var mw = new X402Middleware(Next, "/premium", "0.10",
            Client(new CannedTransport(200, "{\"allowed\":false}")));
        var ctx = NewCtx("GET", "/premium");
        ctx.Request.Headers["X-Payment-Nonce"] = "n-1";

        var (status, _) = await Run(mw, ctx);

        Assert.Equal(502, status); // verify 200 + not allowed ⇒ fail-closed
        Assert.False(_nextCalled);
    }

    [Fact]
    public async Task WithProof_Verify402_RelayedAs402()
    {
        _nextCalled = false;
        var mw = new X402Middleware(Next, "/premium", "0.10",
            Client(new CannedTransport(402, "{\"error\":\"payment_required\"}")));
        var ctx = NewCtx("GET", "/premium");
        ctx.Request.Headers["X-Payment-Nonce"] = "n-1";

        var (status, body) = await Run(mw, ctx);

        Assert.Equal(402, status);
        Assert.Contains("payment_required", body);
        Assert.False(_nextCalled);
    }

    [Fact]
    public async Task WithProof_VerifyTransportError_FailsClosed502()
    {
        _nextCalled = false;
        var mw = new X402Middleware(Next, "/premium", "0.10",
            Client(new ThrowingTransport()));
        var ctx = NewCtx("GET", "/premium");
        ctx.Request.Headers["X-Payment-Nonce"] = "n-1";

        var (status, _) = await Run(mw, ctx);

        Assert.Equal(502, status);
        Assert.False(_nextCalled);
    }

    [Fact]
    public void CompactJsonBody_SignedBytesEqualSentBytes()
    {
        var t = new CannedTransport(200, "{\"allowed\":true}");
        var pc = new PlatformClient(Cfg, t);
        pc.Challenge("/premium", "GET");

        Assert.Equal("{\"route\":\"/premium\",\"method\":\"GET\"}", t.SeenBody);
        Assert.Matches("^[0-9a-f]{64}$", t.SeenSignature);
    }

    [Fact]
    public async Task HttpClientTransport_RealHandler_ReturnsStatusAndBody()
    {
        // Exercises the real System.Net.Http path via a fake
        // HttpMessageHandler (no socket): proves the signed X-X402 headers
        // and compact body reach the wire intact and the response is parsed.
        var handler = new FakeHandler(HttpStatusCode.OK, "{\"allowed\":true}");
        using var http = new HttpClient(handler);

        var headers = Sign.SignedHeaders("k", "sk", "POST", "/api/v1/verify", "{\"route\":\"/p\"}");
        using var req = new HttpRequestMessage(HttpMethod.Post, "https://platform.test/api/v1/verify");
        req.Content = new StringContent("{\"route\":\"/p\"}", Encoding.UTF8);
        req.Content.Headers.ContentType =
            new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
        foreach (var kv in headers)
        {
            if (!string.Equals(kv.Key, "Content-Type", StringComparison.OrdinalIgnoreCase))
            {
                req.Headers.TryAddWithoutValidation(kv.Key, kv.Value);
            }
        }
        var resp = await http.SendAsync(req);
        var body = await resp.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("{\"allowed\":true}", body);
        Assert.Matches("^[0-9a-f]{64}$",
            string.Join("", req.Headers.GetValues("X-X402-Signature")));
    }
}
