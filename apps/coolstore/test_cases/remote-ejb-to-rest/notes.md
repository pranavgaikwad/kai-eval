# Remote EJB to REST Migration Fix Notes

## Summary

**Issue ID**: Remote EJB Migration
**Target Technology**: Quarkus
**Change Contract**: Replace `@Remote` EJB with REST service and create dedicated `@RestClient` interface. This approach preserves the original business interface while creating a clean REST client layer for transport concerns.

## Affected Surface Area

### Components/Modules Touched
- **ShippingService**: Convert EJB to REST service (`src/main/java/com/redhat/coolstore/service/ShippingService.java:11-13`)
- **ShippingServiceRemote**: Keep unchanged as business interface (`src/main/java/com/redhat/coolstore/service/ShippingServiceRemote.java`)
- **ShippingServiceClient**: New REST client interface (`src/main/java/com/redhat/coolstore/rest/client/ShippingServiceClient.java` - to be created)
- **ShoppingCartService**: Replace JNDI lookup with `@RestClient` injection (`src/main/java/com/redhat/coolstore/service/ShoppingCartService.java:114-125`)

### Entry Points and Public APIs
- **New REST Endpoints**: `/rest/shipping/calculate` and `/rest/shipping/insurance`
- **New REST Client**: Named client `shipping-service-api` for clean configuration
- **Preserved Interface**: `ShippingServiceRemote` business contract unchanged
- **Business Logic**: Shipping calculations remain identical

### Map of Direct vs. Indirect Occurrences
- **Direct**: `@Remote` and `@Stateless` annotations on `ShippingService` (`ShippingService.java:11-12`)
- **Direct**: JNDI lookup method in `ShoppingCartService` (`ShoppingCartService.java:114-125`)
- **Preserved**: Business interface calls in `ShoppingCartService.priceShoppingCart()` (`ShoppingCartService.java:72,76`)

## Per-File Change Plan

### File: src/main/java/com/redhat/coolstore/service/ShippingService.java

**Path**: src/main/java/com/redhat/coolstore/service/ShippingService.java
**Reason**: Convert @Remote EJB to REST service while preserving business logic

**Exact Changes**:
- Remove `@Stateless` annotation (`ShippingService.java:11`)
- Replace `@Remote` annotation with `@jakarta.ws.rs.Path("/shipping")` (`ShippingService.java:12`)
- Keep `implements ShippingServiceRemote` to maintain business interface contract (`ShippingService.java:13`)
- Add imports: `import jakarta.ws.rs.*;`, `import jakarta.ws.rs.core.MediaType;`
- Annotate `calculateShipping()` method with `@POST @Path("/calculate") @Consumes(MediaType.APPLICATION_JSON) @Produces(MediaType.APPLICATION_JSON)` (`ShippingService.java:16`)
- Annotate `calculateShippingInsurance()` method with `@POST @Path("/insurance") @Consumes(MediaType.APPLICATION_JSON) @Produces(MediaType.APPLICATION_JSON)` (`ShippingService.java:49`)

**Citations**:
- Before: `ShippingService.java:11-13` (EJB annotations and interface)
- Before: `ShippingService.java:16,49` (method declarations)
- After: REST annotations added while preserving interface implementation

**Notes**: All business logic in shipping calculation methods remains completely unchanged to preserve tier calculations and insurance percentages.

### File: src/main/java/com/redhat/coolstore/rest/client/ShippingServiceClient.java (NEW)

**Path**: src/main/java/com/redhat/coolstore/rest/client/ShippingServiceClient.java
**Reason**: Create dedicated REST client interface for clean separation of transport and business concerns

**Exact Changes**:
- Create new file with package `com.redhat.coolstore.rest.client`
- Define interface with same method signatures as `ShippingServiceRemote`:
  ```java
  package com.redhat.coolstore.rest.client;

  import com.redhat.coolstore.model.ShoppingCart;
  import jakarta.ws.rs.*;
  import jakarta.ws.rs.core.MediaType;
  import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;

  @Path("/shipping")
  @RegisterRestClient(configKey = "shipping-service-api")
  @Produces(MediaType.APPLICATION_JSON)
  @Consumes(MediaType.APPLICATION_JSON)
  public interface ShippingServiceClient {

      @POST
      @Path("/calculate")
      double calculateShipping(ShoppingCart sc);

      @POST
      @Path("/insurance")
      double calculateShippingInsurance(ShoppingCart sc);
  }
  ```

**Citations**:
- Before: N/A (new file)
- After: `ShippingServiceClient.java:1-21` (complete new interface)

