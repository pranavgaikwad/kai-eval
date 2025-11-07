# JBoss CMT to Quarkus Migration - Complete Fix Notes

## Summary

**Title**: Replace JSF Dependencies and Remove JMS Support for Quarkus Migration
**Target Technology**: Quarkus
**Change Contract**:
1. Replace JBoss JSF 2.1 implementation with Quarkus MyFaces extension, update JSF managed bean scope annotations from `javax.faces.bean.RequestScoped` to CDI `jakarta.enterprise.context.RequestScoped`, and update JSF view namespace declarations for modern JSF compatibility
2. Replace JavaEE/JakartaEE JMS elements with Quarkus SmallRye Reactive Messaging equivalents. Remove traditional JMS producer/consumer patterns and replace with reactive messaging channels using MicroProfile Reactive Messaging annotations

## Per-File Change Plan

### pom.xml
**Path**: `pom.xml`
**Reason**: Replace JBoss JSF API and JMS dependencies with Quarkus alternatives
**Exact Changes**:
- Remove JBoss JSF API dependency (lines 61-66)
- Remove JBoss JMS API dependency (lines 75-80)
- Add Quarkus MyFaces extension dependency
- Add Quarkus SmallRye Reactive Messaging extensions
- Update Maven compiler plugin for Quarkus compatibility if needed

**Current JSF Dependency (pom.xml:61-66)**:
```xml
<dependency>
    <groupId>org.jboss.spec.javax.faces</groupId>
    <artifactId>jboss-jsf-api_2.1_spec</artifactId>
    <version>2.1.28.Final</version>
    <scope>provided</scope>
</dependency>
```

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
<!-- Quarkus MyFaces -->
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-myfaces</artifactId>
</dependency>

