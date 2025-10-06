# Spring Framework Petclinic - Architecture Specification

## Inventory & Layout

### Repository Structure
```
spring-framework-petclinic/
├── src/
│   ├── main/
│   │   ├── java/org/springframework/samples/petclinic/
│   │   │   ├── config/          # Spring configuration classes
│   │   │   ├── model/           # Domain model entities
│   │   │   ├── repository/      # Data access layer (3 implementations)
│   │   │   │   ├── jdbc/        # Plain JDBC implementation
│   │   │   │   ├── jpa/         # JPA implementation
│   │   │   │   └── springdatajpa/ # Spring Data JPA implementation
│   │   │   ├── service/         # Business logic layer
│   │   │   ├── util/            # Utility classes
│   │   │   ├── web/             # MVC controllers and formatters
│   │   │   └── PetclinicInitializer.java # Application entry point
│   │   ├── resources/
│   │   │   ├── cache/           # EhCache configuration
│   │   │   ├── db/              # Database scripts (H2, MySQL, PostgreSQL)
│   │   │   ├── messages/        # Internationalization files
│   │   │   ├── session/         # Session configuration
│   │   │   └── spring/          # Spring configuration files
│   │   ├── webapp/
│   │   │   ├── resources/       # Static assets (CSS, JS, images)
│   │   │   └── WEB-INF/         # JSP views and tags
│   │   └── wro/                 # Web Resource Optimizer config
│   └── test/                    # Test sources
├── .github/workflows/           # CI/CD pipeline
├── pom.xml                      # Maven build configuration
└── readme.md                    # Project documentation
```

**Citation**: Repository structure evident from directory listing (src:1-45)

### Technology Stack
- **Language**: Java 8+ (pom.xml:19)
- **Framework**: Spring Framework 5.3.12 (pom.xml:30)
- **Build Tool**: Maven 3.3+ with wrapper (mvnw, pom.xml:1-603)
- **Web Container**: Jetty 9.4+ or Tomcat 9+ (readme.md:113, pom.xml:41)
- **View Technology**: JSP with JSTL (pom.xml:137-138)
- **Package Manager**: Maven with WebJars for frontend dependencies (pom.xml:252-267)

## Purpose & Domain

### Project Purpose
Spring Petclinic is a veterinary clinic management system demonstrating Spring Framework's 3-layer architecture (presentation → service → repository) using plain Spring configuration without Spring Boot (readme.md:8-9).

**Citation**: "3-layer architecture (i.e. presentation --> service --> repository)" (readme.md:9)

### Core Business Entities
The domain model centers around veterinary clinic operations:

| Entity | Purpose | Key Relationships |
|--------|---------|------------------|
| **Owner** | Pet owners with contact information | One-to-many with Pet (Owner.java:60) |
| **Pet** | Animals with birth date and type | Many-to-one with Owner, one-to-many with Visit (Pet.java:53-62) |
| **Visit** | Veterinary appointments with descriptions | Many-to-one with Pet (Visit.java:54-56) |
| **Vet** | Veterinarians with specialties | Many-to-many with Specialty (Vet.java:47-50) |
| **Specialty** | Medical specializations | Many-to-many with Vet |
| **PetType** | Animal categories (cat, dog, etc.) | One-to-many with Pet |

**Citations**: Entity relationships defined in JPA annotations throughout model package

## High-Level Architecture

### Architecture Overview
The application follows a traditional 3-layer Spring MVC architecture:

```
┌─────────────────┐
│   Web Layer     │ ← Controllers, Validators, Formatters
├─────────────────┤
│  Service Layer  │ ← Business Logic Facade
├─────────────────┤
│Repository Layer │ ← Data Access (3 implementations)
└─────────────────┘
```

### Component Interaction
- **Web Controllers** → **ClinicService** → **Repository Interfaces** → **Database**
- **Session Management** via Hazelcast for clustering
- **Caching** via EhCache for performance
- **Validation** via Bean Validation/Hibernate Validator

**Citation**: Service facade pattern implemented in ClinicService.java:28-29 "Mostly used as a facade so all controllers have a single point of entry"

## Detailed Component Catalog

### Web Layer Components

