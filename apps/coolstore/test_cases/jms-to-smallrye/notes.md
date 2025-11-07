# JMS to Quarkus SmallRye Migration Fix Notes

## Summary

**Title**: Replace JavaEE/JakartaEE JMS with Quarkus SmallRye/Microprofile equivalents
**Target Technology**: Quarkus with SmallRye Reactive Messaging
**Change Contract**: Replace javax.jms.* imports and JMS MessageDriven beans with SmallRye Reactive Messaging annotations (@Incoming/@Outgoing), JMSContext/Topic resources with Emitter/Channel, and update dependencies from jboss-jms-api to quarkus-smallrye-reactive-messaging.

## Per-File Change Plan

### File: src/main/java/com/redhat/coolstore/service/OrderServiceMDB.java
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

**Notes**: The Order processing logic (lines 35-40) remains unchanged. Topic name "orders" maps to SmallRye channel name.

### File: src/main/java/com/redhat/coolstore/service/ShoppingCartOrderProcessor.java
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

**Notes**: The message content (Transformers.shoppingCartToJson(cart)) remains the same. Channel name "orders" must match consumer.

### File: src/main/java/com/redhat/coolstore/service/InventoryNotificationMDB.java
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

**Notes**: Core inventory checking logic (lines 36-45) remains unchanged. Manual connection management no longer needed.

### File: pom.xml
**Path**: pom.xml
**Reason**: Replace JBoss JMS API with Quarkus SmallRye Reactive Messaging

**Exact Changes**:
- Remove dependency: jboss-jms-api_2.0_spec (lines 30-34)
- Add dependency: quarkus-smallrye-reactive-messaging (groupId: io.quarkus, artifactId: quarkus-smallrye-reactive-messaging)
- Update Java EE dependencies to Jakarta EE if migrating fully to Quarkus
- Consider adding quarkus-artemis if using embedded message broker


**Notes**: Version should match target Quarkus BOM version. May require additional Quarkus dependencies for full migration.

### File: src/main/resources/application.properties (NEW)
**Path**: src/main/resources/application.properties
**Reason**: Configure SmallRye Reactive Messaging channels and connectors

**Exact Changes**:
- Create new file with SmallRye channel configuration
- Add connector configuration for message broker (in-memory, Artemis, or external)
- Configure "orders" channel for both incoming and outgoing

**Citations**:
- Before: Configuration was implicit in JMS @ActivationConfigProperty
- After: Explicit application.properties configuration

**Notes**:
Example configuration:
```properties
# SmallRye Reactive Messaging configuration
mp.messaging.outgoing.orders.connector=smallrye-in-memory
mp.messaging.incoming.orders.connector=smallrye-in-memory

# Or for Artemis:
# mp.messaging.outgoing.orders.connector=smallrye-jms
# mp.messaging.outgoing.orders.destination=orders
# mp.messaging.incoming.orders.connector=smallrye-jms
# mp.messaging.incoming.orders.destination=orders
```
