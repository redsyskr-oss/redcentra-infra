# RedCentra 폐쇄망 테스트·운영 배포 절차

> **대상**: RedCentra 프런트엔드 및 인프라 서비스
> **인프라**: Nginx, RabbitMQ, MariaDB, Redis, OpenSearch, SeaweedFS, Grafana
> **애플리케이션**: Next.js 프런트엔드, Spring Boot API 서버
> **전제**: 폐쇄망 서버에 Docker Engine과 Docker Compose v2가 설치되어 있어야 한다.
> **인증**: 브라우저 토큰 저장 없이 Spring Boot가 발급하는 Secure HttpOnly 쿠키를 사용한다.

---

## 1. 배포 단계

배포는 다음 세 단계로 분리한다.

1. `infra`: 핵심 인프라만 기동
2. `monitoring`: Grafana 등 모니터링 서비스 추가
3. `app`: Next.js 프런트엔드, Spring Boot API 서버, Nginx 추가

```bash
# 핵심 인프라
docker compose up -d

# 핵심 인프라 + 모니터링
docker compose --profile monitoring up -d

# 전체 서비스
docker compose --profile app --profile monitoring up -d
```

API 서버가 아직 반입되지 않은 최초 배포에서는 `infra`만 기동한다. 프런트엔드 또는 인증을 테스트할 때는 HTTPS 종단점이 필요하므로 Nginx를 포함한 `app` 프로파일을 사용한다.

---

## 2. 고정 이미지 목록

`latest` 태그는 사용하지 않는다. 이미지 태그, Compose 파일, 반입 목록은 항상 동일해야 한다.

| 서비스 | 이미지 | 태그 | 프로파일 | 비고 |
|---|---|---:|---|---|
| nginx | `nginx` | `1.30.3` | `app` | HTTPS 및 리버스 프록시 |
| rabbitmq | `rabbitmq` | `3.13-management-alpine` | 기본 | Management UI 포함 |
| mariadb | `mariadb` | `11.8.8-noble` | 기본 | 공식 태그 존재 확인 완료 |
| redis | `redis` | `7-alpine` | 기본 | 비밀번호 적용 |
| opensearch | `opensearchproject/opensearch` | `2.19.1` | 기본 | 반입 직전 실제 태그 재확인 |
| seaweedfs | `chrislusf/seaweedfs` | `3.80` | 기본 | 반입 직전 실제 태그 재확인 |
| grafana | `grafana/grafana-oss` | `12.0.4` | `monitoring` | 데이터 볼륨 필수 |
| frontend | `<사내레지스트리>/redcentra-frontend` | `<릴리스버전>` | `app` | Next.js standalone 이미지 |
| api-server | `<사내레지스트리>/redcentra-api` | `<릴리스버전>` | `app` | 별도 반입 가능 |

릴리스 태그 예시:

```text
redcentra-frontend:2026.07.22-1
redcentra-api:2026.07.22-1
```

태그뿐 아니라 이미지 Digest도 반입 명세서에 기록한다.

```bash
docker image inspect nginx:1.30.3 --format '{{index .RepoDigests 0}}'
```

---

## 3. 사전 확인

### 3.1 서버 아키텍처

폐쇄망 서버가 일반적인 x86_64인 경우 모든 이미지를 `linux/amd64`로 통일한다.

```bash
uname -m
# x86_64 확인
```

인터넷망 준비 PC가 ARM 또는 Windows Docker Desktop이어도 대상 서버 플랫폼으로 명시해서 받는다.

### 3.2 OpenSearch 커널 설정

Linux 호스트에서 다음 값을 적용한다.

```bash
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-opensearch.conf
sudo sysctl --system
sysctl vm.max_map_count
```

기대 결과:

```text
vm.max_map_count = 262144
```

### 3.3 디스크와 메모리

반입 전에 최소한 다음 항목을 확인한다.

```bash
df -h
free -h
docker info
docker compose version
```

OpenSearch JVM Heap의 시작값과 최대값은 동일하게 설정하고 서버 메모리를 고려해 결정한다.