<!-- Quarkus SmallRye Reactive Messaging -->
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-smallrye-reactive-messaging</artifactId>
</dependency>
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-smallrye-reactive-messaging-kafka</artifactId>
</dependency>
```

**Notes**: Remove `provided` scope as Quarkus manages dependencies differently. Versions will be managed by Quarkus BOM. SmallRye Reactive Messaging uses channels instead of JMS queues. Kafka connector provides persistence capabilities.

### src/main/java/org/jboss/as/quickstarts/cmt/controller/CustomerManager.java
**Path**: `src/main/java/org/jboss/as/quickstarts/cmt/controller/CustomerManager.java`
**Reason**: Replace deprecated JSF managed bean scope annotation with CDI scope annotation for Quarkus compatibility
**Exact Changes**:
- Remove import: `javax.faces.bean.RequestScoped`
- Add import: `jakarta.enterprise.context.RequestScoped`
- Keep existing `@Named` and `@RequestScoped` annotations (functionality unchanged)


**Current Import (CustomerManager.java:22)**:
```java
import javax.faces.bean.RequestScoped;
```

**Replacement**:
```java
import jakarta.enterprise.context.RequestScoped;
```

**Notes**: The `@RequestScoped` annotation usage remains the same; only the import source changes from JSF-specific to CDI standard.

### src/main/java/org/jboss/as/quickstarts/cmt/controller/LogMessageManager.java
**Path**: `src/main/java/org/jboss/as/quickstarts/cmt/controller/LogMessageManager.java`
**Reason**: Replace deprecated JSF managed bean scope annotation with CDI scope annotation for Quarkus compatibility
**Exact Changes**:
- Remove import: `javax.faces.bean.RequestScoped`
- Add import: `jakarta.enterprise.context.RequestScoped`
- Keep existing `@Named` and `@RequestScoped` annotations (functionality unchanged)


**Current Import (LogMessageManager.java:21)**:
```java
import javax.faces.bean.RequestScoped;
```

**Replacement**:
```java
import jakarta.enterprise.context.RequestScoped;
```

**Notes**: The `@RequestScoped` annotation usage remains the same; only the import source changes from JSF-specific to CDI standard.

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
@Channel("<name_of_the_channel>")
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
@Incoming("<name_of_the_channel>")
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

**Citations**:
- Before: `LogMessageManagerEJB.java:25` - JMSException import
- Before: `LogMessageManagerEJB.java:43` - logCreateCustomer method signature
- Before: `LogMessageManagerEJB.java:50` - blaMethod method signature
- After: Updated import and method signatures

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

### src/main/webapp/addCustomer.xhtml
**Path**: `src/main/webapp/addCustomer.xhtml`
**Reason**: Update JSF namespace declarations to modern JSF 2.3+ format for Quarkus MyFaces compatibility
**Exact Changes**:
- Update namespace URIs from `java.sun.com` to `xmlns.jcp.org` format
- Maintain all existing JSF component usage and structure

**Citations**:
- Before: `addCustomer.xhtml:19-21`
- After: Updated namespace declarations

**Current Namespaces (addCustomer.xhtml:19-21)**:
```xml
xmlns:ui="http://java.sun.com/jsf/facelets"
xmlns:h="http://java.sun.com/jsf/html"
xmlns:f="http://java.sun.com/jsf/core"
```

**Replacement**:
```xml
xmlns:ui="http://xmlns.jcp.org/jsf/facelets"
xmlns:h="http://xmlns.jcp.org/jsf/html"
xmlns:f="http://xmlns.jcp.org/jsf/core"
```

**Notes**: All JSF component usage (`ui:composition`, `h:form`, etc.) remains functionally identical.

### src/main/webapp/customers.xhtml
**Path**: `src/main/webapp/customers.xhtml`
**Reason**: Update JSF namespace declarations to modern JSF 2.3+ format for Quarkus MyFaces compatibility
**Exact Changes**:
- Update namespace URIs from `java.sun.com` to `xmlns.jcp.org` format
- Maintain all existing JSF component usage and structure

**Citations**:
- Before: `customers.xhtml:19-21`
- After: Updated namespace declarations

**Current Namespaces (customers.xhtml:19-21)**:
```xml
xmlns:ui="http://java.sun.com/jsf/facelets"
xmlns:h="http://java.sun.com/jsf/html"
xmlns:f="http://java.sun.com/jsf/core"
```

**Replacement**:
```xml
xmlns:ui="http://xmlns.jcp.org/jsf/facelets"
xmlns:h="http://xmlns.jcp.org/jsf/html"
xmlns:f="http://xmlns.jcp.org/jsf/core"
```

**Notes**: Data table rendering with `h:dataTable` and Expression Language bindings remain unchanged.

### src/main/webapp/logMessages.xhtml
**Path**: `src/main/webapp/logMessages.xhtml`
**Reason**: Update JSF namespace declarations to modern JSF 2.3+ format for Quarkus MyFaces compatibility
**Exact Changes**:
- Update namespace URIs from `java.sun.com` to `xmlns.jcp.org` format
- Maintain all existing JSF component usage and structure

**Citations**:
- Before: `logMessages.xhtml:19-21`
- After: Updated namespace declarations

**Current Namespaces (logMessages.xhtml:19-21)**:
```xml
xmlns:ui="http://java.sun.com/jsf/facelets"
xmlns:h="http://java.sun.com/jsf/html"
xmlns:f="http://java.sun.com/jsf/core"
```

**Replacement**:
```xml
xmlns:ui="http://xmlns.jcp.org/jsf/facelets"
xmlns:h="http://xmlns.jcp.org/jsf/html"
xmlns:f="http://xmlns.jcp.org/jsf/core"
```

**Notes**: Data table rendering and managed bean binding remain functionally identical.

### src/main/webapp/duplicate.xhtml
**Path**: `src/main/webapp/duplicate.xhtml`
**Reason**: Update JSF namespace declarations to modern JSF 2.3+ format for Quarkus MyFaces compatibility
**Exact Changes**:
- Update namespace URIs from `java.sun.com` to `xmlns.jcp.org` format
- Maintain all existing JSF component usage and structure

**Citations**:
- Before: `duplicate.xhtml:19-21`
- After: Updated namespace declarations

**Current Namespaces (duplicate.xhtml:19-21)**:
```xml
xmlns:ui="http://java.sun.com/jsf/facelets"
xmlns:h="http://java.sun.com/jsf/html"
xmlns:f="http://java.sun.com/jsf/core"
```

**Replacement**:
```xml
xmlns:ui="http://xmlns.jcp.org/jsf/facelets"
xmlns:h="http://xmlns.jcp.org/jsf/html"
xmlns:f="http://xmlns.jcp.org/jsf/core"
```

**Notes**: Template composition structure remains unchanged.

### src/main/webapp/invalidName.xhtml
**Path**: `src/main/webapp/invalidName.xhtml`
**Reason**: Update JSF namespace declarations to modern JSF 2.3+ format for Quarkus MyFaces compatibility
**Exact Changes**:
- Update namespace URIs from `java.sun.com` to `xmlns.jcp.org` format
- Maintain all existing JSF component usage and structure

**Citations**:
- Before: `invalidName.xhtml:19-21`
- After: Updated namespace declarations

**Current Namespaces (invalidName.xhtml:19-21)**:
```xml
xmlns:ui="http://xmlns.jcp.org/jsf/facelets"
xmlns:h="http://xmlns.jcp.org/jsf/html"
xmlns:f="http://xmlns.jcp.org/jsf/core"
```

**Replacement**:
```xml
xmlns:ui="http://xmlns.jcp.org/jsf/facelets"
xmlns:h="http://xmlns.jcp.org/jsf/html"
xmlns:f="http://xmlns.jcp.org/jsf/core"
```

**Notes**: Error page rendering remains functionally identical.

### src/main/webapp/template.xhtml
**Path**: `src/main/webapp/template.xhtml`
**Reason**: Update JSF namespace declarations to modern JSF 2.3+ format for Quarkus MyFaces compatibility
**Exact Changes**:
- Update namespace URIs from `java.sun.com` to `xmlns.jcp.org` format
- Maintain all existing JSF template structure

**Citations**:
- Before: `template.xhtml:19-21`
- After: Updated namespace declarations

**Current Namespaces (template.xhtml:19-21)**:
```xml
xmlns:ui="http://java.sun.com/jsf/facelets"
xmlns:h="http://java.sun.com/jsf/html"
xmlns:f="http://java.sun.com/jsf/core"
```

**Replacement**:
```xml
xmlns:ui="http://xmlns.jcp.org/jsf/facelets"
xmlns:h="http://xmlns.jcp.org/jsf/html"
xmlns:f="http://xmlns.jcp.org/jsf/core"
```

**Notes**: Facelets template definition and composition points remain unchanged.

### src/main/webapp/WEB-INF/faces-config.xml
**Path**: `src/main/webapp/WEB-INF/faces-config.xml`
**Reason**: Update JSF configuration schema to JSF 2.3+ format for Quarkus MyFaces compatibility
**Exact Changes**:
- Update schema version from 2.0 to 2.3
- Update namespace URI from `java.sun.com` to `xmlns.jcp.org`
- Update schema location for JSF 2.3
- Maintain all existing navigation rules

**Citations**:
- Before: `faces-config.xml:19`
- After: Updated schema declaration

**Current Schema (faces-config.xml:19)**:
```xml
<faces-config version="2.0" xmlns="http://java.sun.com/xml/ns/javaee"
              xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
              xsi:schemaLocation="http://java.sun.com/xml/ns/javaee
                                  http://java.sun.com/xml/ns/javaee/web-facesconfig_2_0.xsd">
