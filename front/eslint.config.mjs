import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // redsys/는 별도로 배포되는 Vercel 서버리스 목업 API 서브프로젝트(자체 package.json/vercel.json)이고,
    // server/mock-server.cjs는 로컬 개발 스크립트다. 둘 다 Next.js 앱 코드가 아니며 CommonJS(require)를
    // 의도적으로 사용하므로 앱용 ESLint 설정 대상에서 제외한다.
    "redsys/**",
    "server/*.cjs",
  ]),
]);

export default eslintConfig;
