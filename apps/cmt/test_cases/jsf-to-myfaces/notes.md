# JSF to Quarkus MyFaces Migration - Fix Notes

## Summary

**Issue ID**: Replace JSF dependency with Quarkus MyFaces
**Target Technology**: Quarkus
**Change Contract**: Replace JBoss JSF 2.1 implementation with Quarkus MyFaces extension, update JSF managed bean scope annotations from `javax.faces.bean.RequestScoped` to CDI `jakarta.enterprise.context.RequestScoped`, and update JSF view namespace declarations for modern JSF compatibility.

## Per-File Change Plan

### pom.xml
**Path**: `pom.xml`
**Reason**: Replace JBoss JSF API dependency with Quarkus MyFaces extension to enable JSF support in Quarkus runtime
**Exact Changes**:
- Remove JBoss JSF API dependency (lines 61-66)
- Add Quarkus MyFaces extension dependency
- Update Maven compiler plugin for Quarkus compatibility if needed

**Current Dependency Block (pom.xml:61-66)**:
```xml
<dependency>
    <groupId>org.jboss.spec.javax.faces</groupId>
    <artifactId>jboss-jsf-api_2.1_spec</artifactId>
    <version>2.1.28.Final</version>
    <scope>provided</scope>
</dependency>
```

**Replacement**:
```xml
<dependency>
    <groupId>io.quarkus</groupId>
    <artifactId>quarkus-myfaces</artifactId>
</dependency>
```

**Notes**: Remove `provided` scope as Quarkus manages dependencies differently. The version will be managed by Quarkus BOM.

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

### src/main/webapp/addCustomer.xhtml
**Path**: `src/main/webapp/addCustomer.xhtml`
**Reason**: Update JSF namespace declarations to modern JSF 2.3+ format for Quarkus MyFaces compatibility
**Exact Changes**:
- Update namespace URIs from `java.sun.com` to `xmlns.jcp.org` format
- Maintain all existing JSF component usage and structure

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

**Current Namespaces (invalidName.xhtml:19-21)**:
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

**Notes**: Error page rendering remains functionally identical.

### src/main/webapp/template.xhtml
**Path**: `src/main/webapp/template.xhtml`
**Reason**: Update JSF namespace declarations to modern JSF 2.3+ format for Quarkus MyFaces compatibility
**Exact Changes**:
- Update namespace URIs from `java.sun.com` to `xmlns.jcp.org` format
- Maintain all existing JSF template structure

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

### src/main/resources/application.properties (New File)
**Path**: `src/main/resources/application.properties`
**Reason**: Add Quarkus MyFaces configuration properties for proper JSF behavior
**Exact Changes**:
- Create new file with MyFaces-specific configuration
- Configure view handling, state saving, and security settings

**Required Content**:
```properties
# MyFaces Configuration
quarkus.myfaces.initial-state-saving-method=server
quarkus.myfaces.facelets-suffix=.xhtml
quarkus.myfaces.default-suffix=.xhtml
quarkus.myfaces.project-stage=Development

# JSF Servlet Mapping
quarkus.myfaces.faces-servlet.url-patterns=*.xhtml,/faces/*
```

**Notes**: Additional properties may be needed based on specific application requirements and Quarkus version.