```yaml
environment:
  OPENSEARCH_JAVA_OPTS: -Xms2g -Xmx2g
```

---

## 4. 인터넷망 PC — 이미지 준비

### 4.1 인프라 이미지 Pull

아래 예시는 폐쇄망 서버가 `linux/amd64`인 경우다.

```bash
docker pull --platform linux/amd64 nginx:1.30.3
docker pull --platform linux/amd64 rabbitmq:3.13-management-alpine
docker pull --platform linux/amd64 mariadb:11.8.8-noble
docker pull --platform linux/amd64 redis:7-alpine
docker pull --platform linux/amd64 opensearchproject/opensearch:2.19.1
docker pull --platform linux/amd64 chrislusf/seaweedfs:3.80
docker pull --platform linux/amd64 grafana/grafana-oss:12.0.4
```

### 4.2 이미지 버전과 플랫폼 확인

```bash
docker image inspect nginx:1.30.3 --format '{{.Os}}/{{.Architecture}} {{.Id}}'
docker image inspect opensearchproject/opensearch:2.19.1 --format '{{.Os}}/{{.Architecture}} {{.Id}}'
docker image inspect chrislusf/seaweedfs:3.80 --format '{{.Os}}/{{.Architecture}} {{.Id}}'
```

`latest`로 받은 이미지를 그대로 반입하지 않는다. 실제 버전을 확인한 후 명시적인 버전 태그로 다시 Pull한다.

### 4.3 Next.js 프런트엔드 이미지

이 프로젝트는 SSR과 Next.js API Route를 사용하므로 Nginx 정적 파일만으로 서비스할 수 없다. Node.js 런타임이 포함된 Docker 이미지로 배포한다.

`next.config.ts`에는 다음 설정을 사용하는 것을 권장한다.

```ts
const nextConfig = {
  output: 'standalone',
};
```

이미지 빌드 예시:

```bash
docker build \
  --platform linux/amd64 \
  -t redcentra-frontend:2026.07.22-1 \
  .
```

프런트엔드 런타임 환경변수 예시:

```dotenv
NODE_ENV=production
PORT=3000
INTERNAL_BACKEND_URL=http://api-server:8080/api/v1
SESSION_SECRET=<충분히 긴 임의값>
MOCK_API=false
```

`INTERNAL_BACKEND_URL`에는 호스트의 `localhost`가 아니라 Compose 서비스 이름을 사용한다.

### 4.4 API 서버 이미지

```bash
docker build \
  --platform linux/amd64 \
  -t redcentra-api:2026.07.22-1 \
  <API_SERVER_SOURCE_DIRECTORY>
```

API 서버는 MariaDB, Redis, RabbitMQ, OpenSearch가 healthy 상태가 된 뒤 시작하도록 구성한다.

### 4.5 이미지 아카이브 생성

인프라와 애플리케이션 이미지를 분리하면 업데이트 및 재반입이 편리하다.

```bash
docker image save --platform linux/amd64 -o infra-images.tar \
  nginx:1.30.3 \
  rabbitmq:3.13-management-alpine \
  mariadb:11.8.8-noble \
  redis:7-alpine \
  opensearchproject/opensearch:2.19.1 \
  chrislusf/seaweedfs:3.80 \
  grafana/grafana-oss:12.0.4

docker image save --platform linux/amd64 -o frontend-image.tar \
  redcentra-frontend:2026.07.22-1

docker image save --platform linux/amd64 -o api-server-image.tar \
  redcentra-api:2026.07.22-1
```

Docker 버전이 `docker image save --platform`을 지원하지 않으면 Pull 단계에서 플랫폼을 고정하고 일반 `docker save`를 사용한다.

---

## 5. 반입물 구성과 무결성

### 5.1 반입 디렉터리

