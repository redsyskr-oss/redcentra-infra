// 로컬 목업 API 서버 (json-server 0.17.4 래퍼).
// `json-server --watch ...` CLI 대신 이 스크립트를 쓰는 이유 두 가지:
//   1) getById 널 가드 패치 — lodash-id 0.14.1의 getById가 `id.toString()`을 가드 없이 호출해서,
//      우리 스키마의 null 가능 FK(rackId, approverId 등) 때문에 DELETE 요청마다 실행되는
//      내부 무결성 검사(getRemovable)가 500으로 죽는 버그를 막는다.
//   2) --watch 제거 — db.json을 실행 중에 다시 생성하면(예: seed.mjs 재실행) 파일 감시 리로드가
//      내부 상태를 깨뜨리는 문제를 겪었다. db.json을 바꿨으면 이 서버를 수동으로 재시작한다.
const jsonServer = require('json-server');
const path = require('path');

const dbPath = path.join(__dirname, 'db.json');
const server = jsonServer.create();
const router = jsonServer.router(dbPath);
const middlewares = jsonServer.defaults();

router.db._.mixin({
  getById(collection, id) {
    if (id === null || id === undefined) return undefined;
    return this.find(collection, (doc) => doc && doc.id != null && doc.id.toString() === id.toString());
  },
});

server.use(middlewares);
server.use(router);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`[mock-server] json-server(patched) listening on http://localhost:${PORT}`);
});
