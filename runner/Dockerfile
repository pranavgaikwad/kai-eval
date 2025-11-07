ARG NODE_VERSION=22.11.0
ARG JAVA_VERSION=21
ARG MAVEN_VERSION=3.9.11
ARG KAI_VERSION=v0.8.0-beta.4

FROM quay.io/konveyor/jdtls-server-base:latest AS jdtls-source

FROM registry.access.redhat.com/ubi9/ubi AS rulesets-download
ARG KAI_VERSION
ARG TARGETPLATFORM
RUN dnf install -y git curl --allowerasing && dnf clean all && rm -rf /var/cache/dnf
WORKDIR /rules
RUN git clone https://github.com/konveyor/rulesets.git .
WORKDIR /analyzer
RUN case "${TARGETPLATFORM:-linux/amd64}" in \
        linux/amd64*) ANALYZER_BINARY="kai-analyzer-rpc-linux-x86_64" ;; \
        linux/arm64*) ANALYZER_BINARY="kai-analyzer-rpc-linux-aarch64" ;; \
        darwin/amd64*) ANALYZER_BINARY="kai-analyzer-rpc-macos-x86_64" ;; \
        darwin/arm64*) ANALYZER_BINARY="kai-analyzer-rpc-macos-arm64" ;; \
        windows/amd64*) ANALYZER_BINARY="kai-analyzer-rpc-windows-X64.exe" ;; \
        *) echo "Unsupported platform: ${TARGETPLATFORM:-linux/amd64}" && exit 1 ;; \
    esac && \
    KAI_ANALYZER_URL="https://github.com/konveyor/kai/releases/download/${KAI_VERSION}/${ANALYZER_BINARY}" && \
    echo "Downloading analyzer for ${TARGETPLATFORM:-linux/amd64}: ${KAI_ANALYZER_URL}" && \
    curl -fsSL -o kai_analyzer_rpc "${KAI_ANALYZER_URL}" && \
    chmod +x kai_analyzer_rpc

FROM registry.access.redhat.com/ubi9/ubi AS builder
ARG NODE_VERSION
ARG MAVEN_VERSION
ARG TARGETPLATFORM
WORKDIR /app
RUN dnf update -y && dnf install -y curl tar gzip xz git --allowerasing && dnf clean all && rm -rf /var/cache/dnf
RUN case "${TARGETPLATFORM:-linux/amd64}" in \
        linux/amd64*) NODE_DIST="linux-x64" ;; \
        linux/arm64*) NODE_DIST="linux-arm64" ;; \
        darwin/amd64*) NODE_DIST="macos-x64" ;; \
        darwin/arm64*) NODE_DIST="macos-arm64" ;; \
        windows/amd64*) NODE_DIST="win-x64" ;; \
        *) echo "Unsupported platform for Node: ${TARGETPLATFORM:-linux/amd64}" && exit 1 ;; \
    esac && \
    curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_DIST}.tar.xz -o node.tar.xz && \
    tar -xJ -C /usr/local --strip-components=1 -f node.tar.xz && \
    rm node.tar.xz
RUN curl -fsSL -o /tmp/apache-maven.tar.gz https://dlcdn.apache.org/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz && \
    tar -xzf /tmp/apache-maven.tar.gz -C /usr/local/ && \
    rm /tmp/apache-maven.tar.gz
COPY package.json ./
COPY scripts/ ./scripts/
RUN chmod +x ./scripts/*.sh
COPY src/ ./src/
COPY tsconfig.json jest.config.js ./
RUN npm i -g patch-package && npm run pre-build && npm install && npm run build

FROM registry.access.redhat.com/ubi9/ubi-minimal
ARG NODE_VERSION
ARG JAVA_VERSION
ARG MAVEN_VERSION

RUN microdnf update -y && \
    microdnf install -y \
        git \
        bash \
        java-${JAVA_VERSION}-openjdk-devel \
        --nodocs --setopt=install_weak_deps=0 && \
    microdnf clean all && rm -rf /var/cache/dnf

# Copy Node.js from builder stage instead of downloading
COPY --from=builder /usr/local/bin/node /usr/local/bin/
COPY --from=builder /usr/local/bin/npm /usr/local/bin/
COPY --from=builder /usr/local/bin/npx /usr/local/bin/
COPY --from=builder /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=builder /usr/local/include/node /usr/local/include/node

# Copy Maven from builder stage
COPY --from=builder /usr/local/apache-maven-${MAVEN_VERSION} /usr/local/apache-maven-${MAVEN_VERSION}
RUN ln -s /usr/local/apache-maven-${MAVEN_VERSION}/bin/mvn /usr/bin/mvn

ENV JAVA_HOME=/usr/lib/jvm/java-${JAVA_VERSION}-openjdk \
    M2_HOME=/usr/local/apache-maven-${MAVEN_VERSION} \
    NODE_ENV=production

RUN useradd -m -u 1001 -s /bin/bash kaiuser && \
    mkdir -p /app /jdtls /workspace /logs /rules /analyzer /output && \
    chown -R kaiuser:kaiuser /app /workspace /logs /rules /analyzer /output

COPY --from=jdtls-source --chown=kaiuser:kaiuser /jdtls /jdtls
COPY --from=rulesets-download --chown=kaiuser:kaiuser /rules /rules
COPY --from=rulesets-download --chown=kaiuser:kaiuser /analyzer/kai_analyzer_rpc /analyzer/
COPY --from=builder --chown=kaiuser:kaiuser /app/dist /app/dist
COPY --from=builder --chown=kaiuser:kaiuser /app/node_modules /app/node_modules
COPY --from=builder --chown=kaiuser:kaiuser /app/vendor /app/vendor
COPY --from=builder --chown=kaiuser:kaiuser /app/package.json /app/package.json

COPY --chown=kaiuser:kaiuser .config.container.json /app/.config.json
COPY --chown=kaiuser:kaiuser scripts/entrypoint.sh /app/
RUN chmod +x /app/entrypoint.sh

USER kaiuser
WORKDIR /app
EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["--help"]
