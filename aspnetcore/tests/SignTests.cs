using System;
using System.IO;
using System.Text.RegularExpressions;
using Xunit;
using X402.AspNetCore;

namespace X402.AspNetCore.Tests;

/// <summary>
/// Cross-SDK conformance gate. Loads the single shared vector file
/// <c>docs/api/x402-conformance-vectors.json</c> (resolved relative to the
/// repo root the same way <c>sdks/go/sign_test.go</c> does — two dirs up from
/// the SDK directory) and asserts the frozen X402v1 Known-Answer Test.
/// </summary>
public class SignTests
{
    /// <summary>Locate docs/api/x402-conformance-vectors.json relative to repo root.</summary>
    private static string LoadVectorsJson()
    {
        // sdks/go/sign_test.go uses filepath.Join("..","..","docs",...).
        // The xUnit test binary runs from
        // sdks/aspnetcore/tests/bin/Debug/net8.0, so walk up to the SDK dir
        // (sdks/aspnetcore) and then the same two-dir hop to the repo root.
        var sdkDir = FindSdkDir();
        var p = Path.Combine(sdkDir, "..", "..", "docs", "api", "x402-conformance-vectors.json");
        return File.ReadAllText(p);
    }

    private static string FindSdkDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "X402.AspNetCore.csproj")))
        {
            dir = dir.Parent;
        }
        Assert.True(dir != null, "could not locate sdks/aspnetcore dir from test working dir");
        return dir!.FullName;
    }

    private static string Field(string json, string key)
    {
        var m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
        Assert.True(m.Success, "vector field not found: " + key);
        return Unescape(m.Groups[1].Value);
    }

    private static long LongField(string json, string key)
    {
        var m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*(-?\\d+)");
        Assert.True(m.Success, "vector field not found: " + key);
        return long.Parse(m.Groups[1].Value);
    }

    private static string Unescape(string s)
        => s.Replace("\\n", "\n").Replace("\\\"", "\"").Replace("\\\\", "\\");

    [Fact]
    public void SchemeIsFrozen()
    {
        Assert.Equal("X402v1", Sign.Scheme);
    }

    [Fact]
    public void KatSignatureMatchesSharedOracle()
    {
        var json = LoadVectorsJson();
        var kIdx = json.IndexOf("\"kat\"", StringComparison.Ordinal);
        var kat = json.Substring(kIdx);

        var secret = Field(kat, "secret");
        var method = Field(kat, "method");
        var path = Field(kat, "path");
        var ts = LongField(kat, "timestamp");
        var nonce = Field(kat, "nonce");
        var body = Field(kat, "body");
        var expectedCanonical = Field(kat, "canonical");
        var expectedSig = Field(kat, "signature");
        var expectedBodySha = Field(kat, "body_sha256");

        var canonical = Sign.Canonical(method, path, ts, nonce, body);
        Assert.Equal(expectedCanonical, canonical);
        Assert.Equal(expectedBodySha, Sign.Sha256Hex(body));

        var sig = Sign.Signature(secret, method, path, ts, nonce, body);
        Assert.Matches("^[0-9a-f]{64}$", sig);
        Assert.Equal("c325bfaf7e66735f1e6a977b4b3b3fa6c9ae98d010123b1f724bed5ce5959ab5", expectedSig);
        Assert.Equal(expectedSig, sig);
    }

    [Fact]
    public void BodyHashesMatchSharedOracle()
    {
        var json = LoadVectorsJson();

        Assert.Equal(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            Sign.Sha256Hex(""));
        Assert.Equal(
            "015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862",
            Sign.Sha256Hex("{\"a\":1}"));

        var bhIdx = json.IndexOf("\"body_hashes\"", StringComparison.Ordinal);
        var bh = json.Substring(bhIdx);
        Assert.Contains("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", bh);
        Assert.Contains("015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862", bh);
    }

    [Fact]
    public void SignedHeadersShape()
    {
        var h = Sign.SignedHeaders("x402_test_abc", "x402sk_test_x", "POST",
            "/api/v1/challenge", "{\"route\":\"/p\"}");
        Assert.Equal("x402_test_abc", h["X-X402-Key"]);
        Assert.Matches("^\\d+$", h["X-X402-Timestamp"]);
        Assert.True(h["X-X402-Nonce"].Length >= 16);
        Assert.Matches("^[0-9a-f]{64}$", h["X-X402-Signature"]);
    }

    [Fact]
    public void NoncesUniqueAcrossCalls()
    {
        var a = Sign.SignedHeaders("k", "s", "POST", "/api/v1/challenge", "");
        var b = Sign.SignedHeaders("k", "s", "POST", "/api/v1/challenge", "");
        Assert.NotEqual(a["X-X402-Nonce"], b["X-X402-Nonce"]);
    }
}
