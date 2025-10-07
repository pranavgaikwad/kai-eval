# JBoss CMT Quickstart Architecture Specification

## Project Overview

**Project Name**: JBoss CMT (Container Managed Transactions) Quickstart
**Purpose**: Demonstrates Container-Managed Transactions in JBoss EAP
**Domain**: Enterprise Java application showcasing XA transactions across database and JMS resources
**Target Audience**: Enterprise developers learning CMT patterns
**Version**: 6.4.0-SNAPSHOT (pom.xml:23)

## Inventory & Layout

### Repository Structure
```
cmt/
├── pom.xml                              # Maven build configuration
├── README.md                            # Project documentation
├── src/
│   ├── main/
│   │   ├── java/
│   │   │   └── org/jboss/as/quickstarts/cmt/
│   │   │       ├── controller/          # JSF managed beans
│   │   │       ├── ejb/                 # Enterprise JavaBeans
│   │   │       ├── mdb/                 # Message-driven beans
│   │   │       └── model/               # JPA entities
│   │   ├── resources/
│   │   │   └── META-INF/
│   │   │       └── persistence.xml     # JPA configuration
│   │   └── webapp/
│   │       ├── *.xhtml                  # JSF views
│   │       └── WEB-INF/
│   │           ├── beans.xml            # CDI configuration
│   │           ├── faces-config.xml     # JSF navigation
│   │           ├── cmt-quickstart-ds.xml # DataSource definition
│   │           └── hornetq-jms.xml      # JMS queue definition
│   └── test/
│       └── java/                        # Unit tests
└── target/                              # Maven build output
```

### Technology Stack
- **Language**: Java 8 (pom.xml:48-49)
- **Framework**: Java EE 6/7 (EJB 3.1, JPA 2.0, JSF 2.1, JMS 1.1)
- **Application Server**: JBoss EAP 6.1+ (README.md:51)
- **Build Tool**: Maven 3.0+ (pom.xml:42-46)
- **Database**: PostgreSQL with XA support (cmt-quickstart-ds.xml:27-40)
- **Messaging**: HornetQ JMS (hornetq-jms.xml:18-26)
- **Testing**: JUnit 4.12 (pom.xml:104-109)

## High-Level Architecture

### Component Overview
The application implements a classic 3-tier enterprise architecture:

1. **Presentation Layer**: JSF 2.1 web interface
2. **Business Layer**: Stateless Session Beans with CMT
3. **Persistence Layer**: JPA 2.0 entities with PostgreSQL

### Architecture Diagram (Textual)
```
[JSF Views] → [JSF Managed Beans] → [EJB Layer] → [JPA Entities] → [PostgreSQL DB]
                                         ↓
                                   [JMS Producer] → [HornetQ] → [MDB Consumer]
```

### Dependency Graph
- CustomerManager (JSF) → CustomerManagerEJB
- CustomerManagerEJB → LogMessageManagerEJB + InvoiceManagerEJB
- InvoiceManagerEJB → JMS Queue → HelloWorldMDB
- All EJBs → JPA Entities → Database

## Detailed Component Catalog

### Presentation Layer

#### JSF Views (src/main/webapp/)
- **addCustomer.xhtml**: Customer registration form (addCustomer.xhtml:26-33)
- **customers.xhtml**: Customer listing page
- **logMessages.xhtml**: Log message listing page
- **duplicate.xhtml**: Duplicate customer error page
- **invalidName.xhtml**: Invalid name error page
- **template.xhtml**: Common layout template

#### Navigation Configuration
- **faces-config.xml**: Defines navigation rules between views (faces-config.xml:21-41)
  - customerAdded → customers.xhtml
  - customerDuplicate → duplicate.xhtml
  - customerInvalidName → invalidName.xhtml

### Business Layer

#### JSF Managed Beans (src/main/java/org/jboss/as/quickstarts/cmt/controller/)

**CustomerManager**
- **Role**: JSF controller for customer operations (CustomerManager.java:35-37)
- **Scope**: Request-scoped CDI bean
- **Dependencies**: CustomerManagerEJB injection (CustomerManager.java:40-41)
- **Public Interface**:
  - `getCustomers()`: List<Customer> (CustomerManager.java:43-45)
  - `addCustomer(String name)`: String navigation outcome (CustomerManager.java:48-61)

#### Enterprise JavaBeans (src/main/java/org/jboss/as/quickstarts/cmt/ejb/)

**CustomerManagerEJB**
- **Role**: Core business logic for customer management (CustomerManagerEJB.java:39-40)
- **Type**: Stateless Session Bean
- **Transaction Attributes**:
  - `createCustomer()`: REQUIRED (CustomerManagerEJB.java:51-67)
  - `listCustomers()`: NEVER (CustomerManagerEJB.java:86-90)
- **Dependencies**: LogMessageManagerEJB, InvoiceManagerEJB (CustomerManagerEJB.java:45-49)
- **Data Access**: EntityManager for Customer entities (CustomerManagerEJB.java:42-43)

