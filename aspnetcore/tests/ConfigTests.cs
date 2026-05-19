using System;
using System.Collections.Generic;
using Xunit;
using X402.AspNetCore;

namespace X402.AspNetCore.Tests;

public class ConfigTests
{
    private static Func<string, string?> Env(IDictionary<string, string> m)
        => k => m.TryGetValue(k, out var v) ? v : null;

    [Fact]
    public void MissingCredentialsThrows()
    {
        Assert.Throws<InvalidOperationException>(
            () => X402Config.Resolve(Env(new Dictionary<string, string>())));

        var onlyKey = new Dictionary<string, string> { ["X402_API_KEY"] = "k" };
        Assert.Throws<InvalidOperationException>(
            () => X402Config.Resolve(Env(onlyKey)));
    }

    [Fact]
    public void DefaultsApplied()
    {
        var m = new Dictionary<string, string>
        {
            ["X402_API_KEY"] = "key",
            ["X402_SECRET"] = "sk",
        };
        var c = X402Config.Resolve(Env(m));
        Assert.Equal("key", c.KeyId);
        Assert.Equal("sk", c.Secret);
        Assert.Equal("production", c.Env);
        Assert.Equal(X402Config.DefaultBaseUrl, c.BaseUrl);
    }

    [Fact]
    public void SandboxEnvAndTrailingSlashStripped()
    {
        var m = new Dictionary<string, string>
        {
            ["X402_API_KEY"] = "key",
            ["X402_SECRET"] = "sk",
            ["X402_ENV"] = "SANDBOX",
            ["X402_BASE_URL"] = "https://example.test/api///",
        };
        var c = X402Config.Resolve(Env(m));
        Assert.Equal("sandbox", c.Env);
        Assert.Equal("https://example.test/api", c.BaseUrl);
    }

    [Fact]
    public void UnknownEnvFallsBackToProduction()
    {
        var m = new Dictionary<string, string>
        {
            ["X402_API_KEY"] = "key",
            ["X402_SECRET"] = "sk",
            ["X402_ENV"] = "weird",
        };
        Assert.Equal("production", X402Config.Resolve(Env(m)).Env);
    }
}
