ARG NODE_VERSION=20
ARG JAVA_VERSION=21
ARG MAVEN_VERSION=3.9.11
ARG KAI_VERSION=v0.8.0-beta.4
ARG TARGETPLATFORM

FROM quay.io/konveyor/jdtls-server-base:latest AS jdtls-source

FROM registry.access.redhat.com/ubi9/ubi AS rulesets-download
ARG KAI_VERSION
ARG TARGETPLATFORM
RUN dnf install -y git curl && dnf clean all && rm -rf /var/cache/dnf
WORKDIR /rules
RUN git clone https://github.com/konveyor/rulesets.git .
WORKDIR /analyzer
RUN case "${TARGETPLATFORM}" in \
        "linux/amd64") ANALYZER_BINARY="kai-analyzer-rpc-linux-x86_64" ;; \
        "linux/arm64") ANALYZER_BINARY="kai-analyzer-rpc-linux-aarch64" ;; \
        "darwin/amd64") ANALYZER_BINARY="kai-analyzer-rpc-macos-x86_64" ;; \
        "darwin/arm64") ANALYZER_BINARY="kai-analyzer-rpc-macos-arm64" ;; \
        "windows/amd64") ANALYZER_BINARY="kai-analyzer-rpc-windows-X64.exe" ;; \
        *) echo "Unsupported platform: ${TARGETPLATFORM}" && exit 1 ;; \
    esac && \
    KAI_ANALYZER_URL="https://github.com/konveyor/kai/releases/download/${KAI_VERSION}/${ANALYZER_BINARY}" && \
    echo "Downloading analyzer for ${TARGETPLATFORM}: ${KAI_ANALYZER_URL}" && \
    curl -fsSL -o kai_analyzer_rpc "${KAI_ANALYZER_URL}" && \
    chmod +x kai_analyzer_rpc

FROM registry.access.redhat.com/ubi9/ubi AS builder
ARG NODE_VERSION
WORKDIR /app
RUN dnf update -y && dnf install -y curl tar gzip && dnf clean all && rm -rf /var/cache/dnf
RUN curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}.*/node-v${NODE_VERSION}.*-linux-x64.tar.xz | \
    tar -xJ -C /usr/local --strip-components=1
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
COPY tsconfig.json jest.config.js ./
RUN npm run build

FROM registry.access.redhat.com/ubi9/ubi-minimal
ARG NODE_VERSION
ARG JAVA_VERSION
ARG MAVEN_VERSION

RUN microdnf update -y && \
    microdnf install -y \
        java-${JAVA_VERSION}-openjdk-headless \
        curl tar gzip --nodocs --setopt=install_weak_deps=0 && \
    microdnf clean all && rm -rf /var/cache/dnf

RUN curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}.*/node-v${NODE_VERSION}.*-linux-x64.tar.xz | \
    tar -xJ -C /usr/local --strip-components=1

RUN curl -fsSL -o /tmp/apache-maven.tar.gz https://dlcdn.apache.org/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz && \
    tar -xzf /tmp/apache-maven.tar.gz -C /usr/local/ && \
    ln -s /usr/local/apache-maven-${MAVEN_VERSION}/bin/mvn /usr/bin/mvn && \
    rm /tmp/apache-maven.tar.gz

ENV JAVA_HOME=/usr/lib/jvm/java-${JAVA_VERSION}-openjdk \
    M2_HOME=/usr/local/apache-maven-${MAVEN_VERSION} \
    NODE_ENV=production

RUN useradd -m -u 1001 -s /bin/bash kaiuser && \
    mkdir -p /app /jdtls /workspace /logs /rules /analyzer && \
    chown -R kaiuser:kaiuser /app /workspace /logs /rules /analyzer

COPY --from=jdtls-source --chown=kaiuser:kaiuser /jdtls /jdtls
COPY --from=rulesets-download --chown=kaiuser:kaiuser /rules /rules
COPY --from=rulesets-download --chown=kaiuser:kaiuser /analyzer/kai_analyzer_rpc /analyzer/
COPY --from=builder --chown=kaiuser:kaiuser /app/dist /app/dist
COPY --from=builder --chown=kaiuser:kaiuser /app/node_modules /app/node_modules
COPY --from=builder --chown=kaiuser:kaiuser /app/package.json /app/package.json

COPY --chown=kaiuser:kaiuser .config.container.json /app/.config.json
COPY --chown=kaiuser:kaiuser scripts/entrypoint.sh /app/
RUN chmod +x /app/entrypoint.sh

USER kaiuser
WORKDIR /app
EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["--help"]