```text
redcentra-release/
├── DEPLOYMENT.md
├── RELEASE-MANIFEST.txt
├── SHA256SUMS
├── docker-compose.yml
├── .env.example
├── images/
│   ├── infra-images.tar
│   ├── frontend-image.tar
│   └── api-server-image.tar        # API 서버 반입 시
├── nginx/
│   ├── nginx.conf
│   ├── conf.d/
│   └── certs/
├── seaweedfs/
│   └── s3.json
├── grafana/
│   └── provisioning/
└── database/
    └── init/                       # 최초 생성용 SQL이 있을 때만
```

실제 비밀번호가 포함된 `.env`와 TLS 개인키는 일반 설정 파일과 분리하여 승인된 보안 절차로 반입한다.

### 5.2 릴리스 Manifest

`RELEASE-MANIFEST.txt`에 다음 정보를 기록한다.

```text
릴리스 버전: 2026.07.22-1
대상 플랫폼: linux/amd64
작성 일시: 2026-07-22
Compose 파일 버전: 1
Frontend 이미지: redcentra-frontend:2026.07.22-1
API 이미지: redcentra-api:2026.07.22-1
```

이미지별 Digest와 파일 크기도 함께 기록한다.

### 5.3 전체 파일 해시

이미지뿐 아니라 배포 설정 파일도 검증한다.

```bash
cd redcentra-release

find . -type f \
  ! -name SHA256SUMS \
  ! -path './nginx/certs/*.key' \
  -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
```

폐쇄망 반입 후:

```bash
sha256sum -c SHA256SUMS
```

모든 항목이 `OK`인지 확인한다.

---

## 6. 폐쇄망 서버 배포 디렉터리

```text
/opt/redcentra/
├── DEPLOYMENT.md
├── RELEASE-MANIFEST.txt
├── SHA256SUMS
├── docker-compose.yml
├── .env
├── nginx/
│   ├── nginx.conf
│   ├── conf.d/
│   └── certs/
├── seaweedfs/
│   └── s3.json
├── grafana/
│   └── provisioning/
└── database/
    └── init/
```

```bash
sudo mkdir -p /opt/redcentra
sudo chown redsys:redsys /opt/redcentra
sudo chmod 750 /opt/redcentra
sudo chmod 600 /opt/redcentra/.env
sudo chmod 600 /opt/redcentra/nginx/certs/*.key
```

---

## 7. 폐쇄망 서버 — 이미지 로드

```bash
cd /opt/redcentra

docker load -i images/infra-images.tar
docker load -i images/frontend-image.tar

# API 서버가 반입된 경우
docker load -i images/api-server-image.tar
```

로드된 이미지와 플랫폼을 확인한다.

```bash
docker images
docker image inspect redcentra-frontend:2026.07.22-1 \
  --format '{{.Os}}/{{.Architecture}} {{.Id}}'
```

폐쇄망에서 외부 Pull을 시도하지 않도록 Compose 서비스에 다음 정책을 권장한다.

```yaml
pull_policy: never
```

기동 전에 최종 Compose 구성을 검사한다.

```bash
docker compose config --quiet
docker compose config --images
```

---

## 8. Compose 필수 구성 원칙

### 8.1 네트워크 분리

```yaml
networks:
  edge:
  app:
    internal: true
  data:
    internal: true
```

- Nginx만 호스트 포트를 공개한다.
- 프런트엔드와 API 서버는 `app` 네트워크에서 통신한다.
- MariaDB, Redis, RabbitMQ, OpenSearch, SeaweedFS는 `data` 내부 네트워크에 둔다.
- API 서버만 `app`, `data` 양쪽 네트워크에 연결한다.

### 8.2 포트 노출 최소화

운영 환경에서는 다음 포트를 호스트에 직접 공개하지 않는 것을 원칙으로 한다.

- MariaDB `3306`
- Redis `6379`
- RabbitMQ AMQP `5672`
- OpenSearch `9200`, `9300`
- SeaweedFS 내부 포트
- Next.js `3000`
- Spring Boot `8080`

점검이 필요한 테스트 기간에만 `127.0.0.1`에 제한하여 임시 공개한다.

```yaml
ports:
  - "127.0.0.1:9200:9200"
```

### 8.3 재시작 정책

