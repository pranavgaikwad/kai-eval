# JMS to Quarkus SmallRye Migration Fix Notes

## Summary

**Issue ID**: JMS-QUARKUS-001
**Title**: Replace JavaEE/JakartaEE JMS with Quarkus SmallRye/Microprofile equivalents
**Target Technology**: Quarkus with SmallRye Reactive Messaging
**Change Contract**: Replace javax.jms.* imports and JMS MessageDriven beans with SmallRye Reactive Messaging annotations (@Incoming/@Outgoing), JMSContext/Topic resources with Emitter/Channel, and update dependencies from jboss-jms-api to quarkus-smallrye-reactive-messaging.

## Affected Surface Area

### Components/modules touched:
- **Message Producers**: ShoppingCartOrderProcessor (src/main/java/com/redhat/coolstore/service/ShoppingCartOrderProcessor.java)
- **Message Consumers**: OrderServiceMDB, InventoryNotificationMDB
- **Dependencies**: Maven pom.xml JMS specifications
- **Configuration**: Topic/destination configuration (currently in README deployment scripts)

### Entry points and public APIs:
- **ShoppingCartService.checkOutShoppingCart()**: Indirectly affected (calls ShoppingCartOrderProcessor.process())
- **CartEndpoint.checkout()**: Indirectly affected through ShoppingCartService

### Direct vs. indirect occurrences:
- **Direct JMS usage**:
  - OrderServiceMDB.java:6-9 (javax.jms imports)
  - OrderServiceMDB.java:14-17 (@MessageDriven, @ActivationConfigProperty)
  - ShoppingCartOrderProcessor.java:7-8 (javax.jms imports)
  - ShoppingCartOrderProcessor.java:21,23-24 (JMSContext, Topic resources)
  - InventoryNotificationMDB.java:7 (javax.jms imports)
  - InventoryNotificationMDB.java:14,28-69 (MessageListener implementation)
  - pom.xml:31-34 (jboss-jms-api_2.0_spec dependency)

- **Indirect references**:
  - ShoppingCartService.java:30,47 (injection and usage of ShoppingCartOrderProcessor)
  - Architecture documentation referencing JMS topics and message processing

## Per-File Change Plan

### File: src/main/java/com/redhat/coolstore/service/OrderServiceMDB.java
**Path**: src/main/java/com/redhat/coolstore/service/OrderServiceMDB.java
**Reason**: Replace @MessageDriven bean with SmallRye @Incoming reactive messaging

**Exact Changes**:
- Remove imports: javax.ejb.ActivationConfigProperty, javax.ejb.MessageDriven, javax.jms.* (lines 3-9)
- Add imports: org.eclipse.microprofile.reactive.messaging.Incoming, io.smallrye.reactive.messaging.annotations.Blocking
- Replace @MessageDriven annotation (lines 14-17) with @Incoming("orders")
- Remove MessageListener interface implementation (line 18)
- Change onMessage(Message rcvMessage) signature to onMessage(String orderStr) (lines 27-45)
- Remove JMSException handling and TextMessage casting (lines 30-34)
- Add @Blocking annotation for synchronous processing
- Simplify message processing to directly receive String payload

**Citations**:
- Before: OrderServiceMDB.java:3-9, 14-18, 27-45
- After: Modified method signature and annotations

**Notes**: The Order processing logic (lines 35-40) remains unchanged. Topic name "orders" maps to SmallRye channel name.

### File: src/main/java/com/redhat/coolstore/service/ShoppingCartOrderProcessor.java
**Path**: src/main/java/com/redhat/coolstore/service/ShoppingCartOrderProcessor.java
**Reason**: Replace JMSContext and @Resource Topic with SmallRye Emitter

**Exact Changes**:
- Remove imports: javax.jms.JMSContext, javax.jms.Topic, javax.annotation.Resource (lines 5,7-8)
- Add imports: org.eclipse.microprofile.reactive.messaging.Channel, org.eclipse.microprofile.reactive.messaging.Emitter
- Replace @Inject JMSContext and @Resource Topic (lines 20-24) with @Channel("orders") Emitter<String> emitter
- Replace context.createProducer().send(ordersTopic, message) (line 30) with emitter.send(message)
- Update process() method to use emitter instead of JMS producer

**Citations**:
- Before: ShoppingCartOrderProcessor.java:5,7-8,20-24,30
- After: New emitter-based implementation

**Notes**: The message content (Transformers.shoppingCartToJson(cart)) remains the same. Channel name "orders" must match consumer.

### File: src/main/java/com/redhat/coolstore/service/InventoryNotificationMDB.java
**Path**: src/main/java/com/redhat/coolstore/service/InventoryNotificationMDB.java
**Reason**: Replace manual JMS MessageListener with SmallRye @Incoming

**Exact Changes**:
- Remove imports: javax.jms.*, javax.naming.*, javax.rmi.PortableRemoteObject (lines 7-12)
- Add imports: org.eclipse.microprofile.reactive.messaging.Incoming, io.smallrye.reactive.messaging.annotations.Blocking
- Remove MessageListener interface (line 14)
- Remove JMS connection fields and constants (lines 21-26)
- Replace onMessage(Message rcvMessage) with @Incoming("orders") @Blocking onMessage(String orderStr) (lines 28-53)
- Remove TextMessage casting and JMSException handling (lines 29-35,49-51)
- Remove init() and close() methods (lines 55-70)
- Remove getInitialContext() method (lines 72-78)
- Simplify to direct String parameter processing

**Citations**:
- Before: InventoryNotificationMDB.java:7-12,14,21-26,28-78
- After: Simplified reactive messaging consumer

**Notes**: Core inventory checking logic (lines 36-45) remains unchanged. Manual connection management no longer needed.

### File: pom.xml
**Path**: pom.xml
**Reason**: Replace JBoss JMS API with Quarkus SmallRye Reactive Messaging

**Exact Changes**:
- Remove dependency: jboss-jms-api_2.0_spec (lines 30-34)
- Add dependency: quarkus-smallrye-reactive-messaging (groupId: io.quarkus, artifactId: quarkus-smallrye-reactive-messaging)
- Update Java EE dependencies to Jakarta EE if migrating fully to Quarkus
- Consider adding quarkus-artemis if using embedded message broker

**Citations**:
- Before: pom.xml:30-34
- After: New Quarkus dependencies

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