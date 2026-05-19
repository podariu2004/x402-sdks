package dev.x402.spring;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Optional Spring Boot auto-configuration. Activated when
 * {@code x402.route} is set; the filter remains fully usable WITHOUT this
 * (construct {@link X402Filter} directly).
 */
@Configuration
@EnableConfigurationProperties(X402Properties.class)
@ConditionalOnProperty(prefix = "x402", name = "route")
public class X402AutoConfiguration {

    @Bean
    public FilterRegistrationBean<X402Filter> x402FilterRegistration(X402Properties props) {
        FilterRegistrationBean<X402Filter> reg = new FilterRegistrationBean<>(
                new X402Filter(props.getRoute(), props.getPrice()));
        reg.addUrlPatterns(props.getRoute());
        return reg;
    }
}