```yaml
restart: unless-stopped
```

### 8.4 Healthcheck와 기동 순서

핵심 서비스 전체에 healthcheck를 구성한다. API 서버는 단순 `depends_on`이 아니라 `service_healthy` 조건을 사용한다.

```yaml
api-server:
  depends_on:
    mariadb:
      condition: service_healthy
    redis:
      condition: service_healthy
    rabbitmq:
      condition: service_healthy
    opensearch:
      condition: service_healthy
```

### 8.5 영구 볼륨

```yaml
volumes:
  mariadb-data:
  redis-data:
  rabbitmq-data:
  opensearch-data:
  seaweedfs-master-data:
  seaweedfs-volume-data:
  grafana-data:
```

Grafana는 `/var/lib/grafana`를 반드시 영구 볼륨에 연결한다.

```yaml
volumes:
  - grafana-data:/var/lib/grafana
  - ./grafana/provisioning:/etc/grafana/provisioning:ro
```

---

## 9. 서비스별 권장 설정

### 9.1 MariaDB

비밀번호는 가능하면 Docker secrets 또는 파일 기반 환경변수를 사용한다.

```yaml
environment:
  MARIADB_ROOT_PASSWORD_FILE: /run/secrets/mariadb_root_password
  MARIADB_DATABASE: redcentra
  MARIADB_USER: redcentra
  MARIADB_PASSWORD_FILE: /run/secrets/mariadb_password
```

DB 초기화 SQL은 빈 데이터 볼륨의 최초 시작 시에만 실행된다. 기존 볼륨이 있으면 환경변수와 초기 SQL을 변경해도 자동 재적용되지 않는다.

검증:

```bash
docker compose exec mariadb \
  mariadb-admin ping -uredcentra -p
```

### 9.2 Redis

검증 명령에 비밀번호를 직접 노출하지 않는 방식을 권장한다.

```bash
docker compose exec -e REDISCLI_AUTH='<비밀번호>' redis redis-cli ping
```

기대 결과:

```text
PONG
```

### 9.3 RabbitMQ

```bash
docker compose exec rabbitmq rabbitmq-diagnostics ping
docker compose exec rabbitmq rabbitmq-diagnostics check_running
```

고정 컨테이너 이름 대신 `docker compose exec <서비스명>`을 사용한다.

### 9.4 OpenSearch

Security 플러그인을 유지하는 구성을 기본으로 한다.

```dotenv
OPENSEARCH_INITIAL_ADMIN_PASSWORD=<강력한 비밀번호>
```

Compose 필수 항목:

```yaml
environment:
  discovery.type: single-node
  bootstrap.memory_lock: "true"
  OPENSEARCH_JAVA_OPTS: -Xms2g -Xmx2g
  OPENSEARCH_INITIAL_ADMIN_PASSWORD: ${OPENSEARCH_INITIAL_ADMIN_PASSWORD}
ulimits:
  memlock:
    soft: -1
    hard: -1
  nofile:
    soft: 65536
    hard: 65536
```

Security 플러그인을 사용하는 경우 검증은 HTTPS와 인증을 사용한다.

```bash
curl -k -u "admin:${OPENSEARCH_INITIAL_ADMIN_PASSWORD}" \
  https://localhost:9200/_cluster/health
```

단일 노드는 Replica 구성에 따라 `yellow`가 정상일 수 있다. `red`이면 정상 기동으로 판단하지 않는다.

### 9.5 SeaweedFS

```bash
curl -fsSI http://localhost:8333
```

`s3.json`에 실제 Secret을 직접 넣는 경우 파일 권한을 `600`으로 제한한다.

### 9.6 Grafana

```bash
curl -fsS http://localhost:3001/api/health
```

폐쇄망에서는 Grafana 플러그인을 시작 시 다운로드할 수 없다. 필요한 플러그인이 있으면 버전을 고정한 커스텀 이미지를 인터넷망에서 미리 빌드하고 반입한다.

---

## 10. Nginx 및 Secure 쿠키 인증

