# Spring Framework 5 to 6 Migration Example - Architecture Specification

## Executive Summary

This is a **Spring Framework 5** enterprise user management system and implements some legacy patterns.

## Inventory & Layout

### Repository Structure
```
spring-framework-migration/
├── src/main/java/com/redhat/mta/examples/spring/framework/
│   ├── config/           # Configuration classes with deprecated patterns
│   ├── controller/       # Web controllers using legacy MVC patterns
│   ├── model/           # JPA entities with javax.persistence
│   ├── repository/      # Data repositories with deprecated query patterns
│   ├── security/        # Security configuration with legacy patterns
│   └── service/         # Business services with deprecated injection
├── src/main/resources/
│   └── application.properties  # Legacy configuration properties
├── pom.xml              # Maven build with Spring 5 dependencies
└── README.md            # Comprehensive migration documentation
```

### Technology Stack

| Component | Version | Status | Migration Target |
|-----------|---------|--------|------------------|
| Spring Framework | 5.3.23 | Deprecated | 6.x |
| Spring Security | 5.7.5 | Deprecated | 6.x |
| Spring Data JPA | 2.7.5 | Deprecated | 3.x |
| Java | 8 | Legacy | 17+ |
| JPA API | 2.2 (javax.persistence) | Deprecated | 3.0+ (jakarta.persistence) |
| Servlet API | 4.0.1 (javax.servlet) | Deprecated | 5.0+ (jakarta.servlet) |
| Bean Validation | 2.0.1 (javax.validation) | Deprecated | 3.0+ (jakarta.validation) |

**Build Tools**: Maven 3.8+
**Package Manager**: Maven Central
**Testing**: JUnit 4.13.2 (legacy)

## Purpose & Domain

### Domain Model
The application simulates an enterprise user management system with core entities:

- **User** `(model/User.java:17-113)`: Employee records with authentication data
- **Department** `(model/Department.java:9-34)`: Organizational structure
- **Role** `(model/Role.java:16-98)`: Permission and access control

### Business Relationships
- User ↔ Department: Many-to-One `(model/User.java:53-55)`
- User ↔ Role: Many-to-Many `(model/User.java:58-64)`
- Role ↔ User: Many-to-Many bidirectional `(model/Role.java:34-35)`

## High-Level Architecture

### Component Overview
```
┌─────────────────────────────────────────────────────────────┐
│                    Spring Framework 5 Application           │
├─────────────────────────────────────────────────────────────┤
│  Web Layer (Deprecated Patterns)                            │
│  ├── UserController (legacy @RequestMapping)                │
│  ├── WebMvcConfig (deprecated WebMvcConfigurerAdapter)      │
│  └── Security (deprecated WebSecurityConfigurerAdapter)     │
├─────────────────────────────────────────────────────────────┤
│  Service Layer (Legacy Dependency Injection)                │
│  ├── UserService (field injection @Autowired)               │
│  ├── EmailService (placeholder interface)                   │
│  └── AuditService (placeholder interface)                   │
├─────────────────────────────────────────────────────────────┤
│  Data Access Layer (Deprecated JPA Patterns)                │
│  ├── UserRepository (legacy @Query patterns)                │
│  ├── DepartmentRepository (placeholder)                     │
│  └── JPA Entities (javax.persistence)                       │
├─────────────────────────────────────────────────────────────┤
│  Configuration Layer (Legacy Configuration)                 │
│  ├── ApplicationConfig (deprecated bean patterns)           │
│  ├── WebMvcConfig (deprecated adapter)                      │
│  └── SecurityConfig (deprecated security patterns)          │
└─────────────────────────────────────────────────────────────┘
```

### Dependency Flow
- **Controller** → **Service** (field injection) → **Repository** → **Database**
- **Security** → **UserDetailsService** (deprecated patterns)
- **Configuration** → **All Layers** (manual bean configuration)

## Detailed Component Catalog

### Configuration Components

#### ApplicationConfig `(config/ApplicationConfig.java:37-268)`
**Purpose**: Central application configuration using deprecated Spring patterns
**Key Deprecated Patterns**:
- `javax.persistence` imports `(21-22)`
- Manual DataSource configuration `(55-67)`
- Legacy EntityManagerFactory setup `(73-98)`
- Deprecated transaction manager `(104-116)`
- Manual cache configuration `(122-134)`

**Dependencies**: EntityManagerFactory, DataSource, CacheManager
**Configuration Issues**: 50+ deprecated patterns for Spring 6 migration