**Notes**: Method signatures exactly match `ShippingServiceRemote.java:6-7` to ensure contract compatibility.

### File: src/main/java/com/redhat/coolstore/service/ShippingServiceRemote.java

**Path**: src/main/java/com/redhat/coolstore/service/ShippingServiceRemote.java
**Reason**: Keep unchanged as pure business interface, separating transport concerns

**Exact Changes**:
- **NO CHANGES** - interface remains exactly as-is
- This preserves the business interface contract completely

**Citations**:
- Before: `ShippingServiceRemote.java:5-8` (unchanged interface)
- After: `ShippingServiceRemote.java:5-8` (identical interface)

**Notes**: By keeping this interface unchanged, we maintain clear separation between business contracts and transport implementation.

### File: src/main/java/com/redhat/coolstore/service/ShoppingCartService.java

**Path**: src/main/java/com/redhat/coolstore/service/ShoppingCartService.java
**Reason**: Replace JNDI lookup with Quarkus @RestClient injection using new client interface

**Exact Changes**:
- Remove `lookupShippingServiceRemote()` method entirely (`ShoppingCartService.java:114-125`)
- Remove JNDI imports: `javax.naming.Context`, `javax.naming.InitialContext`, `javax.naming.NamingException` (`ShoppingCartService.java:8-10`)
- Remove `java.util.Hashtable` import (`ShoppingCartService.java:3`)
- Add import: `import com.redhat.coolstore.rest.client.ShippingServiceClient;`
- Add import: `import org.eclipse.microprofile.rest.client.inject.RestClient;`
- Add `@RestClient` field after existing `@Inject` fields:
  ```java
  @Inject
  @RestClient
  ShippingServiceClient shippingServiceClient;
  ```
- Replace `lookupShippingServiceRemote().calculateShipping(sc)` with `shippingServiceClient.calculateShipping(sc)` (`ShoppingCartService.java:72`)
- Replace `lookupShippingServiceRemote().calculateShippingInsurance(sc)` with `shippingServiceClient.calculateShippingInsurance(sc)` (`ShoppingCartService.java:76`)

**Citations**:
- Before: `ShoppingCartService.java:3,8-10` (JNDI-related imports)
- Before: `ShoppingCartService.java:72,76` (method calls via JNDI lookup)
- Before: `ShoppingCartService.java:114-125` (JNDI lookup method)
- After: REST client injection field and direct method calls

**Notes**: The `priceShoppingCart()` method logic flow remains identical - only the service acquisition mechanism changes from JNDI to injection.

### File: Dependencies and Build Configuration (pom.xml)

**Path**: pom.xml
**Reason**: Add Quarkus REST client dependencies for @RestClient support

**Exact Changes**:
- Add Quarkus REST client dependency:
  ```xml
  <dependency>
      <groupId>io.quarkus</groupId>
      <artifactId>quarkus-rest-client-jackson</artifactId>
  </dependency>
  ```
- Add Quarkus REST dependency:
  ```xml
  <dependency>
      <groupId>io.quarkus</groupId>
      <artifactId>quarkus-rest-jackson</artifactId>
  </dependency>
  ```

**Citations**:
- Before: `pom.xml:19-46` (existing dependencies)
- After: Additional Quarkus dependencies for REST client support

**Notes**: These dependencies provide both REST service and REST client capabilities with Jackson JSON support.

### File: Quarkus Configuration (src/main/resources/application.properties)

**Path**: src/main/resources/application.properties
**Reason**: Configure named REST client with clean configuration key

**Exact Changes**:
- Add REST client configuration:
  ```properties
  # Shipping Service REST Client Configuration
  quarkus.rest-client.shipping-service-api.url=http://localhost:8080/services
  quarkus.rest-client.shipping-service-api.scope=javax.inject.Singleton
  ```

**Citations**:
- Before: Configuration file may not exist or may not contain REST client config
- After: Named REST client configuration with `shipping-service-api` key

**Notes**: The `shipping-service-api` key matches the `configKey` in `@RegisterRestClient(configKey = "shipping-service-api")` annotation.

### File: REST Client Directory Structure (NEW)

**Path**: src/main/java/com/redhat/coolstore/rest/client/
**Reason**: Create proper package structure for REST client interfaces

**Exact Changes**:
- Create directory structure: `src/main/java/com/redhat/coolstore/rest/client/`
- This follows the architectural pattern of separating REST clients from business services

**Citations**:
- Before: N/A (new directory)
- After: New package structure for REST client organization

**Notes**: This creates a clear architectural boundary between business services (`/service`) and REST clients (`/rest/client`).
