# Quarkus Migration Fix Notes

## Summary

**Title**: JMS to SmallRye & Remote EJB to REST Migration
**Target Technology**: Quarkus with Jakarta EE
**Change Contract**:
1. Replace JavaEE/JakartaEE JMS Message-Driven Beans with Quarkus SmallRye/MicroProfile messaging equivalents using Jakarta EE packages
2. Convert Remote EJB services to JAX-RS REST endpoints with Jakarta EE annotations and create corresponding REST clients to maintain architectural separation

## Affected Surface Area

### Components/Modules Touched
- **Message Processing**: 3 JMS-related service classes requiring SmallRye conversion with Jakarta EE imports
- **Remote Services**: 1 Remote EJB service requiring REST conversion + new REST client creation
- **Dependencies**: Maven POM requires new Quarkus messaging and REST dependencies with Jakarta EE
- **Configuration**: JMS JNDI configuration must be replaced with SmallRye channel configuration
- **Service Integration**: ShoppingCartService remote lookup replaced with REST client injection

### Entry Points & Public APIs
- **Message Consumers**: OrderServiceMDB, InventoryNotificationMDB processing order messages
- **Message Producers**: ShoppingCartOrderProcessor sending order messages
- **Remote EJB**: ShippingService exposed as remote EJB, used by ShoppingCartService
- **New REST API**: ShippingService REST endpoints at `/api/shipping/*`
- **New Client**: ShippingServiceClient for HTTP transport layer

### Map of Direct vs. Indirect Occurrences

**Direct JMS Usage**:
- OrderServiceMDB (src/main/java/com/redhat/coolstore/service/OrderServiceMDB.java:14-17)
- InventoryNotificationMDB (src/main/java/com/redhat/coolstore/service/InventoryNotificationMDB.java:14, 28-53)
- ShoppingCartOrderProcessor (src/main/java/com/redhat/coolstore/service/ShoppingCartOrderProcessor.java:21-24, 30)

**Direct Remote EJB Usage**:
- ShippingService (src/main/java/com/redhat/coolstore/service/ShippingService.java:11-12)
- ShippingServiceRemote interface (src/main/java/com/redhat/coolstore/service/ShippingServiceRemote.java:5-8)

**Indirect Usage**:
- ShoppingCartService remote lookup (src/main/java/com/redhat/coolstore/service/ShoppingCartService.java - lookupShippingServiceRemote method)

## Per-File Change Plan

### 1. src/main/java/com/redhat/coolstore/service/OrderServiceMDB.java

**Path**: src/main/java/com/redhat/coolstore/service/OrderServiceMDB.java
**Reason**: Convert JMS MessageDriven Bean to SmallRye Reactive Messaging consumer with Jakarta EE

**Exact Changes**:
- Remove import: `javax.ejb.ActivationConfigProperty` (line 3)
- Remove import: `javax.ejb.MessageDriven` (line 4)
- Remove import: `javax.inject.Inject` (line 5)
- Remove import: `javax.jms.JMSException` (line 6)
- Remove import: `javax.jms.Message` (line 7)
- Remove import: `javax.jms.MessageListener` (line 8)
- Remove import: `javax.jms.TextMessage` (line 9)
- Add import: `org.eclipse.microprofile.reactive.messaging.Incoming`
- Add import: `jakarta.enterprise.context.ApplicationScoped`
- Add import: `jakarta.inject.Inject`
- Remove annotation: `@MessageDriven(name = "OrderServiceMDB", activationConfig = {...})` (lines 14-17)
- Remove interface implementation: `implements MessageListener` (line 18)
- Add annotation: `@ApplicationScoped`
- Replace method signature: `public void onMessage(Message rcvMessage)` with `@Incoming("orders") public void processOrder(String orderStr)`
- Remove try-catch JMS exception handling and message casting (lines 27-45)
- Simplify method body to directly process the string payload

**Citations**:
- Before: src/main/java/com/redhat/coolstore/service/OrderServiceMDB.java:1-47
- After: Converted to SmallRye Reactive Messaging consumer with Jakarta EE

**Notes**: Requires SmallRye messaging configuration in application.properties for "orders" channel

### 2. src/main/java/com/redhat/coolstore/service/InventoryNotificationMDB.java

**Path**: src/main/java/com/redhat/coolstore/service/InventoryNotificationMDB.java
**Reason**: Convert standalone JMS consumer to SmallRye Reactive Messaging consumer with Jakarta EE