**LogMessageManagerEJB**
- **Role**: Audit logging with independent transaction (LogMessageManagerEJB.java:37-38)
- **Type**: Stateless Session Bean
- **Transaction Attributes**:
  - `logCreateCustomer()`: REQUIRES_NEW (LogMessageManagerEJB.java:42-47)
  - `listLogMessages()`: NEVER (LogMessageManagerEJB.java:67-71)
- **Key Feature**: Creates new transaction to ensure log persistence even if main transaction fails

**InvoiceManagerEJB**
- **Role**: JMS message publishing for invoice notifications (InvoiceManagerEJB.java:31-32)
- **Type**: Stateless Session Bean
- **Transaction Attribute**: MANDATORY (InvoiceManagerEJB.java:40-51)
- **Resources**:
  - ConnectionFactory: java:/JmsXA (InvoiceManagerEJB.java:34-35)
  - Queue: java:/queue/CMTQueue (InvoiceManagerEJB.java:37-38)

#### Message-Driven Beans (src/main/java/org/jboss/as/quickstarts/cmt/mdb/)

**HelloWorldMDB**
- **Role**: Asynchronous message consumer for invoice notifications (HelloWorldMDB.java:36-39)
- **Type**: Message-Driven Bean
- **Configuration**:
  - Destination: queue/CMTQueue (HelloWorldMDB.java:38)
  - Acknowledge Mode: Auto-acknowledge (HelloWorldMDB.java:39)
- **Processing**: Logs received invoice messages (HelloWorldMDB.java:47-58)

### Persistence Layer

#### JPA Entities (src/main/java/org/jboss/as/quickstarts/cmt/model/)

**Customer Entity**
- **Table**: Customer (Customer.java:28)
- **Primary Key**: int id (auto-generated) (Customer.java:34-36)
- **Attributes**:
  - name: String (unique, not null) (Customer.java:38-39)
- **Business Rule**: Name validation via regex pattern `[\\p{L}-]+` (CustomerManagerEJB.java:69-71)

**LogMessage Entity**
- **Table**: LogMessage (LogMessage.java:28)
- **Primary Key**: int id (auto-generated) (LogMessage.java:32-34)
- **Attributes**:
  - message: String (unique, not null) (LogMessage.java:36-37)

## Data & Control Flow

### Primary Customer Creation Flow
1. **User Input**: JSF form submission from addCustomer.xhtml (addCustomer.xhtml:30-32)
2. **Controller**: CustomerManager.addCustomer() invoked (CustomerManager.java:48-61)
3. **Transaction Start**: Container begins CMT transaction (REQUIRED)
4. **Audit Log**: LogMessageManagerEJB.logCreateCustomer() in new transaction (REQUIRES_NEW)
5. **Customer Persistence**: Customer entity persisted to database (CustomerManagerEJB.java:55-57)
6. **Invoice Message**: JMS message sent to CMTQueue (CustomerManagerEJB.java:59)
7. **Validation**: Name validation check (CustomerManagerEJB.java:64-66)
8. **Transaction Commit/Rollback**: Based on validation outcome
9. **MDB Processing**: HelloWorldMDB processes invoice message asynchronously
10. **Navigation**: JSF outcome determines next view (faces-config.xml:21-41)

### Transaction Boundaries
- **Main Transaction**: Encompasses customer persistence and JMS message
- **Audit Transaction**: Independent REQUIRES_NEW transaction for log messages
- **Rollback Behavior**: Invalid names cause EJBException, rolling back main transaction but preserving audit log

### Error Handling Paths
- **Duplicate Customer**: Database constraint violation → customerDuplicate outcome
- **Invalid Name**: Regex validation failure → customerInvalidName outcome
- **Exception Logging**: CustomerManager catches and classifies exceptions (CustomerManager.java:52-60)

## APIs & Contracts

### JSF Managed Bean Interface
```java
// CustomerManager public methods
List<Customer> getCustomers() throws [various transaction exceptions]
String addCustomer(String name) // Returns JSF navigation outcome
```

### EJB Business Interface
```java
// CustomerManagerEJB
@TransactionAttribute(REQUIRED)
void createCustomer(String name) throws RemoteException, JMSException

@TransactionAttribute(NEVER)
List<Customer> listCustomers()

// LogMessageManagerEJB
@TransactionAttribute(REQUIRES_NEW)
void logCreateCustomer(String name) throws RemoteException, JMSException

// InvoiceManagerEJB
@TransactionAttribute(MANDATORY)
void createInvoice(String name) throws JMSException
```

### JMS Message Contract
- **Queue**: queue/CMTQueue (hornetq-jms.xml:21-23)
- **Message Type**: TextMessage
- **Content Format**: "Created invoice for customer named: {name}" (InvoiceManagerEJB.java:47)

## Persistence