| Component | Role | Key Files | Dependencies |
|-----------|------|-----------|--------------|
| **OwnerController** | Owner CRUD operations | OwnerController.java:39 | ClinicService |
| **PetController** | Pet management | PetController.java | ClinicService |
| **VetController** | Veterinarian listings | VetController.java | ClinicService |
| **VisitController** | Visit scheduling | VisitController.java | ClinicService |

**Public Interfaces**:
- `GET /owners/find` - Owner search form
- `POST /owners/new` - Create owner
- `GET /owners/{id}` - View owner details
- `GET /vets` - List veterinarians

**Citation**: Controller mappings defined via @GetMapping/@PostMapping annotations in web package

### Service Layer
- **ClinicService**: Single facade interface providing all business operations (ClinicService.java:32)
- **ClinicServiceImpl**: Implementation with caching and transaction management

### Repository Layer
Three interchangeable persistence implementations:

| Implementation | Technology | Profile | Configuration |
|----------------|------------|---------|---------------|
| **JPA** | Hibernate + JPA | `jpa` (default) | JpaConfig.java |
| **JDBC** | Spring JDBC Templates | `jdbc` | JdbcConfig.java |
| **Spring Data JPA** | Spring Data repositories | `spring-data-jpa` | SpringDataJpaConfig.java |

**Citation**: Profile selection in PetclinicInitializer.java:54 with default "jpa"

## Data & Control Flow

### Typical Request Flow
1. **HTTP Request** → DispatcherServlet
2. **Controller** validates input, calls ClinicService
3. **Service** applies business logic, calls Repository
4. **Repository** executes database operations
5. **View** renders JSP with model data

### Error Handling
- **CrashController** demonstrates error handling (CrashController.java)
- Bean validation errors returned to forms
- Global exception handling via Spring MVC

### Caching Strategy
- **EhCache** configuration for service layer caching (cache/ehcache.xml)
- Method-level caching annotations on service operations

**Citation**: Cache configuration referenced in ToolsConfig.java and service implementations

## APIs & Contracts

### REST Endpoints

| Method | Path | Purpose | Response |
|--------|------|---------|----------|
| GET | `/owners/find` | Owner search form | JSP view |
| GET | `/owners` | Search owners | Redirect or list |
| POST | `/owners/new` | Create owner | Redirect to details |
| GET | `/owners/{id}` | Owner details | JSP with pets |
| GET | `/vets` | List veterinarians | JSP or XML |

### Service Interface
```java
public interface ClinicService {
    Collection<PetType> findPetTypes();
    Owner findOwnerById(int id);
    Pet findPetById(int id);
    void savePet(Pet pet);
    void saveVisit(Visit visit);
    Collection<Vet> findVets();
    void saveOwner(Owner owner);
    Collection<Owner> findOwnerByLastName(String lastName);
    Collection<Visit> findVisitsByPetId(int petId);
}
```

**Citation**: Complete interface defined in ClinicService.java:32-52

## Persistence

### Database Schema
```sql
owners (id, first_name, last_name, address, city, telephone)
pets (id, name, birth_date, type_id, owner_id)
visits (id, pet_id, visit_date, description)
vets (id, first_name, last_name)
specialties (id, name)
vet_specialties (vet_id, specialty_id)
types (id, name)
```

**Citation**: Schema defined in src/main/resources/db/h2/schema.sql:10-64

### Database Support Matrix

| Database | Profile | Driver | URL Pattern |
|----------|---------|--------|-------------|
| **H2** | `H2` (default) | `org.h2.Driver` | `jdbc:h2:mem:petclinic` |
| **MySQL** | `MySQL` | `com.mysql.cj.jdbc.Driver` | `jdbc:mysql://localhost:3306/petclinic` |
| **PostgreSQL** | `PostgreSQL` | `org.postgresql.Driver` | `jdbc:postgresql://localhost:5432/petclinic` |

**Citation**: Database profiles defined in pom.xml:512-592

### ORM Configuration
- **Hibernate 5.6.0** as JPA provider (pom.xml:51)
- **Entity mapping** via JPA annotations
- **Validation** via Hibernate Validator 6.2.0 (pom.xml:52)

## Configuration, Secrets, & Environments

### Configuration Structure
- **Root Context**: BusinessConfig, ToolsConfig, SessionConfiguration (RootApplicationContextConfig.java:43)
- **Web Context**: MvcCoreConfig for Spring MVC setup
- **Profiles**: `jpa`, `jdbc`, `spring-data-jpa` for persistence layers

