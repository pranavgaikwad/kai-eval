# JSF to Quarkus MyFaces Migration - Fix Notes

## Summary

**Issue ID**: Replace JSF dependency with Quarkus MyFaces
**Target Technology**: Quarkus
**Change Contract**: Replace JBoss JSF 2.1 implementation with Quarkus MyFaces extension, update JSF managed bean scope annotations from `javax.faces.bean.RequestScoped` to CDI `jakarta.enterprise.context.RequestScoped`, and update JSF view namespace declarations for modern JSF compatibility.

## Affected Surface Area

### Components/Modules Touched
- **Presentation Layer**: JSF managed beans (2 classes), JSF views (6 XHTML files), JSF configuration
- **Build System**: Maven dependencies and configuration
- **Public APIs**: JSF managed bean interfaces accessible via Expression Language
- **Entry Points**: Web application serving JSF pages at `/jboss-cmt/*`

### Direct vs. Indirect Occurrences Map
- **Direct JSF Usage**:
  - Maven dependency: `pom.xml:61-66`
  - Java imports: 2 managed bean classes
  - XHTML namespace declarations: 6 view files
  - Configuration: `faces-config.xml`
- **Indirect JSF Usage**:
  - JSF Expression Language bindings in XHTML: `#{customerManager.addCustomer(name)}`
  - Navigation outcomes referenced in `faces-config.xml:21-41`
  - URL mappings in `index.html:21`

## Per-File Change Plan

### pom.xml
**Path**: `pom.xml`
**Reason**: Replace JBoss JSF API dependency with Quarkus MyFaces extension to enable JSF support in Quarkus runtime
**Exact Changes**:
- Remove JBoss JSF API dependency (lines 61-66)
- Add Quarkus MyFaces extension dependency
- Update Maven compiler plugin for Quarkus compatibility if needed

**Citations**:
- Before: `pom.xml:61-66`
- After: New dependency block to be added

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

**Citations**:
- Before: `CustomerManager.java:22` - `import javax.faces.bean.RequestScoped;`
- Before: `CustomerManager.java:36` - `@RequestScoped`
- After: Replace import, keep annotation usage

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

**Citations**:
- Before: `LogMessageManager.java:21` - `import javax.faces.bean.RequestScoped;`
- Before: `LogMessageManager.java:35` - `@RequestScoped`
- After: Replace import, keep annotation usage

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
**Reason**: Add Quarkus MyFaces configuration properties for proper JSF behavior
**Exact Changes**:
- Create new file with MyFaces-specific configuration
- Configure view handling, state saving, and security settings

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
```

**Notes**: Additional properties may be needed based on specific application requirements and Quarkus version.

## Additional Migration Considerations

### Build Changes Required
- **Maven Wrapper**: Ensure Maven version supports Quarkus (3.6.3+)
- **Java Version**: Verify Java 8 compatibility with target Quarkus version
- **Plugin Updates**: May need Quarkus Maven plugin for proper build lifecycle

### Runtime Configuration
- **Servlet Context**: Quarkus handles servlet mapping differently than traditional application servers
- **CDI Integration**: Verify all `@Inject` dependencies work with Quarkus CDI implementation
- **Transaction Integration**: Ensure EJB transaction management works with Quarkus Narayana

### Testing Requirements
- **Integration Tests**: Verify all JSF pages render correctly
- **Form Submission**: Test customer creation flow end-to-end
- **Navigation**: Verify all `faces-config.xml` navigation rules work
- **Data Tables**: Test customer and log message listing functionality
- **Error Handling**: Verify duplicate/invalid name error pages display correctly