### 10.1 HTTPS 필수

백엔드가 `Secure` 쿠키를 사용하므로 테스트 서버도 HTTPS로 접속해야 한다. 일반 서버 IP의 HTTP 주소에서는 Secure 쿠키가 브라우저에 저장되지 않을 수 있다.

```text
https://redcentra-test.example.internal
```

폐쇄망 내부 인증기관에서 발급한 인증서를 권장한다. 자체 서명 인증서를 사용할 경우 테스트 PC의 신뢰 저장소에 CA 인증서를 설치한다.

### 10.2 프록시 헤더

```nginx
location / {
    proxy_pass http://frontend:3000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
}
```

현재 프런트는 Next.js API Route를 BFF로 사용하므로 브라우저 요청을 먼저 프런트엔드로 전달하는 구성이 적합하다.

```text
Browser → Nginx → Next.js → Spring Boot API
```

Spring Boot의 `Set-Cookie` 응답은 Next.js와 Nginx를 거쳐 브라우저에 전달되어야 한다.

확인 항목:

- `Secure`
- `HttpOnly`
- `SameSite=Lax` 또는 정책에 맞는 값
- `Path=/`
- 실제 접속 도메인과 Cookie Domain 일치
- `X-Forwarded-Proto=https` 전달

브라우저 localStorage와 sessionStorage에는 인증 토큰을 저장하지 않는다.

---

## 11. 기동 절차

### 11.1 인프라만 기동

```bash
cd /opt/redcentra
docker compose up -d
docker compose ps
```

### 11.2 모니터링 포함

```bash
docker compose --profile monitoring up -d
docker compose ps
```

### 11.3 전체 애플리케이션 기동

```bash
docker compose --profile app --profile monitoring up -d
docker compose ps
```

### 11.4 로그 확인

```bash
docker compose logs --tail=200 mariadb
docker compose logs --tail=200 opensearch
docker compose logs --tail=200 api-server
docker compose logs --tail=200 frontend
docker compose logs --tail=200 nginx
```

운영 점검 중 무제한 `logs -f`를 장시간 실행하지 않는다. 필요한 경우 서비스 하나만 지정한다.

---

## 12. 최종 동작 검증

| 구분 | 검증 방법 | 기대 결과 |
|---|---|---|
| Compose | `docker compose ps` | 대상 컨테이너가 `running/healthy` |
| MariaDB | `mariadb-admin ping` | `mysqld is alive` |
| Redis | `redis-cli ping` | `PONG` |
| RabbitMQ | `rabbitmq-diagnostics ping` | `Ping succeeded` |
| OpenSearch | `/_cluster/health` | `green` 또는 단일 노드 `yellow` |
| SeaweedFS | `curl -I` | HTTP 응답 |
| Grafana | `/api/health` | DB와 서비스 상태 정상 |
| Frontend | `https://<도메인>/login` | 로그인 화면 표시 |
| API | 프런트 경유 `/api/v1/auth/me` | 로그인 전 401, 로그인 후 사용자 응답 |
| Secure 쿠키 | 브라우저 개발자 도구 | Secure/HttpOnly 쿠키 존재 |
| 로그인 | 정상 계정 로그인 | 대시보드 이동 |
| 세션 | 새로고침 후 `/auth/me` | 로그인 상태 유지 |
| 로그아웃 | 로그아웃 후 `/auth/me` | 401 및 쿠키 만료 |

프런트와 API의 상세 연동은 `/api/v1` CRUD 스펙을 기준으로 검증한다.

---

## 13. 백업 및 복구

### 13.1 금지 명령

다음 명령은 네임드 볼륨의 전체 데이터를 삭제한다.

```bash
docker compose down -v
```

운영 및 테스트 데이터가 필요한 환경에서는 승인 없이 실행하지 않는다.

### 13.2 MariaDB 백업

```bash
docker compose exec -T mariadb \
  mariadb-dump -uredcentra -p redcentra \
  > backup/redcentra-$(date +%Y%m%d-%H%M%S).sql
```

