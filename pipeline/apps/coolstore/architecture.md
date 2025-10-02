# CoolStore Monolith Architecture Specification

## Executive Summary

CoolStore is a Java EE 7 monolithic e-commerce application demonstrating a traditional multi-tier architecture. It implements a product catalog, shopping cart, and order processing system with Keycloak SSO integration, JMS messaging, and PostgreSQL persistence.

## Inventory & Layout

### Repository Structure
```
/
├── README.md                      # Deployment and setup instructions
├── pom.xml                       # Maven build configuration (Java EE 7)
├── realm-export.json             # Keycloak realm configuration
├── assets/                       # Static assets (logos, screenshots)
├── src/main/
│   ├── java/com/redhat/coolstore/
│   │   ├── model/                # Domain models and JPA entities
│   │   ├── rest/                 # JAX-RS REST endpoints
│   │   ├── service/              # Business logic and EJB services
│   │   └── utils/                # Utility classes and transformers
│   ├── resources/
│   │   ├── META-INF/persistence.xml  # JPA configuration
│   │   └── db/migration/         # Flyway database migrations
│   └── webapp/
│       ├── WEB-INF/              # Web application configuration
│       ├── app/                  # AngularJS frontend application
│       ├── bower_components/     # Frontend dependencies
│       └── index.jsp             # Main application entry point
```

### Technology Stack
- **Backend**: Java EE 7, JBoss EAP 7.4
- **Frontend**: AngularJS 1.x, PatternFly UI
- **Database**: PostgreSQL with Flyway migrations
- **Authentication**: Keycloak v20.0.5
- **Messaging**: JMS/ActiveMQ
- **Build**: Maven 3.8.5, Java 8
- **Container**: JBoss EAP 7.4 (WildFly)

*pom.xml:5-28, README.md:8-12*

## Purpose & Domain

### Application Purpose
CoolStore is a demonstration e-commerce application showcasing Red Hat middleware technologies. It implements a complete online store with product browsing, cart management, order processing, and user authentication.

*README.md:1-3, index.jsp:10*

### Core Business Entities
- **Product**: Catalog items with pricing and inventory
- **ShoppingCart**: User session-based shopping cart
- **Order**: Completed purchase transactions
- **Inventory**: Stock levels and warehouse locations
- **Promotion**: Discount rules and pricing adjustments

