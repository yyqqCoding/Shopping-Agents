FROM maven:3.9.9-eclipse-temurin-17 AS build
ENV MAVEN_OPTS=-Xmx384m
WORKDIR /build
COPY commerce-service/pom.xml ./
RUN mvn -B -q dependency:go-offline
COPY commerce-service/src ./src
RUN mvn -B -q -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /build/target/commerce-service-1.0.0.jar app.jar
# The importer and the delivery terms read the authored catalog.
COPY examples/assistant/data/catalog.json examples/assistant/data/inventory.json \
     examples/assistant/data/evidence.json examples/assistant/data/policies.json ./data/
COPY examples/assistant/data/legacy/catalog.json examples/assistant/data/legacy/evidence.json ./data/legacy/
ENV COMMERCE_DATA_DIR=/app/data \
    TZ=UTC \
    JAVA_TOOL_OPTIONS="-Xms128m -Xmx256m -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC -Xss512k"
RUN useradd --system --uid 10001 app
USER app
EXPOSE 8080
# Extra arguments pass to Spring, e.g. --spring.profiles.active=import.
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