복구 테스트를 정기적으로 수행하지 않은 백업은 유효한 백업으로 간주하지 않는다.

### 13.3 볼륨 목록

```bash
docker volume ls
docker volume inspect redcentra_mariadb-data
```

업데이트 전에 MariaDB, OpenSearch, SeaweedFS, Grafana 데이터의 백업 또는 스냅샷을 확보한다.

---

## 14. 이미지 업데이트

1. 인터넷망에서 신규 이미지를 명시적 태그로 빌드 또는 Pull한다.
2. 취약점 검사 및 라이선스 검토를 수행한다.
3. 이미지 태그와 Digest를 `RELEASE-MANIFEST.txt`에 기록한다.
4. 신규 tar와 `SHA256SUMS`를 생성한다.
5. 승인 절차를 거쳐 폐쇄망에 반입한다.
6. 이미지 로드 후 `docker compose config --images`로 태그를 대조한다.
7. 데이터 백업 후 대상 서비스만 재생성한다.

```bash
docker compose up -d --no-deps --force-recreate frontend
```

애플리케이션 전체 업데이트:

```bash
docker compose --profile app up -d
```

업데이트 후 Healthcheck, 로그인, 주요 CRUD, 로그를 확인한다.

---

## 15. 장애 대응 기본 명령

```bash
# 전체 상태
docker compose ps

# 최근 로그
docker compose logs --tail=200 <서비스명>

# 리소스 사용량
docker stats --no-stream

# 서비스 재시작
docker compose restart <서비스명>

# Compose 설정 검증
docker compose config --quiet

# 디스크 사용량
docker system df
```

데이터 서비스 장애 시 컨테이너 삭제나 볼륨 초기화부터 수행하지 않는다. 먼저 로그, 디스크 용량, 파일 권한, 네트워크, Healthcheck 결과를 수집한다.

---

## 16. 반입·배포 체크리스트

### 인터넷망 준비

- [ ] 모든 이미지 태그가 명시적 버전이다.
- [ ] 대상 플랫폼이 폐쇄망 서버와 일치한다.
- [ ] 이미지 Digest를 기록했다.
- [ ] Next.js 프런트엔드 프로덕션 빌드가 통과했다.
- [ ] Spring Boot 테스트가 통과했다.
- [ ] 이미지 취약점 검사를 완료했다.
- [ ] `docker compose config --quiet`가 통과했다.
- [ ] 이미지 tar와 전체 파일 해시를 생성했다.
- [ ] 실제 비밀번호와 개인키를 일반 배포물에서 분리했다.

### 폐쇄망 반입

- [ ] `sha256sum -c SHA256SUMS`가 모두 통과했다.
- [ ] 모든 이미지를 정상 로드했다.
- [ ] 이미지 플랫폼이 서버와 일치한다.
- [ ] `.env`와 개인키 권한이 `600`이다.
- [ ] `vm.max_map_count=262144`가 적용됐다.
- [ ] 외부 공개가 불필요한 포트를 제거했다.
- [ ] 데이터 볼륨과 백업 경로를 확인했다.

### 기동 후

- [ ] 모든 대상 서비스가 running 또는 healthy 상태다.
- [ ] OpenSearch 상태가 red가 아니다.
- [ ] HTTPS 인증서가 신뢰된다.
- [ ] Secure HttpOnly 쿠키가 정상 발급된다.
- [ ] 로그인, 새로고침, 로그아웃이 정상이다.
- [ ] 서버실, 랙, 장비, 장애 CRUD가 정상이다.
- [ ] 백업 파일 생성과 복구 절차를 확인했다.
- [ ] 운영 로그에 반복 오류가 없다.

---

## 17. 변경 이력

| 일자 | 내용 | 작성자 |
|---|---|---|
| 2026-07-22 | 최초 작성 — 인프라 이미지 폐쇄망 반입 절차 | |
| 2026-07-22 | Next.js 프런트, Spring API, Nginx HTTPS, Secure 쿠키, Healthcheck, 플랫폼·보안·백업 절차 통합 | Codex |