*src/main/java/com/redhat/coolstore/model/*

### Domain Concepts
- Product catalog management with inventory tracking
- Session-based shopping cart with promotional pricing
- Asynchronous order processing via JMS messaging
- Multi-location inventory management
- SSO authentication integration

## High-Level Architecture

### Architecture Pattern
**Monolithic 3-Tier Architecture**:
1. **Presentation Tier**: AngularJS SPA with PatternFly UI
2. **Business Tier**: Java EE services (EJBs, JAX-RS)
3. **Data Tier**: PostgreSQL with JPA/Hibernate

### Component Interaction
```
Frontend (AngularJS) → REST API (JAX-RS) → Services (EJB) → Database (PostgreSQL)
                                      ↓
                               JMS Topics (Orders)
                                      ↓
                              Message Processors
```

### Key Components
- **ProductEndpoint**: Product catalog REST API
- **CartEndpoint**: Shopping cart management API
- **OrderEndpoint**: Order processing API
- **ShoppingCartService**: Cart business logic
- **OrderServiceMDB**: Asynchronous order processing
- **CatalogService**: Product and inventory management

*src/main/java/com/redhat/coolstore/rest/, src/main/java/com/redhat/coolstore/service/*

## Detailed Component Catalog

### REST API Layer (`/rest`)

#### ProductEndpoint
- **Role**: Product catalog API
- **Endpoints**:
  - `GET /products/` - List all products
  - `GET /products/{itemId}` - Get specific product
- **Dependencies**: ProductService
- **Data**: Product catalog with inventory

*src/main/java/com/redhat/coolstore/rest/ProductEndpoint.java:29-39*

#### CartEndpoint
- **Role**: Shopping cart management
- **Endpoints**:
  - `GET /cart/{cartId}` - Retrieve cart
  - `POST /cart/{cartId}/{itemId}/{quantity}` - Add item
  - `DELETE /cart/{cartId}/{itemId}/{quantity}` - Remove item
  - `POST /cart/checkout/{cartId}` - Process checkout
- **Dependencies**: ShoppingCartService
- **Scope**: Session-scoped for user isolation

*src/main/java/com/redhat/coolstore/rest/CartEndpoint.java:33-123*

### Service Layer (`/service`)

#### ShoppingCartService
- **Role**: Shopping cart business logic
- **Type**: Stateful EJB
- **Key Functions**:
  - Cart pricing with promotions
  - Shipping cost calculation
  - Remote shipping service integration
- **Dependencies**: ProductService, PromoService, ShippingServiceRemote

*src/main/java/com/redhat/coolstore/service/ShoppingCartService.java:16-126*

#### PromoService
- **Role**: Promotional pricing engine
- **Type**: Application-scoped service
- **Features**:
  - Item-specific discounts (25% off item 329299)
  - Shipping promotions (free shipping >$75)
- **Configuration**: Hardcoded promotion rules

*src/main/java/com/redhat/coolstore/service/PromoService.java:28, 68*

#### OrderServiceMDB
- **Role**: Asynchronous order processing
- **Type**: Message-Driven Bean
- **Topic**: `topic/orders`
- **Functions**:
  - Order persistence
  - Inventory updates
  - JSON-to-Order transformation

*src/main/java/com/redhat/coolstore/service/OrderServiceMDB.java:14-46*

### Data Model (`/model`)

#### Domain Objects
- **Product**: Transient product representation
- **ShoppingCart**: Session-managed cart with totals
- **ShoppingCartItem**: Line items with pricing
- **Order**: Persisted order records
- **Promotion**: Discount rules

#### JPA Entities
- **CatalogItemEntity**: Product catalog table mapping
- **InventoryEntity**: Stock and location data
- **Relationships**: One-to-one catalog-to-inventory

*src/main/java/com/redhat/coolstore/model/CatalogItemEntity.java:24-26*

### Frontend Application (`/webapp/app`)

#### AngularJS Architecture
- **Module**: 'app' with routing and PatternFly
- **Controllers**: HomeController, CartController
- **Services**: catalog.js, cart.js
- **Authentication**: Keycloak integration

*src/main/webapp/app/app.js:3-13*

## Data & Control Flow

### Typical Request Flow
1. **Product Browsing**:
   ```
   AngularJS → ProductEndpoint → ProductService → CatalogService → Database
   ```

2. **Add to Cart**:
   ```
   Frontend → CartEndpoint.add() → ShoppingCartService.priceShoppingCart() → PromoService
   ```

3. **Checkout Process**:
   ```
   Frontend → CartEndpoint.checkout() → ShoppingCartOrderProcessor → JMS Topic → OrderServiceMDB
   ```

### Messaging Flow
- **Order Processing**: Asynchronous via JMS topic `topic/orders`
- **Message Format**: JSON order payload
- **Processing**: OrderServiceMDB consumes messages for persistence and inventory updates

*src/main/java/com/redhat/coolstore/service/OrderServiceMDB.java:27-45*

## APIs & Contracts

### REST Endpoints

| Method | Endpoint | Purpose | Request | Response |
|--------|----------|---------|---------|----------|
| GET | `/products/` | List products | - | Product[] |
| GET | `/products/{itemId}` | Get product | itemId | Product |
| GET | `/cart/{cartId}` | Get cart | cartId | ShoppingCart |
| POST | `/cart/{cartId}/{itemId}/{quantity}` | Add to cart | path params | ShoppingCart |
| DELETE | `/cart/{cartId}/{itemId}/{quantity}` | Remove from cart | path params | ShoppingCart |
| POST | `/cart/checkout/{cartId}` | Checkout | cartId | ShoppingCart |

### Message Contracts
- **Topic**: `topic/orders`
- **Format**: JSON with order details, customer info, and line items
- **Schema**: orderValue, customerName, customerEmail, items array

*src/main/java/com/redhat/coolstore/utils/Transformers.java:48-74*

## Persistence

### Database Schema
```sql
-- Core Tables
PRODUCT_CATALOG (itemId, name, description, price)
INVENTORY (itemId, location, quantity, link)
ORDERS (orderId, customerName, customerEmail, orderValue, ...)
ORDER_ITEMS (ID, productId, quantity, ORDER_ID)
```

### JPA Configuration
- **Persistence Unit**: "primary"
- **Data Source**: `java:jboss/datasources/CoolstoreDS`
- **ORM**: Hibernate with JTA transactions
- **Schema Management**: Flyway migrations

*src/main/resources/META-INF/persistence.xml:7-8, src/main/resources/db/migration/V1_1__CreateSchema.sql:1-42*

### Sample Data
- 9 products including Quarkus T-shirts, Red Hat merchandise
- Inventory distributed across Raleigh and Tokyo locations
- Price range: $2.75 - $14.45

*src/main/resources/db/migration/V1_2__AddInitialData.sql:1-20*

## Configuration, Secrets, & Environments

### Application Configuration
- **Web Deployment**: Distributable sessions enabled
- **JPA**: Hibernate with PostgreSQL driver
- **JMS**: ActiveMQ topic configuration
- **Session**: HTTP session-based cart storage

*src/main/webapp/WEB-INF/web.xml:5*

### External Dependencies
- **PostgreSQL**: Database connection via JNDI
- **Keycloak**: SSO authentication server
- **ActiveMQ**: JMS message broker (embedded in JBoss)

### Environment Variables
- `JBOSS_HOME`: JBoss installation path
- Database connection: `jdbc:postgresql://127.0.0.1:5432/postgresDB`
- Keycloak URL: `http://127.0.0.1:8081`

*README.md:123-125*

## Build, Run, Deploy

### Build Process
```bash
mvn package                    # Creates ROOT.war
```
- **Output**: `target/ROOT.war`
- **Java Version**: 1.8
- **Test**: Skipped (`maven.test.skip=true`)

*pom.xml:46-63*

### Local Development
1. **Database**: PostgreSQL via Docker/Podman
2. **Keycloak**: Standalone server on port 8081
3. **Application Server**: JBoss EAP 7.4 full-HA mode
4. **Deployment**: CLI deployment of WAR file

*README.md:14-133*

### Clustering Support
- **High Availability**: JBoss clustering enabled
- **Session Replication**: Distributable web sessions
- **Message Distribution**: ActiveMQ clustering
- **Multiple Nodes**: Port offset configuration

*README.md:145-170*

## Security & Compliance

### Authentication & Authorization
- **SSO**: Keycloak integration with realm "eap"
- **Token**: Bearer token authentication
- **Session**: 300s access token lifetime
- **Realm Config**: Pre-configured client settings

*realm-export.json:8, src/main/webapp/app/app.js:82-88*

### Security Considerations
- **HTTPS**: Not configured (development setup)
- **Input Validation**: Basic JAX-RS validation
- **Session Management**: HTTP sessions with clustering
- **Secrets**: Hardcoded database credentials (dev environment)

## Testing, Quality & Observability

### Testing
- **Unit Tests**: Disabled (`maven.test.skip=true`)
- **Integration**: Manual testing via UI
- **Load Testing**: Multi-node clustering verification

### Observability
- **Logging**: Java Util Logging
- **Monitoring**: JBoss management console
- **Health Check**: Basic health.jsp endpoint
- **Tracing**: Order processing via console output

*src/main/java/com/redhat/coolstore/service/OrderServiceMDB.java:28-36*

## External Dependencies

### Third-Party Services
- **PostgreSQL**: Primary data store
- **Keycloak**: Identity and access management
- **ActiveMQ**: Message broker (embedded)

### Frontend Dependencies
- **AngularJS**: 1.x framework
- **PatternFly**: Red Hat UI component library
- **Bootstrap**: CSS framework
- **jQuery**: DOM manipulation

*src/main/webapp/index.jsp:11-22*

### Java Dependencies
- **Java EE 7**: Web and enterprise APIs
- **Flyway**: Database migration tool
- **JBoss Specs**: JMS and RMI implementations

*pom.xml:17-44*