#### WebMvcConfig `(config/WebMvcConfig.java:22-158)`
**Purpose**: Web MVC configuration using deprecated WebMvcConfigurerAdapter
**Key Deprecated Patterns**:
- `WebMvcConfigurerAdapter` extension `(23)` - deprecated in Spring 5.0
- Legacy CORS configuration `(30-44)`
- Deprecated resource handlers `(50-65)`
- `HandlerInterceptorAdapter` usage `(117-157)`

**Known Issues**: Will fail compilation in Spring Framework 6

#### SecurityConfig `(security/SecurityConfig.java:29-230)`
**Purpose**: Security configuration using deprecated WebSecurityConfigurerAdapter
**Key Deprecated Patterns**:
- `WebSecurityConfigurerAdapter` extension `(31)` - deprecated in Spring Security 5.7
- `authorizeRequests()` usage `(41)` - deprecated for `authorizeHttpRequests()`
- `antMatchers()` usage `(42-45)` - deprecated for `requestMatchers()`
- `NoOpPasswordEncoder` `(125)` - security vulnerability

**Security Vulnerabilities**: Plain text passwords, deprecated authentication patterns

### Web Layer Components

#### UserController `(controller/UserController.java:33-325)`
**Purpose**: REST and web endpoints for user management
**Key Deprecated Patterns**:
- `javax.servlet` API usage `(15-17)`
- Legacy `@RequestMapping` without HTTP methods `(47, 68)`
- `ModelAndView` patterns `(48-61)`
- Direct `HttpServletRequest`/`HttpServletResponse` usage `(48, 174)`
- Manual CORS handling `(176-179)`

**Endpoints**:
- `GET /users/list` - User listing with deprecated patterns
- `POST /users/create` - User creation with legacy validation
- `GET /users/edit/{id}` - User editing with session handling
- `POST /users/api/search` - AJAX search with manual JSON handling

### Service Layer Components

#### UserService `(service/UserService.java:34-335)`
**Purpose**: Business logic layer with deprecated dependency injection
**Key Deprecated Patterns**:
- Field injection with `@Autowired` `(39-56)` - should use constructor injection
- `javax.annotation.PostConstruct` `(62)` - should be `jakarta.annotation`
- Complex transaction configuration `(89-95)`
- Legacy async patterns with `Future` `(169-185)`
- Manual cache management `(265-268)`

**Business Operations**:
- User CRUD operations with deprecated transaction patterns
- Bulk operations with manual iteration `(191-225)`
- Scheduled cleanup tasks `(231-258)`
- Async processing with legacy patterns

### Data Access Components

#### UserRepository `(repository/UserRepository.java:25-139)`
**Purpose**: Data access layer with deprecated JPA patterns
**Key Deprecated Patterns**:
- Positional parameters in `@Query` `(32, 39)` - should use named parameters
- Mixed parameter binding `(46-47)`
- Complex method naming `(60-61)`
- Legacy bulk operations `(74-86)`
- Native queries with positional parameters `(39-40)`

**Query Patterns**: 15+ deprecated query patterns requiring migration

#### Model Entities

##### User `(model/User.java:17-113)`
**Purpose**: Core user entity with deprecated JPA patterns
**Deprecated Elements**:
- `javax.persistence` imports `(3)` - should be `jakarta.persistence`
- Eager loading in many-to-many `(58)`
- Complex join table configuration `(59-63)`

##### Department `(model/Department.java:9-34)`
**Purpose**: Organizational structure entity
**Deprecated Elements**: `javax.persistence` imports `(3)`

##### Role `(model/Role.java:16-98)`
**Purpose**: Access control and permissions
**Deprecated Elements**: `javax.persistence` imports `(3)`, bidirectional many-to-many `(34-35)`

## Data & Control Flow

### Typical Request Flow
1. **HTTP Request** → `UserController` (deprecated servlet API)
2. **Controller** → `UserService` (field injection)
3. **Service** → `UserRepository` (deprecated query patterns)
4. **Repository** → **H2 Database** (javax.persistence)
5. **Response** ← **JSON/ModelAndView** (deprecated patterns)

### Authentication Flow
1. **Login Request** → `SecurityConfig` (deprecated WebSecurityConfigurerAdapter)
2. **Authentication** → `UserDetailsService` (deprecated User.withDefaultPasswordEncoder)
3. **Authorization** → `authorizeRequests()` (deprecated patterns)
4. **Session Management** → Legacy session handling

### Error Handling
- **Controller Level**: `@ExceptionHandler` with `ModelAndView` `(284-294)`
- **Service Level**: Manual try-catch blocks `(102-122)`
- **Global**: Simple exception mapping `(234-249)`

## APIs & Contracts

### REST Endpoints

