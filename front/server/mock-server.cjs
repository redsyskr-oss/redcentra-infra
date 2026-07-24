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
  //   3) getRemovable 무력화 — lodash-id는 DELETE 때마다 전체 db를 훑어 "부모가 없는 FK"를 가진
  //      행을 연쇄 삭제한다. 그런데 `xxxId`로 끝나는 필드를 전부 FK로 간주하기 때문에, users의
  //      `userId`(로그인 아이디 문자열)를 users 컬렉션 FK로 오인해 아무 컬렉션에 DELETE 한 번만
  //      발생해도 users 전체가 삭제되는 치명적 부작용이 있다. 연쇄 삭제는 쓰지 않으므로 항상
  //      빈 배열을 반환해 무력화한다.
  getRemovable() {
    return [];
  },
});

server.use(middlewares);
server.use(router);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`[mock-server] json-server(patched) listening on http://localhost:${PORT}`);
});
