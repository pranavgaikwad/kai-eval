# Spring Security 6.0 Migration Fix Notes: WebSecurityConfigurerAdapter → SecurityFilterChain

## Summary

**Issue ID**: WebSecurityConfigurerAdapter Migration
**Target Technology**: Spring Framework 6.0 / Spring Security 6.0
**Change Contract**: Replace deprecated `WebSecurityConfigurerAdapter` extension pattern with modern `SecurityFilterChain` bean configuration approach. This includes updating all related deprecated Spring Security configuration patterns to their modern equivalents, along with upgrading all Spring dependencies to Framework 6.0 compatible versions.

The migration involves replacing:
- `WebSecurityConfigurerAdapter` extension → `@Bean SecurityFilterChain`
- `authorizeRequests()` → `authorizeHttpRequests()`
- `antMatchers()` → `requestMatchers()`
- Deprecated authentication configuration patterns → Modern bean-based patterns
- Legacy form login/logout configuration → Lambda-based configuration
- `User.withDefaultPasswordEncoder()` → `User.builder()` with proper password encoding
- Spring Framework 5.x dependencies → Spring Framework 6.x dependencies
- javax.* APIs → jakarta.* APIs

## Affected Surface Area

### Components/Modules Touched
- **Security Configuration**: Core Spring Security configuration class
- **Authentication System**: User authentication and authorization mechanisms
- **Session Management**: Security session handling and registry
- **Custom Authentication Filters**: Legacy token-based authentication
- **Build Configuration**: Maven dependencies and version management

### Entry Points
- **Web Security**: HTTP request authorization rules for all endpoints
- **Authentication Endpoints**: Login, logout, and authentication processing
- **API Security**: REST API endpoint protection and authorization
- **Static Resource Security**: CSS, JS, and static asset access patterns

### Public APIs
- **Security Filter Chain**: Primary security configuration bean
- **Authentication Manager**: Central authentication processing
- **User Details Service**: User loading and credential management
- **Password Encoder**: Password hashing and validation

### Direct vs. Indirect Occurrences

**Direct Occurrences** (requiring immediate changes):
- `SecurityConfig.java:31` - `WebSecurityConfigurerAdapter` class extension
- `SecurityConfig.java:38-73` - `configure(HttpSecurity)` method override
- `SecurityConfig.java:80-87` - `configure(WebSecurity)` method override
- `SecurityConfig.java:94-115` - `configure(AuthenticationManagerBuilder)` method override
- `SecurityConfig.java:136,142,148` - `User.withDefaultPasswordEncoder()` usage
- `SecurityConfig.java:41` - `authorizeRequests()` configuration
- `SecurityConfig.java:42-45,83-86` - `antMatchers()` usage patterns
- `SecurityConfig.java:194-195` - `javax.servlet` imports
- `pom.xml:19-26` - Spring Framework 5.x dependency versions
- `pom.xml:82-114` - javax.* API dependencies

## Per-File Change Plan

### 1. pom.xml

**Path**: `pom.xml`

**Reason**: Spring Framework 6 migration requires updating all Spring-related dependencies from 5.x to 6.x versions and migrating from javax.* to jakarta.* APIs. This is a prerequisite for the SecurityConfig code changes to compile and function properly.

**Exact Changes**:

1. **Update Spring Framework version properties**:
   - Change: `<java.version>8</java.version>` → `<java.version>17</java.version>` (line 19)
   - Change: `<spring.version>5.3.23</spring.version>` → `<spring.version>6.0.0</spring.version>` (line 20)
   - Change: `<spring-security.version>5.7.5</spring-security.version>` → `<spring-security.version>6.0.0</spring-security.version>` (line 21)
   - Change: `<spring-data.version>2.7.5</spring-data.version>` → `<spring-data.version>3.0.0</spring-data.version>` (line 22)

2. **Update javax.* to jakarta.* API dependencies**:
   - Change: `javax.servlet:javax.servlet-api:4.0.1` → `jakarta.servlet:jakarta.servlet-api:6.0.0` (lines 82-86)
   - Change: `javax.persistence:javax.persistence-api:2.2` → `jakarta.persistence:jakarta.persistence-api:3.1.0` (lines 90-93)
   - Change: `javax.validation:validation-api:2.0.1.Final` → `jakarta.validation:jakarta.validation-api:3.0.2` (lines 97-100)
   - Change: `javax.annotation:javax.annotation-api:1.3.2` → `jakarta.annotation:jakarta.annotation-api:2.1.1` (lines 111-114)

**Citations**:
- Before: `pom.xml:19-26,82-114`
- After: Updated to Spring Framework 6.0 and Jakarta EE 9+ namespace

### 2. src/main/java/com/redhat/mta/examples/spring/framework/security/SecurityConfig.java

**Path**: `src/main/java/com/redhat/mta/examples/spring/framework/security/SecurityConfig.java`

**Reason**: This file contains the primary `WebSecurityConfigurerAdapter` usage that was deprecated in Spring Security 5.7 and removed in Spring Security 6.0. The entire security configuration must be migrated to use the modern SecurityFilterChain bean approach.

**Exact Changes**:

