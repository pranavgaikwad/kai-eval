# JMS to Quarkus SmallRye Reactive Messaging Migration - Fix Notes

## Summary

**Issue ID**: JMS is not supported in Quarkus
**Target Technology**: Quarkus
**Change Contract**: Replace JavaEE/JakartaEE JMS elements with Quarkus SmallRye Reactive Messaging equivalents. Remove traditional JMS producer/consumer patterns and replace with reactive messaging channels using MicroProfile Reactive Messaging annotations.

## Per-File Change Plan

### pom.xml
**Path**: `pom.xml`
**Reason**: Replace JBoss JMS API dependency with Quarkus SmallRye Reactive Messaging extensions
**Exact Changes**:
- Remove JBoss JMS API dependency (lines 75-80)
- Add Quarkus SmallRye Reactive Messaging extension
- Add Quarkus SmallRye Reactive Messaging Kafka connector (if needed for persistence)

**Current JMS Dependency (pom.xml:75-80)**:
```xml
<dependency>
    <groupId>org.jboss.spec.javax.jms</groupId>
    <artifactId>jboss-jms-api_1.1_spec</artifactId>
    <version>1.0.1.Final</version>
    <scope>provided</scope>
</dependency>
```

**Replacement Dependencies**:
```xml
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-smallrye-reactive-messaging</artifactId>
</dependency>
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-smallrye-reactive-messaging-kafka</artifactId>
</dependency>
```

**Notes**: SmallRye Reactive Messaging uses channels instead of JMS queues. Kafka connector provides persistence capabilities. Another connector can be used instead of Kafka.

### src/main/java/org/jboss/as/quickstarts/cmt/ejb/InvoiceManagerEJB.java
**Path**: `src/main/java/org/jboss/as/quickstarts/cmt/ejb/InvoiceManagerEJB.java`
**Reason**: Replace JMS producer pattern with SmallRye Reactive Messaging channel emitter
**Exact Changes**:
- Remove all JMS imports (lines 23-29)
- Remove JMS resource injections (lines 34-38)
- Replace JMS message production with reactive messaging emitter
- Add reactive messaging imports and annotations
- Update method signature to remove JMSException

**Current JMS Imports (InvoiceManagerEJB.java:23-29)**:
```java
import javax.jms.Connection;
import javax.jms.ConnectionFactory;
import javax.jms.JMSException;
import javax.jms.MessageProducer;
import javax.jms.Queue;
import javax.jms.Session;
import javax.jms.TextMessage;
```

**Replacement Imports**:
```java
import org.eclipse.microprofile.reactive.messaging.Channel;
import org.eclipse.microprofile.reactive.messaging.Emitter;
import jakarta.inject.Inject;
```

**Current JMS Resources (InvoiceManagerEJB.java:34-38)**:
```java
@Resource(mappedName = "java:/JmsXA")
private ConnectionFactory connectionFactory;

@Resource(mappedName = "java:/queue/CMTQueue")
private Queue queue;
```

**Replacement Resource**:
```java
@Inject
@Channel("<channelName>")
Emitter<String> invoiceEmitter;
```

**Current JMS Production Logic (InvoiceManagerEJB.java:41-49)**:
```java
@TransactionAttribute(TransactionAttributeType.MANDATORY)
public void createInvoice(String name) throws JMSException {
    Connection connection = connectionFactory.createConnection();
    Session session = connection.createSession(false, Session.AUTO_ACKNOWLEDGE);
    MessageProducer messageProducer = session.createProducer(queue);
    connection.start();
    TextMessage message = session.createTextMessage();
    message.setText("Created invoice for customer named: " + name);
    messageProducer.send(message);
    connection.close();
}
```

**Replacement Logic**:
```java
@TransactionAttribute(TransactionAttributeType.MANDATORY)
public void createInvoice(String name) {
    String message = "Created invoice for customer named: " + name;
    invoiceEmitter.send(message);
}
```

**Notes**: Reactive messaging handles connection management automatically. Transaction integration with SmallRye requires additional configuration.

### src/main/java/org/jboss/as/quickstarts/cmt/mdb/HelloWorldMDB.java
**Path**: `src/main/java/org/jboss/as/quickstarts/cmt/mdb/HelloWorldMDB.java`
**Reason**: Replace Message-Driven Bean with SmallRye Reactive Messaging incoming channel consumer
**Exact Changes**:
- Remove MDB annotations and configuration (lines 21-22, 36-39)
- Remove JMS imports (lines 23-26)
- Replace MessageListener interface with reactive messaging method
- Add reactive messaging imports and annotations
- Update message processing logic

**Current MDB Configuration (HelloWorldMDB.java:36-39)**:
```java
@MessageDriven(name = "HelloWorldMDB", activationConfig = {
        @ActivationConfigProperty(propertyName = "destinationType", propertyValue = "javax.jms.Queue"),
        @ActivationConfigProperty(propertyName = "destination", propertyValue = "queue/CMTQueue"),
        @ActivationConfigProperty(propertyName = "acknowledgeMode", propertyValue = "Auto-acknowledge") })
public class HelloWorldMDB implements MessageListener {
```