### Property Sources
- `spring/data-access.properties` - Database configuration (DataSourceConfig.java:45)
- `session/session.properties` - Session management
- `messages/messages*.properties` - Internationalization

### Environment Variables
Database connection configured via Maven profiles with properties:
- `jdbc.driverClassName`
- `jdbc.url`
- `jdbc.username`
- `jdbc.password`

**Citation**: Property resolution in data-access.properties:13-16

## Build, Run, Deploy

### Local Development
```bash
./mvnw jetty:run-war                    # Default H2 database
./mvnw jetty:run-war -P MySQL           # MySQL profile
./mvnw jetty:run-war -P PostgreSQL      # PostgreSQL profile
```

**Citation**: Commands documented in readme.md:23-25, 51, 75

### Docker Support
- **Runtime**: `docker run -p 8080:8080 springcommunity/spring-framework-petclinic`
- **Build**: Google Jib plugin for optimized Docker images (pom.xml:494-507)
- **Base Image**: Distroless Jetty (readme.md:185)

### CI/CD Pipeline
GitHub Actions workflow:
- **Trigger**: Push/PR to master branch
- **JDK**: AdoptOpenJDK 11
- **Build**: `mvn -B package --file pom.xml`
- **Quality**: SonarCloud integration for code quality

**Citation**: CI configuration in .github/workflows/maven-build.yml:4-26

## Security & Compliance

### Security Assessment
- **Authentication**: None implemented - public application
- **Authorization**: None implemented - no access controls
- **Input Validation**: Bean Validation for form inputs
- **CSRF Protection**: Standard Spring MVC CSRF handling
- **Session Security**: Hazelcast-backed session clustering with cookie configuration

**Citation**: No security annotations found in codebase search; SessionConfiguration.java:84-101 shows cookie setup

### Session Management
- **Hazelcast** clustering for session persistence (SessionConfiguration.java:34)
- **Session Timeout**: 900 seconds (15 minutes) (SessionConfiguration.java:49)
- **Cookie Security**: Configurable via ServletContext (SessionConfiguration.java:86-101)

### Data Protection
- **Connection Pooling**: Tomcat JDBC pool (DataSourceConfig.java:57)
- **Character Encoding**: UTF-8 filter (PetclinicInitializer.java:79)

## Testing, Quality & Observability

### Test Strategy
- **Unit Tests**: 12 test classes covering controllers and services
- **Integration Tests**: Abstract base class for service layer testing (AbstractClinicServiceTests.java:53)
- **Test Profiles**: Separate configurations for different persistence layers

**Citation**: Test structure in src/test directory; test count from file listing

### Test Framework Stack
- **JUnit Jupiter 5.8.1** for test execution (pom.xml:69)
- **AssertJ 3.21.0** for fluent assertions (pom.xml:65)
- **Mockito 4.0.0** for mocking (pom.xml:67)
- **Spring Test** for integration testing (pom.xml:272-275)

### Quality Measures
- **Code Coverage**: JaCoCo Maven plugin (pom.xml:422-439)
- **Static Analysis**: SonarCloud integration
- **Linting**: Editor config for consistent formatting (.editorconfig)

### Observability
- **Logging**: SLF4J with Logback (pom.xml:223-232)
- **Monitoring**: Application startup logging in RootApplicationContextConfig.java:59-68
- **JMX**: Available via Spring framework

## External Dependencies

### Key Dependencies

| Category | Dependency | Version | Purpose |
|----------|------------|---------|---------|
| **Core** | Spring Framework | 5.3.12 | Application framework |
| **Persistence** | Hibernate | 5.6.0 | ORM implementation |
| **Web** | Spring MVC | 5.3.12 | Web layer |
| **Session** | Hazelcast | 4.2.2 | Session clustering |
| **Frontend** | Bootstrap | 3.3.6 | UI framework |
| **Build** | WRO4J | 1.8.0 | Resource optimization |

**Citation**: Versions specified in pom.xml properties section:16-93

### Frontend Assets
- **jQuery 3.5.1** and **jQuery UI 1.12.1** via WebJars (pom.xml:256-262)
- **Bootstrap 3.3.6** for responsive design (pom.xml:265-267)
- **CSS compilation** via LESS and WRO4J (pom.xml:452-485)

---