| Method | Path | Purpose | Deprecated Patterns |
|--------|------|---------|-------------------|
| GET | `/users/list` | User listing | ModelAndView, HttpServletRequest |
| POST | `/users/create` | User creation | Legacy form handling |
| GET | `/users/edit/{id}` | User editing | Session-based state |
| POST | `/users/api/search` | User search | Manual JSON, CORS |
| POST | `/users/upload` | File upload | Manual validation |

### Security Endpoints

| Method | Path | Purpose | Deprecated Patterns |
|--------|------|---------|-------------------|
| POST | `/authenticate` | Login | Legacy form login |
| POST | `/logout` | Logout | antMatchers configuration |
| GET | `/admin/**` | Admin access | authorizeRequests() |

## Persistence

### Database Configuration
- **Type**: H2 in-memory database `(application.properties:5)`
- **JPA Provider**: Hibernate `(pom.xml:102-107)`
- **Connection Pool**: DriverManagerDataSource (deprecated) `(config/ApplicationConfig.java:56-67)`
- **Schema Management**: `hibernate.hbm2ddl.auto=create-drop` `(application.properties:11)`

### Entity Relationships
```sql
users (id, firstName, lastName, email, active, department_id)
departments (id, name)
roles (id, name, description, active)
user_roles (user_id, role_id)  -- join table
```

### Known Data Issues
- **Eager Loading**: Role relationships `(model/User.java:58)`
- **N+1 Queries**: Manual lazy loading `(service/UserService.java:147-156)`
- **Bulk Operations**: Individual saves in loops `(service/UserService.java:196-203)`

## Configuration, Secrets, & Environments

### Configuration Files
- **Main Config**: `application.properties` `(src/main/resources/application.properties:1-61)`
- **Security**: Hardcoded in `SecurityConfig` `(security/SecurityConfig.java:96-107)`
- **Database**: In-memory H2 with hardcoded credentials `(application.properties:5-8)`

### Environment Variables
None - all configuration is hardcoded (deprecated pattern)

### Security Issues
- **Plain Text Passwords**: `NoOpPasswordEncoder` `(security/SecurityConfig.java:125)`
- **Hardcoded Credentials**: admin/admin123 `(application.properties:24-26)`
- **No Secret Management**: All credentials in source code

## Build, Run, Deploy

### Build Commands
```bash
# Compile with deprecation warnings (expected)
mvn clean compile

# Package WAR file
mvn package

# Run tests (shows deprecation warnings)
mvn test
```

### Prerequisites
- **Java**: 8+ (legacy requirement)
- **Maven**: 3.6+
- **Memory**: 512MB+ for H2 database

### Deployment Target
- **Current**: Standalone WAR application
- **Migration Target**: Spring Boot 3.x with embedded server

## Security & Compliance

### Authentication & Authorization
- **AuthN**: Form-based login with deprecated patterns `(security/SecurityConfig.java:48-55)`
- **AuthZ**: Role-based access control with `antMatchers()` `(security/SecurityConfig.java:42-46)`
- **Session Management**: Legacy configuration `(security/SecurityConfig.java:66-70)`

### Security Vulnerabilities
- **CRITICAL**: Plain text password storage `(security/SecurityConfig.java:96-107)`
- **HIGH**: Deprecated authentication patterns
- **MEDIUM**: Hardcoded credentials in configuration
- **LOW**: Missing CSRF protection for APIs

### Compliance Gaps
- **OWASP**: Multiple security anti-patterns
- **Spring Security**: 15+ deprecated configurations
- **Jakarta EE**: Complete namespace migration required

## Testing, Quality & Observability

### Test Framework
- **Unit Tests**: JUnit 4.13.2 (legacy) `(pom.xml:145-150)`
- **Integration Tests**: Spring Test 5.x (deprecated)
- **Coverage**: Not configured

### Code Quality
- **Static Analysis**: Designed to trigger 50+ migration violations
- **Linting**: Maven compiler warnings enabled
- **Code Style**: No automated formatting

### Observability
- **Logging**: SLF4J with DEBUG level `(application.properties:39-43)`
- **Metrics**: None configured
- **Health Checks**: Not implemented

## External Dependencies

### Spring Framework Dependencies
| Dependency | Version | Purpose | Migration Impact |
|------------|---------|---------|------------------|
| spring-context | 5.3.23 | Core framework | Major version upgrade |
| spring-webmvc | 5.3.23 | Web framework | Deprecated adapter patterns |
| spring-security-config | 5.7.5 | Security | Complete configuration rewrite |
| spring-data-jpa | 2.7.5 | Data access | Repository pattern changes |

### Third-Party Dependencies
- **H2 Database**: 2.1.214 (runtime)
- **AspectJ**: 1.9.7 (AOP support)
- **Jackson**: 2.13.4 (JSON processing)
- **Hibernate Validator**: 6.2.5.Final (validation)