**Replacement Configuration**:
```java
import org.eclipse.microprofile.reactive.messaging.Incoming;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class HelloWorldMDB {
```

**Current Message Processing (HelloWorldMDB.java:47-58)**:
```java
public void onMessage(Message rcvMessage) {
    TextMessage msg = null;
    try {
        if (rcvMessage instanceof TextMessage) {
            msg = (TextMessage) rcvMessage;
            LOGGER.info("Received Message: " + msg.getText());
        } else {
            LOGGER.warning("Message of wrong type: " + rcvMessage.getClass().getName());
        }
    } catch (JMSException e) {
        throw new RuntimeException(e);
    }
}
```

**Replacement Processing**:
```java
@Incoming("<channelName>")
public void processInvoiceMessage(String message) {
    LOGGER.info("Received Message: " + message);
}
```

**Notes**: Reactive messaging automatically handles message type conversion and error handling.

### src/main/java/org/jboss/as/quickstarts/cmt/ejb/CustomerManagerEJB.java
**Path**: `src/main/java/org/jboss/as/quickstarts/cmt/ejb/CustomerManagerEJB.java`
**Reason**: Remove JMSException from method signatures as JMS is no longer used
**Exact Changes**:
- Remove JMSException import (line 27)
- Remove JMSException from createCustomer method signature (line 52)

**Current Import (CustomerManagerEJB.java:27)**:
```java
import javax.jms.JMSException;
```

**Removal**: Delete this import line

**Current Method Signature (CustomerManagerEJB.java:52)**:
```java
public void createCustomer(String name) throws RemoteException, JMSException {
```

**Updated Method Signature**:
```java
public void createCustomer(String name) throws RemoteException {
```

**Notes**: The method logic remains unchanged since it delegates JMS operations to InvoiceManagerEJB.

### src/main/java/org/jboss/as/quickstarts/cmt/ejb/LogMessageManagerEJB.java
**Path**: `src/main/java/org/jboss/as/quickstarts/cmt/ejb/LogMessageManagerEJB.java`
**Reason**: Remove JMSException from method signatures as JMS is no longer used
**Exact Changes**:
- Remove JMSException import (line 25)
- Remove JMSException from logCreateCustomer method signature (line 43)
- Remove JMSException from blaMethod method signature (line 50)

**Current Import (LogMessageManagerEJB.java:25)**:
```java
import javax.jms.JMSException;
```

**Removal**: Delete this import line

**Current Method Signatures (LogMessageManagerEJB.java:43, 50)**:
```java
public void logCreateCustomer(String name) throws RemoteException, JMSException {
```
```java
public void blaMethod() throws RemoteException, JMSException {
```

**Updated Method Signatures**:
```java
public void logCreateCustomer(String name) throws RemoteException {
```
```java
public void blaMethod() throws RemoteException {
```

**Notes**: These methods don't actually use JMS, so only signature cleanup is needed.

### src/main/webapp/WEB-INF/hornetq-jms.xml (Remove File)
**Path**: `src/main/webapp/WEB-INF/hornetq-jms.xml`
**Reason**: HornetQ JMS configuration is not applicable to Quarkus SmallRye Reactive Messaging
**Exact Changes**:
- Delete entire file
- Replace with application.properties configuration for reactive messaging channels


**Current HornetQ Configuration (hornetq-jms.xml:21-23)**:
```xml
<jms-queue name="CMTQueue">
    <entry name="/queue/CMTQueue"/>
</jms-queue>
```

**Notes**: Queue configuration is replaced by channel configuration in application.properties.

### src/main/resources/application.properties (New/Update File)
**Path**: `src/main/resources/application.properties`
**Reason**: Configure SmallRye Reactive Messaging channels to replace JMS queue configuration
**Exact Changes**:
- Add reactive messaging channel configuration
- Configure message connector (in-memory or Kafka)
- Set channel processing properties

**Citations**: New file creation or update to existing file

**Required SmallRye Configuration**:
```properties
# SmallRye Reactive Messaging Configuration
mp.messaging.outgoing.invoice-messages.connector=smallrye-in-memory
mp.messaging.incoming.invoice-messages.connector=smallrye-in-memory

# Alternative Kafka Configuration (if persistence needed)
# mp.messaging.outgoing.invoice-messages.connector=smallrye-kafka
# mp.messaging.outgoing.invoice-messages.topic=invoice-messages
# mp.messaging.incoming.invoice-messages.connector=smallrye-kafka
# mp.messaging.incoming.invoice-messages.topic=invoice-messages
# mp.messaging.incoming.invoice-messages.group.id=cmt-group
```

**Notes**: In-memory connector for simple messaging, Kafka connector for production-grade persistence.

