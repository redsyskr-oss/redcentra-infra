const jsonServer = require('json-server');
const path = require('path');
const fs = require('fs');
const os = require('os');

const server = jsonServer.create();
const middlewares = jsonServer.defaults();

// 번들에 포함된 원본 db.json(읽기 전용) 위치를 찾는다.
const bundledDbPath = fs.existsSync(path.resolve(process.cwd(), 'api/db.json'))
  ? path.resolve(process.cwd(), 'api/db.json')
  : path.resolve(process.cwd(), 'db.json');

// Vercel 서버리스는 함수 번들 자체가 읽기 전용이라 json-server(FileSync)가 POST/PATCH/DELETE
// 후 디스크에 쓰려고 하면 EROFS로 죽는다. 콜드스타트 시 쓰기 가능한 /tmp로 복사해 그 사본을
// 실제 라우터에 물린다 — 같은 웜 인스턴스가 살아있는 동안만 쓰기가 반영되고, 콜드스타트되면
// 원본 상태로 초기화된다(프로토타입 목업이라 이 정도면 충분하다).
const tmpDbPath = path.join(os.tmpdir(), 'db.json');
if (!fs.existsSync(tmpDbPath)) {
  fs.copyFileSync(bundledDbPath, tmpDbPath);
}

const router = jsonServer.router(tmpDbPath);

// json-server 0.17.4(lodash-id 0.14.1)의 getById는 `id.toString()`을 가드 없이 호출한다.
// DELETE 요청마다 전체 컬렉션을 훑어 FK 무결성을 검사하는 getRemovable()이 내부적으로
// getById를 쓰는데, 우리 스키마엔 null 가능한 FK(rackId, approverId 등)가 많아서
// null.toString()에서 500으로 죽는다. null/undefined면 그냥 "못 찾음"으로 처리하도록 패치.
router.db._.mixin({
  getById(collection, id) {
    if (id === null || id === undefined) return undefined;
    return this.find(collection, (doc) => doc && doc.id != null && doc.id.toString() === id.toString());
  },
});

server.use(middlewares);

// /api/posts 요청이 들어오면 /posts로 포워딩해주는 리라이터 설정
server.use(jsonServer.rewriter({
  '/api/*': '/$1',
}));

server.use(router);

module.exports = server;
