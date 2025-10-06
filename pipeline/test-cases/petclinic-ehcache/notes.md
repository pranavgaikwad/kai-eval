# EhCache 2.x to 3.x Migration for Spring Framework 6 Compatibility

## Summary
**Issue ID**: Spring Framework 6 EhCache Migration
**Target Technology**: Spring Framework 6.0
**Change Contract**: Replace EhCache 2.x dependencies and Spring's `org.springframework.cache.ehcache` package with EhCache 3.x and JCache (JSR-107) integration. Remove obsolete Spring EhCache support classes and migrate to JCache-compatible configuration.

The Spring Framework 6.0 has removed the `org.springframework.cache.ehcache` package that provided support for EhCache 2.x, which uses deprecated Java EE APIs. EhCache 3.x with JCache (JSR-107) support is the required replacement.

## Affected Surface Area

### Components/Modules Touched
- **Caching Configuration**: ToolsConfig.java (Spring configuration for cache management)
- **Maven Dependencies**: pom.xml (EhCache and Hibernate EhCache dependencies)
- **Cache Configuration**: ehcache.xml (EhCache 2.x XML configuration)
- **Service Layer**: ClinicServiceImpl.java (uses @Cacheable annotation - no changes needed)

### Direct vs. Indirect Occurrences
**Direct Occurrences**:
- ToolsConfig.java:35-36 - Spring EhCache imports
- ToolsConfig.java:47 - net.sf.ehcache import
- ToolsConfig.java:69-73 - EhCacheCacheManager bean
- ToolsConfig.java:75-80 - EhCacheManagerFactoryBean bean
- pom.xml:247-249 - hibernate-ehcache dependency
- ehcache.xml:1-18 - EhCache 2.x configuration

**Indirect Occurrences**:
- pom.xml:179-184 - spring-context-support dependency (used for EhCacheCacheManager)
- ClinicServiceImpl.java:102 - @Cacheable annotation (compatible with new setup)

## Per-File Change Plan

### File: pom.xml
**Path**: /home/pranav/Projects/00_analysis_apps/spring-framework-petclinic/pom.xml
**Reason**: Replace EhCache 2.x dependencies with EhCache 3.x and JCache dependencies for Spring Framework 6 compatibility.

**Exact Changes**:
- Remove `hibernate-ehcache` dependency (lines 245-249)
- Add EhCache 3.x with Jakarta classifier dependency
- Add JCache API dependency
- Add JCache EhCache provider dependency

**Citations**:
- Current hibernate-ehcache: pom.xml:245-249
- Spring context support: pom.xml:179-184

**Before**:
```xml
<dependency>
    <groupId>org.hibernate</groupId>
    <artifactId>hibernate-ehcache</artifactId>
    <version>${hibernate.version}</version>
</dependency>
```

**After**:
```xml
<!-- JCache API for Spring caching integration -->
<dependency>
    <groupId>javax.cache</groupId>
    <artifactId>cache-api</artifactId>
    <version>1.1.1</version>
</dependency>
<!-- EhCache 3.x with Jakarta classifier for Spring Framework 6 -->
<dependency>
    <groupId>org.ehcache</groupId>
    <artifactId>ehcache</artifactId>
    <version>3.10.8</version>
    <classifier>jakarta</classifier>
</dependency>
```

**Notes**: The spring-context-support dependency (pom.xml:179-184) should remain as it provides JCache support.

### File: ToolsConfig.java
**Path**: /home/pranav/Projects/00_analysis_apps/spring-framework-petclinic/src/main/java/org/springframework/samples/petclinic/config/ToolsConfig.java
**Reason**: Replace Spring EhCache-specific classes with JCache (JSR-107) integration for Spring Framework 6 compatibility.

**Exact Changes**:
- Replace Spring EhCache imports with JCache imports
- Replace EhCacheCacheManager with JCacheCacheManager
- Replace EhCacheManagerFactoryBean with programmatic JCache CacheManager configuration
- Update bean method implementations

**Citations**:
- EhCache imports: ToolsConfig.java:35-36
- net.sf.ehcache import: ToolsConfig.java:47
- EhCacheCacheManager bean: ToolsConfig.java:67-73
- EhCacheManagerFactoryBean bean: ToolsConfig.java:75-80