**Exact Changes**:
- Remove imports: `javax.inject.Inject` (line 6)
- Remove imports: `javax.jms.*`, `javax.naming.*`, `javax.rmi.PortableRemoteObject` (lines 7-12)
- Add imports: `org.eclipse.microprofile.reactive.messaging.Incoming`, `jakarta.enterprise.context.ApplicationScoped`, `jakarta.inject.Inject`
- Remove interface implementation: `implements MessageListener` (line 14)
- Add annotation: `@ApplicationScoped`
- Remove all JNDI/JMS setup constants and fields (lines 21-26)
- Replace `onMessage(Message rcvMessage)` with `@Incoming("orders") processInventoryNotification(String orderStr)`
- Remove manual JMS connection management methods: `init()`, `close()`, `getInitialContext()` (lines 55-78)
- Simplify message processing logic to work directly with string payload
- Remove JMS-specific exception handling

**Citations**:
- Before: src/main/java/com/redhat/coolstore/service/InventoryNotificationMDB.java:1-79
- After: Converted to SmallRye Reactive Messaging consumer with Jakarta EE

**Notes**: This class currently uses WebLogic-specific JNDI setup which is incompatible with Quarkus

### 3. src/main/java/com/redhat/coolstore/service/ShoppingCartOrderProcessor.java

**Path**: src/main/java/com/redhat/coolstore/service/ShoppingCartOrderProcessor.java
**Reason**: Convert JMS producer to SmallRye Reactive Messaging emitter with Jakarta EE

**Exact Changes**:
- Remove import: `javax.ejb.Stateless` (line 4)
- Remove import: `javax.annotation.Resource` (line 5)
- Remove import: `javax.inject.Inject` (line 6)
- Remove imports: `javax.jms.JMSContext`, `javax.jms.Topic` (lines 7-8)
- Add imports: `org.eclipse.microprofile.reactive.messaging.Channel`, `org.eclipse.microprofile.reactive.messaging.Emitter`
- Add imports: `jakarta.enterprise.context.ApplicationScoped`, `jakarta.inject.Inject`
- Remove annotation: `@Stateless` (line 13)
- Add annotation: `@ApplicationScoped`
- Replace field declarations:
  - Remove: `@Inject private transient JMSContext context;` (lines 20-21)
  - Remove: `@Resource(lookup = "java:/topic/orders") private Topic ordersTopic;` (lines 23-24)
  - Add: `@Inject @Channel("orders") Emitter<String> orderEmitter;`
- Replace method body in `process()`:
  - Remove: `context.createProducer().send(ordersTopic, Transformers.shoppingCartToJson(cart));` (line 30)
  - Add: `orderEmitter.send(Transformers.shoppingCartToJson(cart));`

**Citations**:
- Before: src/main/java/com/redhat/coolstore/service/ShoppingCartOrderProcessor.java:4-31
- After: Converted to SmallRye Reactive Messaging emitter with Jakarta EE

**Notes**: Requires SmallRye messaging configuration for "orders" channel output

### 4. src/main/java/com/redhat/coolstore/service/ShippingService.java

**Path**: src/main/java/com/redhat/coolstore/service/ShippingService.java
**Reason**: Convert Remote EJB to JAX-RS REST service with Jakarta EE

**Exact Changes**:
- Remove imports: `javax.ejb.Remote`, `javax.ejb.Stateless` (lines 6-7)
- Add imports: `jakarta.ws.rs.*` (Path, GET, POST, QueryParam, Produces, core.MediaType)
- Add import: `jakarta.enterprise.context.ApplicationScoped`
- Remove annotations: `@Stateless`, `@Remote` (lines 11-12)
- Add annotations: `@Path("/api/shipping")`, `@ApplicationScoped`, `@Produces(MediaType.APPLICATION_JSON)`
- Remove interface implementation: `implements ShippingServiceRemote` (line 13)
- Modify method signatures:
  - `calculateShipping(ShoppingCart sc)` → `@GET @Path("/calculate") calculateShipping(@QueryParam("cartTotal") double cartTotal)`
  - `calculateShippingInsurance(ShoppingCart sc)` → `@GET @Path("/insurance") calculateShippingInsurance(@QueryParam("cartTotal") double cartTotal)`
- Update method implementations to use `cartTotal` parameter instead of `sc.getCartItemTotal()`

**Citations**:
- Before: src/main/java/com/redhat/coolstore/service/ShippingService.java:6-7, 11-13, 16-70
- After: Converted to JAX-RS REST service with GET endpoints using Jakarta EE

**Notes**: REST endpoints now accept simple parameters rather than complex objects for better HTTP compatibility

### 5. src/main/java/com/redhat/coolstore/service/ShippingServiceClient.java (NEW FILE)

**Path**: src/main/java/com/redhat/coolstore/service/ShippingServiceClient.java
**Reason**: Create REST client to replace removed ShippingServiceRemote interface

