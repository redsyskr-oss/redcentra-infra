# RedCentra 폐쇄망 배포

## 1. 반입 전 준비

1. `.env.example`을 `.env`로 복사하고 모든 `change-me` 값을 교체한다.
2. `RELEASE-MANIFEST.txt`의 이미지 태그와 실제 반입 이미지가 일치하는지 확인한다.
3. 이미지 tar 파일을 `images/`에 배치한다. tar 파일은 Git에 포함하지 않는다.
4. TLS를 사용할 경우 인증서와 개인키를 `nginx/certs/`에 배치하고 Nginx 설정을 환경에 맞게 수정한다.
5. `SHA256SUMS`로 Git에 포함된 배포 설정 파일의 무결성을 확인한다.

```bash
sha256sum -c SHA256SUMS
```

## 2. 이미지 로드

```bash
docker load -i images/infra-images.tar
docker load -i images/api-server-image.tar

# 프런트엔드 이미지 반입 시
docker load -i images/frontend-image.tar
```

## 3. 호스트 사전 설정

```bash
sudo sysctl -w vm.max_map_count=262144
docker compose version
docker compose config --quiet
docker compose config --images
```

## 4. 서비스 기동

기본 명령은 인프라와 Grafana를 기동한다.

```bash
docker compose up -d
docker compose ps
```

API 서버와 Nginx를 함께 기동한다.

```bash
docker compose --profile app up -d
docker compose ps
```

현재 Compose에는 프런트엔드 서비스가 정의되어 있지 않다. 프런트엔드 이미지를 실제로 배포하려면 서비스 정의와 Nginx 라우팅을 추가해야 한다.

## 5. 점검

```bash
docker compose ps
docker compose logs --tail=200 api-server
docker compose logs --tail=200 opensearch
curl -fsS http://localhost:8080/actuator/health
curl -fsS http://localhost:3001/api/health
```

RabbitMQ Management UI는 호스트의 `15672`, SeaweedFS S3 API는 `8333`, Grafana는 `3001` 포트를 사용한다. 운영 환경에서는 방화벽과 접근 통제를 적용한다.

## 6. 보안 및 데이터 주의사항

- `.env`, TLS 개인키, 이미지 tar는 Git에 커밋하지 않는다.
- `seaweedfs/s3.json`의 키와 `.env`의 SeaweedFS 키는 반드시 일치시킨다.
- `docker compose down -v`는 모든 네임드 볼륨 데이터를 삭제하므로 승인 없이 실행하지 않는다.
- 업데이트 전에 MariaDB, OpenSearch, SeaweedFS, Grafana 데이터를 백업한다.