### DataSource Configuration
- **JNDI Name**: java:jboss/datasources/CMTQuickstartDS (persistence.xml:28)
- **Type**: XA DataSource for distributed transactions (cmt-quickstart-ds.xml:27-40)
- **Database**: PostgreSQL
  - Server: localhost
  - Database: cmt-quickstart-database
  - Credentials: sa/sa (development only)

### JPA Configuration
- **Persistence Unit**: primary (persistence.xml:23)
- **Data Source**: CMTQuickstartDS (JTA-enabled)
- **Hibernate Properties**:
  - DDL: create-drop (persistence.xml:31)
  - SQL Logging: disabled (persistence.xml:32)

### Database Schema
- **Customer Table**: id (PK), name (unique)
- **LogMessage Table**: id (PK), message (unique)
- **Auto-generation**: Hibernate sequence for primary keys

## Configuration, Secrets, & Environments

### Application Configuration Files
- **persistence.xml**: JPA persistence unit configuration (persistence.xml:23-34)
- **beans.xml**: CDI bean discovery marker (beans.xml:17-21)
- **faces-config.xml**: JSF navigation rules (faces-config.xml:21-41)
- **cmt-quickstart-ds.xml**: DataSource definition (cmt-quickstart-ds.xml:27-40)
- **hornetq-jms.xml**: JMS queue configuration (hornetq-jms.xml:20-24)

### Environment Variables
- **JBOSS_HOME**: JBoss EAP installation path (README.md:65)
- **Configuration Requirements**: PostgreSQL database setup (README.md:68-77)

### Development vs Production
- **Development**: Uses -ds.xml datasource files (deprecated for production) (README.md:25)
- **Production**: Should use Management CLI/Console for datasource configuration

## Build, Run, Deploy

### Build Commands
```bash
# Build and deploy
mvn clean install jboss-as:deploy

# Run tests
mvn test

# Undeploy
mvn jboss-as:undeploy
```

### Prerequisites
- Java 6.0+ (Java SDK 1.6) (README.md:53)
- Maven 3.0+ (README.md:53)
- JBoss EAP 6.1+ (README.md:51)
- PostgreSQL database (README.md:68-77)

### Server Configuration
- **Profile**: standalone-full.xml (required for messaging) (README.md:86-87)
- **PostgreSQL Module**: Must be added to JBoss EAP (README.md:76)
- **Driver Configuration**: PostgreSQL driver registration required (README.md:77)

### Deployment Artifact
- **WAR**: target/jboss-cmt.war (pom.xml:115)
- **Context Root**: /jboss-cmt (README.md:107)
- **Access URL**: http://localhost:8080/jboss-cmt/

## Security & Compliance

### Security Model
- **Authentication**: None implemented (demonstration application)
- **Authorization**: None implemented
- **Input Validation**: Name regex validation only (CustomerManagerEJB.java:69-71)
- **SQL Injection**: Protected via JPA/Hibernate parameterized queries

### Compliance Considerations
- **License**: Apache License 2.0 (pom.xml:28-34)
- **Security Gaps**: No authentication/authorization for production use
- **Data Protection**: Development credentials hardcoded (not production-ready)

## Testing, Quality & Observability

### Testing Framework
- **Unit Tests**: JUnit 4.12 (pom.xml:104-109)
- **Test Coverage**: Limited to name validation (CustomerManagerEJBTest.java:24-31)
- **Test Cases**:
  - Valid names: "Jan", "Jan-Piet", "gefräßig"
  - Invalid names: "Jan1", "Jan_Piet"

### Code Quality
- **Build Plugin**: Maven Compiler Plugin 3.11.0 (pom.xml:118-127)
- **Java Version**: 1.8 source/target (pom.xml:48-49)
- **Static Analysis**: None configured

### Observability
- **Logging**: java.util.logging.Logger (CustomerManager.java:38, HelloWorldMDB.java:42)
- **Log Levels**: INFO for message processing, WARNING for errors
- **Monitoring**: None implemented
- **Health Checks**: None implemented

## External Dependencies

### JBoss EAP Provided Dependencies (scope: provided)
- **Transaction API**: jboss-transaction-api_1.1_spec 1.0.1.Final (pom.xml:54-59)
- **JSF API**: jboss-jsf-api_2.1_spec 2.1.28.Final (pom.xml:61-66)
- **JPA API**: hibernate-jpa-2.0-api 1.0.1.Final (pom.xml:68-73)
- **JMS API**: jboss-jms-api_1.1_spec 1.0.1.Final (pom.xml:75-80)
- **EJB API**: jboss-ejb-api_3.1_spec 1.0.2.Final (pom.xml:82-87)
- **CDI**: javax.inject 1 (pom.xml:89-94)

### External Services
- **Database**: PostgreSQL server (localhost:5432)
- **Messaging**: HornetQ (embedded in JBoss EAP)

### Failure Modes
- **Database Unavailable**: Application fails to start due to datasource connection failure
- **Queue Unavailable**: JMS operations fail, transactions rollback
- **Transaction Manager Issues**: XA transaction coordination failures