**Exact Changes**:
- Create new file with REST client interface:
```java
package com.redhat.coolstore.service;

import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

@RegisterRestClient(configKey = "shipping-service")
@Path("/api/shipping")
@Produces(MediaType.APPLICATION_JSON)
public interface ShippingServiceClient {

    @GET
    @Path("/calculate")
    double calculateShipping(@QueryParam("cartTotal") double cartTotal);

    @GET
    @Path("/insurance")
    double calculateShippingInsurance(@QueryParam("cartTotal") double cartTotal);
}
```

**Citations**:
- Before: N/A (new file)
- After: New REST client interface equivalent to removed ShippingServiceRemote

**Notes**: Uses MicroProfile REST Client for type-safe HTTP calls; maintains same method signatures as original interface but adapted for REST

### 6. src/main/java/com/redhat/coolstore/service/ShippingServiceRemote.java

**Path**: src/main/java/com/redhat/coolstore/service/ShippingServiceRemote.java
**Reason**: Remote interface replaced by REST client; remove entirely

**Exact Changes**:
- Delete entire file (lines 1-9)

**Citations**:
- Before: src/main/java/com/redhat/coolstore/service/ShippingServiceRemote.java:1-9
- After: File deleted

**Notes**: Functionality replaced by ShippingServiceClient REST client interface

### 7. src/main/java/com/redhat/coolstore/service/ShoppingCartService.java

**Path**: src/main/java/com/redhat/coolstore/service/ShoppingCartService.java
**Reason**: Replace remote EJB lookup with REST client injection using Jakarta EE

**Exact Changes**:
- Remove imports for JNDI/Context: `javax.naming.Context`, `javax.naming.InitialContext`, `javax.naming.NamingException`
- Update import: `javax.inject.Inject` → `jakarta.inject.Inject`
- Add import: `org.eclipse.microprofile.rest.client.inject.RestClient`
- Replace remote service field and usage:
  - Add: `@Inject @RestClient ShippingServiceClient shippingServiceClient;`
  - Replace: `lookupShippingServiceRemote().calculateShipping(sc)` with `shippingServiceClient.calculateShipping(sc.getCartItemTotal())`
  - Replace: `lookupShippingServiceRemote().calculateShippingInsurance(sc)` with `shippingServiceClient.calculateShippingInsurance(sc.getCartItemTotal())`
- Remove method: `private static ShippingServiceRemote lookupShippingServiceRemote()` and its JNDI lookup implementation

**Citations**:
- Before: Usage of `lookupShippingServiceRemote()` in priceShoppingCart method
- After: REST client injection and method calls with Jakarta EE

**Notes**: Uses MicroProfile REST Client injection for clean separation of concerns

### 8. pom.xml

**Path**: pom.xml
**Reason**: Replace Java EE dependencies with Quarkus/Jakarta EE equivalents

**Exact Changes**:
- Replace parent or add dependencyManagement section with Quarkus BOM
- Remove dependencies: `javax.javaee-web-api`, `javax.javaee-api` (lines 17-29)
- Remove dependency: `org.jboss.spec.javax.jms` (lines 30-34)
- Remove dependency: `org.jboss.spec.javax.rmi` (lines 40-44)
- Add Quarkus dependencies:
  - `quarkus-resteasy-reactive-jackson` (Jakarta REST with JSON)
  - `quarkus-rest-client-reactive-jackson` (REST client support)
  - `quarkus-smallrye-reactive-messaging`
  - `quarkus-smallrye-reactive-messaging-kafka` (or appropriate broker)
  - `quarkus-arc` (CDI implementation)
- Update build plugins:
  - Add `quarkus-maven-plugin`
  - Update `maven-compiler-plugin` to target Java 11+ if needed

**Citations**:
- Before: pom.xml:17-44
- After: Quarkus dependency structure with Jakarta EE

**Notes**: Complete rework of dependency management for Quarkus/Jakarta EE compatibility

### 9. src/main/resources/application.properties (NEW FILE)

**Path**: src/main/resources/application.properties
**Reason**: Configure SmallRye Reactive Messaging channels and REST client

**Exact Changes**:
- Create new file with configuration:
```properties
# SmallRye Reactive Messaging configuration
mp.messaging.outgoing.orders.connector=smallrye-kafka
mp.messaging.outgoing.orders.topic=orders
mp.messaging.incoming.orders.connector=smallrye-kafka
mp.messaging.incoming.orders.topic=orders

# REST Client configuration for ShippingServiceClient
shipping-service/mp-rest/url=http://localhost:8080
shipping-service/mp-rest/scope=jakarta.inject.Singleton
```

**Citations**:
- Before: N/A (new file)
- After: New Quarkus configuration

**Notes**: Configuration assumes local deployment; adjust URLs for different environments