**Before**:
```java
import org.springframework.cache.ehcache.EhCacheCacheManager;
import org.springframework.cache.ehcache.EhCacheManagerFactoryBean;
import net.sf.ehcache.CacheManager;

@Bean
@Autowired
public EhCacheCacheManager ehCacheCacheManager(CacheManager cacheManager) {
    EhCacheCacheManager ehCacheCacheManager = new EhCacheCacheManager();
    ehCacheCacheManager.setCacheManager(cacheManager);
    return ehCacheCacheManager;
}

@Bean
public EhCacheManagerFactoryBean cacheManager() {
    EhCacheManagerFactoryBean ehCacheManager = new EhCacheManagerFactoryBean();
    ehCacheManager.setConfigLocation(new ClassPathResource("cache/ehcache.xml"));
    return ehCacheManager;
}
```

**After**:
```java
import javax.cache.Caching;
import javax.cache.spi.CachingProvider;
import org.springframework.cache.jcache.JCacheCacheManager;

@Bean
public JCacheCacheManager cacheManager() {
    CachingProvider cachingProvider = Caching.getCachingProvider();
    javax.cache.CacheManager ehCacheManager = cachingProvider.getCacheManager();
    return new JCacheCacheManager(ehCacheManager);
}
```

**Notes**: The @Autowired ehCacheCacheManager method will be removed entirely as JCacheCacheManager construction is simplified.

### File: ehcache.xml
**Path**: /home/pranav/Projects/00_analysis_apps/spring-framework-petclinic/src/main/resources/cache/ehcache.xml
**Reason**: Convert EhCache 2.x XML configuration to EhCache 3.x format for compatibility.

**Exact Changes**:
- Replace EhCache 2.x XML structure with EhCache 3.x configuration format
- Convert cache element attributes to EhCache 3.x syntax
- Update schema references

**Citations**:
- Current EhCache 2.x config: ehcache.xml:1-18

**Before**:
```xml
<ehcache xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="ehcache.xsd"
         updateCheck="false">
    <diskStore path="java.io.tmpdir"/>

    <!-- objects are evicted from the cache every 60 seconds -->
    <cache name="vets"
           timeToLiveSeconds="60"
           maxElementsInMemory="100"
           eternal="false"
           overflowToDisk="false"
           maxElementsOnDisk="10000000"
           diskPersistent="false"
           diskExpiryThreadIntervalSeconds="1"
           memoryStoreEvictionPolicy="LRU"/>

</ehcache>
```

**After**:
```xml
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns="http://www.ehcache.org/v3"
        xsi:schemaLocation="http://www.ehcache.org/v3
                            http://www.ehcache.org/schema/ehcache-core-3.0.xsd">

    <cache alias="vets">
        <key-type>java.lang.Object</key-type>
        <value-type>java.lang.Object</value-type>
        <expiry>
            <ttl unit="seconds">60</ttl>
        </expiry>
        <resources>
            <heap unit="entries">100</heap>
        </resources>
    </cache>

</config>
```

**Notes**: EhCache 3.x uses different XML structure and attribute names. The disk store configuration is handled differently in v3.x.

### File: ehcache.xsd
**Path**: /home/pranav/Projects/00_analysis_apps/spring-framework-petclinic/src/main/resources/cache/ehcache.xsd
**Reason**: Remove obsolete EhCache 2.x schema file as it's no longer needed.

**Exact Changes**:
- Delete the entire ehcache.xsd file

**Citations**:
- Schema file reference: ehcache.xml:2

**Notes**: EhCache 3.x uses online schema validation, local XSD file is not required.

## Build and Runtime Configuration

### Maven Build Properties
Add properties section for new dependency versions:
```xml
<!-- Caching -->
<jcache-api.version>1.1.1</jcache-api.version>
<ehcache.version>3.10.8</ehcache.version>
```

### Runtime Considerations
- **Classpath**: EhCache 3.x with jakarta classifier ensures compatibility with Spring Framework 6's Jakarta EE requirements
- **Configuration Loading**: JCache CacheManager will automatically discover ehcache.xml in classpath
- **Cache Names**: The "vets" cache name remains the same, ensuring @Cacheable annotations continue to work
- **Memory Configuration**: EhCache 3.x resource management is different but functionally equivalent
