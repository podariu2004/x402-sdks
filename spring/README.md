# x402 Spring Boot SDK

Thin x402 payment-gate filter for Spring Boot. Implements the frozen X402v1 wire contract. No payment logic in your app — it relays to the platform's signed challenge/verify and fails closed: if the platform is unreachable the route returns 502 and never serves paid content.

> **Availability:** Distributed as source today (GitHub) — official registry packages (npm · PyPI · Packagist · Go module) are coming. Each SDK implements the same frozen X402v1 wire contract.

## Install

Maven (`pom.xml`):

```xml
<dependency>
  <groupId>dev.x402</groupId>
  <artifactId>x402-spring</artifactId>
  <version>0.1.0</version>
</dependency>
```

_(Until published to Maven Central: see [Source](#source) below — clone this directory and `mvn install`.)_ Requires Java **17+** and Spring Boot **3.x** (provided at runtime; zero extra runtime dependencies — `java.net.http` only).

## Usage

```java
import dev.x402.spring.X402Filter;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
class X402Setup {
    @Bean
    FilterRegistrationBean<X402Filter> premiumGate() {
        FilterRegistrationBean<X402Filter> reg =
                new FilterRegistrationBean<>(new X402Filter("/premium", "0.10"));
        reg.addUrlPatterns("/premium");
        return reg;
    }
}
```

Or use the auto-config: set `x402.route=/premium` (and optional `x402.price`) in `application.properties` — the filter is registered for you.

`price` is a telemetry hint; the authoritative price is the route you registered on the platform.

## Configuration

Server-side env vars:

| Var | Required | Default |
|---|---|---|
| `X402_API_KEY` | yes | — |
| `X402_SECRET` | yes | — |
| `X402_ENV` | no | `production` (`sandbox` for test mode) |
| `X402_BASE_URL` | no | platform default |

## Notes

- **Fail-closed:** no payment proof → the platform's `/challenge` is relayed as HTTP `402`; an unknown route → `404 {"error":"no_such_route"}`; any other platform status or a transport failure/timeout → HTTP `502 {"error":"x402_platform_unavailable"}` and the protected handler never runs. With proof → `/verify`; only an explicit `{"allowed":true}` lets the request through.
- **Standalone:** it's a plain `OncePerRequestFilter` — Spring Security independent; works on any route in any Spring Boot 3 app.
- **Conformance:** `SignTest` pins the shared cross-SDK Known-Answer Test from `docs/api/x402-conformance-vectors.json` and reproduces signature `c325bf…5959ab5` byte-for-byte — identical to the Go / Node / FastAPI / Laravel reference oracles.

## Source

<https://github.com/podariu2004/x402-sdks/tree/main/spring>

## Docs

- <https://payrelayer.com/sdks/spring>
- <https://payrelayer.com/for-developers>

## License

MIT — see [LICENSE](./LICENSE).