```

**Replacement**:
```xml
<faces-config version="2.3" xmlns="http://xmlns.jcp.org/xml/ns/javaee"
              xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
              xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/javaee
                                  http://xmlns.jcp.org/xml/ns/javaee/web-facesconfig_2_3.xsd">
```

**Notes**: All navigation rules defined in `faces-config.xml:21-41` remain functionally unchanged.

### src/main/webapp/WEB-INF/hornetq-jms.xml (Remove File)
**Path**: `src/main/webapp/WEB-INF/hornetq-jms.xml`
**Reason**: HornetQ JMS configuration is not applicable to Quarkus SmallRye Reactive Messaging
**Exact Changes**:
- Delete entire file
- Replace with application.properties configuration for reactive messaging channels

**Citations**:
- Before: `hornetq-jms.xml:21-23` - JMS queue configuration
- After: File deletion and replacement with properties

**Current HornetQ Configuration (hornetq-jms.xml:21-23)**:
```xml
<jms-queue name="CMTQueue">
    <entry name="/queue/CMTQueue"/>
</jms-queue>
```

**Notes**: Queue configuration is replaced by channel configuration in application.properties.

### src/main/webapp/index.html (Optional)
**Path**: `src/main/webapp/index.html`
**Reason**: Update JSF URL extension for consistency with Quarkus MyFaces default configuration
**Exact Changes**:
- Change redirect URL from `.jsf` to `.xhtml` extension
- Align with modern JSF URL mapping conventions

**Citations**:
- Before: `index.html:21`
- After: Updated redirect URL

**Current Redirect (index.html:21)**:
```html
<meta http-equiv="Refresh" content="0; URL=addCustomer.jsf">
```

**Potential Update**:
```html
<meta http-equiv="Refresh" content="0; URL=addCustomer.xhtml">
```

**Notes**: This change depends on Quarkus MyFaces servlet mapping configuration. Verify URL mapping behavior after migration.

### src/main/resources/application.properties (New File)
**Path**: `src/main/resources/application.properties`
**Reason**: Add Quarkus configuration for both MyFaces and SmallRye Reactive Messaging
**Exact Changes**:
- Create new file with MyFaces-specific configuration
- Configure view handling, state saving, and security settings
- Add reactive messaging channel configuration
- Configure message connector (in-memory or Kafka)
- Set channel processing properties

**Citations**: New file creation

**Required Content**:
```properties
# MyFaces Configuration
quarkus.myfaces.initial-state-saving-method=server
quarkus.myfaces.facelets-suffix=.xhtml
quarkus.myfaces.default-suffix=.xhtml
quarkus.myfaces.project-stage=Development