1. **Remove WebSecurityConfigurerAdapter extension and update imports**:
   - Remove import: `org.springframework.security.config.annotation.web.configuration.WebSecurityConfigurerAdapter` (line 9)
   - Remove import: `org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder` (line 5)
   - Remove import: `org.springframework.security.config.annotation.web.builders.WebSecurity` (line 7)
   - Add import: `org.springframework.security.authentication.AuthenticationManager` (line 5)
   - Add import: `org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration` (line 6)
   - Add import: `org.springframework.security.config.annotation.web.configuration.WebSecurityCustomizer` (line 9)
   - Add import: `org.springframework.security.web.SecurityFilterChain` (line 16)
   - Add import: `org.springframework.security.authentication.dao.DaoAuthenticationProvider` (line 19)
   - Add import: `static org.springframework.security.config.Customizer.withDefaults` (line 20)
   - Change class declaration from `extends WebSecurityConfigurerAdapter` (line 31) to plain class

2. **Replace HttpSecurity configuration method**:
   - Remove: `configure(HttpSecurity http)` method override (lines 38-73)
   - Add new SecurityFilterChain bean method:
   ```java
   @Bean
   public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
       http
           .authenticationProvider(authenticationProvider())
           .csrf(csrf -> csrf.disable())
           .authorizeHttpRequests(auth -> auth
               .requestMatchers("/", "/home", "/public/**").permitAll()
               .requestMatchers("/admin/**").hasRole("ADMIN")
               .requestMatchers("/user/**").hasAnyRole("USER", "ADMIN")
               .requestMatchers("/api/v1/**").hasAuthority("API_ACCESS")
               .anyRequest().authenticated()
           )
           .formLogin(form -> form
               .loginPage("/login")
               .loginProcessingUrl("/authenticate")
               .defaultSuccessUrl("/dashboard", true)
               .failureUrl("/login?error=true")
               .usernameParameter("username")
               .passwordParameter("password")
               .permitAll()
           )
           .logout(logout -> logout
               .logoutUrl("/logout")
               .logoutSuccessUrl("/login?logout=true")
               .logoutRequestMatcher(new AntPathRequestMatcher("/logout", "POST"))
               .deleteCookies("JSESSIONID")
               .invalidateHttpSession(true)
               .clearAuthentication(true)
               .permitAll()
           )
           .sessionManagement(session -> session
               .maximumSessions(1)
               .maxSessionsPreventsLogin(false)
               .sessionRegistry(sessionRegistry())
           )
           .httpBasic(withDefaults());

       return http.build();
   }
   ```

3. **Replace WebSecurity configuration method**:
   - Remove: `configure(WebSecurity web)` method override (lines 80-87)
   - Add new WebSecurityCustomizer bean:
   ```java
   @Bean
   public WebSecurityCustomizer webSecurityCustomizer() {
       return web -> web.ignoring()
           .requestMatchers("/css/**", "/js/**", "/images/**")
           .requestMatchers("/webjars/**")
           .requestMatchers("/favicon.ico")
           .requestMatchers("/actuator/health", "/actuator/info");
   }
   ```

4. **Replace AuthenticationManagerBuilder configuration**:
   - Remove: `configure(AuthenticationManagerBuilder auth)` method override (lines 94-115)
   - Add new AuthenticationManager bean:
   ```java
   @Bean
   public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
       return config.getAuthenticationManager();
   }
   ```

5. **Add DaoAuthenticationProvider bean**:
   ```java
   @Bean
   public DaoAuthenticationProvider authenticationProvider() {
       DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider();
       authProvider.setUserDetailsService(userDetailsService());
       authProvider.setPasswordEncoder(passwordEncoder());
       return authProvider;
   }
   ```

6. **Update UserDetailsService method**:
   - Remove `@Override` annotation (line 133)
   - Replace `User.withDefaultPasswordEncoder()` with `User.builder()`:
   ```java
   @Bean
   public UserDetailsService userDetailsService() {
       UserDetails admin = User.builder()
           .username("admin")
           .password("admin123")
           .roles("ADMIN", "USER")
           .build();

       UserDetails user = User.builder()
           .username("user")
           .password("user123")
           .roles("USER")
           .build();

       UserDetails apiUser = User.builder()
           .username("apiuser")
           .password("api123")
           .authorities("API_ACCESS")
           .build();

       UserDetails api = User.builder()
           .username("api")
           .password("api123")
           .authorities("API_ACCESS", "READ_ONLY")
           .build();

       return new InMemoryUserDetailsManager(admin, user, apiUser, api);
   }
   ```

7. **Update LegacyAuthenticationFilter bean**:
   - Change `authenticationManagerBean()` to `authenticationManager(AuthenticationConfiguration config)`:
   ```java
   @Bean
   public LegacyAuthenticationFilter legacyAuthenticationFilter(AuthenticationManager authenticationManager) throws Exception {
       LegacyAuthenticationFilter filter = new LegacyAuthenticationFilter();
       filter.setAuthenticationManager(authenticationManager);
       filter.setFilterProcessesUrl("/api/authenticate");
       return filter;
   }
   ```

8. **Update servlet API imports**:
   - Change: `javax.servlet.http.HttpServletRequest` → `jakarta.servlet.http.HttpServletRequest` (line 194)
   - Change: `javax.servlet.http.HttpServletResponse` → `jakarta.servlet.http.HttpServletResponse` (line 195)

**Citations**:
- Before: `src/main/java/com/redhat/mta/examples/spring/framework/security/SecurityConfig.java:31-226`
- After: Complete class restructure maintaining same functional behavior with modern Spring Security 6 patterns