# JSF Servlet Mapping
quarkus.myfaces.faces-servlet.url-patterns=*.xhtml,/faces/*

# SmallRye Reactive Messaging Configuration
mp.messaging.outgoing.invoice-messages.connector=smallrye-in-memory
mp.messaging.incoming.invoice-messages.connector=smallrye-in-memory

# Alternative Kafka Configuration (if persistence needed)
# mp.messaging.outgoing.invoice-messages.connector=smallrye-kafka
# mp.messaging.outgoing.invoice-messages.topic=invoice-messages
# mp.messaging.incoming.invoice-messages.connector=smallrye-kafka
# mp.messaging.incoming.invoice-messages.topic=invoice-messages
# mp.messaging.incoming.invoice-messages.group.id=cmt-group

# Database configuration (if keeping JPA)
quarkus.datasource.db-kind=postgresql
quarkus.datasource.username=sa
quarkus.datasource.password=sa
quarkus.datasource.jdbc.url=jdbc:postgresql://localhost/cmt-quickstart-database

# Hibernate ORM configuration
quarkus.hibernate-orm.database.generation=drop-and-create
quarkus.hibernate-orm.log.sql=false
```

**Notes**: In-memory connector for simple messaging, Kafka connector for production-grade persistence. Additional properties may be needed based on specific application requirements and Quarkus version.
