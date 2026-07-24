import { fetchMock } from "./jsonServerClient";

/**
 * 목업 모드 서버 측 접근 제어.
 *
 * 권한 원천은 시드(menuRoles)의 역할×메뉴 매트릭스다. 각 컬렉션을 그 컬렉션을 "관리하는"
 * 대표 화면(menuCode)에 매핑하고, HTTP 메서드를 화면 권한 플래그로 환산해 검사한다:
 *   GET/HEAD → canRead, DELETE → canDelete, 그 외(POST/PUT/PATCH) → canWrite
 *
 * 읽기는 대부분 화면에서 조인용으로 공유되므로(모델 목록, 회사명, 공통코드 등)
 * READ_RESTRICTED에 등록한 민감 컬렉션에만 canRead 검사를 적용하고,
 * 그 외 컬렉션의 GET은 로그인만 되어 있으면 허용한다.
 */

/** 컬렉션 → 쓰기 권한을 판정할 대표 메뉴코드 */
const MENU_BY_COLLECTION: Record<string, string> = {
  // 시스템 관리
  users: "SYS_ACCOUNT",
  roles: "SYS_ACCOUNT",
  userApprovals: "SYS_ACCOUNT",
  securitySettings: "SYS_ACCOUNT",
  companies: "SYS_ACCOUNT",
  accessIps: "SYS_ACCESS",
  accessHistory: "SYS_ACCESS",
  auditLogs: "SYS_ACCESS",
  commonCodeGroups: "SYS_CODE",
  commonCodes: "SYS_CODE",
  menus: "SYS_MENU",
  menuRoles: "SYS_MENU_ROLE",
  // 공통
  notices: "COM_NOTICE_LIST",
  networkDiagrams: "COM_DASHBOARD_MAIN",
  dashboardSummary: "COM_DASHBOARD_MAIN",
  // 자산 — 장비/배선은 랙 실장 화면에서도 수정하므로 더 관대한 RACK_DETAIL 기준으로 판정
  rooms: "FAC_LOBBY",
  racks: "RACK_DETAIL",
  devices: "RACK_DETAIL",
  cableLinks: "RACK_DETAIL",
  categories: "MDL_MODEL_LIST",
  productModels: "MDL_MODEL_LIST",
  portTemplates: "MDL_MODEL_LIST",
  // 운영 · 현황
  backups: "BKP_CONFIG_LIST",
  backupSchedules: "BKP_SCHEDULE",
  swLicenses: "SWL_LICENSE_LIST",
  licenseAssignments: "SWL_LICENSE_LIST",
  maintenanceTasks: "MTN_INCIDENT",
  spareParts: "MTN_SPAREPART",
  partStockHistory: "MTN_SPAREPART",
  agents: "MON_AGENT",
  agentPerformance: "MON_AGENT",
  agentDisk: "MON_AGENT",
  metricDefs: "MON_METRIC",
  metricTargets: "MON_METRIC",
  metricLatest: "MON_METRIC",
  aiBatchHistory: "AI_ANALYSIS_STATUS",
  aiResults: "AI_ANALYSIS_STATUS",
  // 반출입 · 연계
  carryInOuts: "IOM_CARRY_LIST",
  facilityMetrics: "LNK_FACILITY_VIEW",
  upsStatus: "LNK_FACILITY_VIEW",
  envSensors: "LNK_FACILITY_VIEW",
  leakSensors: "LNK_FACILITY_VIEW",
  networkTraffic: "LNK_FACILITY_VIEW",
  interfaceLogs: "LNK_FACILITY_VIEW",
};

/** 읽기에도 canRead 검사를 적용하는 민감 컬렉션 (계정/권한/보안 데이터) */
const READ_RESTRICTED = new Set([
  "users",
  "roles",
  "userApprovals",
  "securitySettings",
  "accessIps",
  "accessHistory",
  "auditLogs",
  "menus",
  "menuRoles",
]);

interface MockUserRow {
  id: number;
  role: string;
  status: string;
  mustChangePassword?: boolean;
}

interface MockMenuRow {
  id: number;
  menuCode: string;
}

interface MockMenuRoleRow {
  menuId: number;
  roleName: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
}

export type AuthzResult =
  | { ok: true }
  | { ok: false; status: number; error: string; code?: string };

const FORBIDDEN: AuthzResult = { ok: false, status: 403, error: "이 작업을 수행할 권한이 없습니다." };

/**
 * actualPath("devices/5", "users?role=..." 등)에 대한 요청을 역할 기반으로 인가한다.
 * 계정 상태(ACTIVE)와 비밀번호 변경 필요 여부도 여기서 함께 강제한다.
 */
export async function authorizeMockRequest(
  memberId: number,
  actualPath: string,
  method: string,
): Promise<AuthzResult> {
  const user = await fetchMock<MockUserRow>(`/users/${memberId}`);
  if (!user) return { ok: false, status: 401, error: "Not authenticated" };
  if (user.status !== "ACTIVE") {
    return { ok: false, status: 403, error: "로그인할 수 없는 계정 상태입니다.", code: "ACCOUNT_DISABLED" };
  }
  if (user.mustChangePassword) {
    return { ok: false, status: 403, error: "비밀번호를 변경한 후 이용할 수 있습니다.", code: "MUST_CHANGE_PASSWORD" };
  }

  const roleName = `ROLE_${user.role}`;
  if (roleName === "ROLE_SYSTEM_ADMIN") return { ok: true };

  const collection = actualPath.split("/")[0]?.split("?")[0] ?? "";
  const isRead = method === "GET" || method === "HEAD";
  if (isRead && !READ_RESTRICTED.has(collection)) return { ok: true };

  const menuCode = MENU_BY_COLLECTION[collection];
  // 매핑에 없는 컬렉션: 읽기는 위에서 이미 허용됐고, 쓰기는 안전하게 닫는다.
  if (!menuCode) return FORBIDDEN;

  const [menus, menuRoles] = await Promise.all([
    fetchMock<MockMenuRow[]>("/menus"),
    fetchMock<MockMenuRoleRow[]>(`/menuRoles?roleName=${roleName}`),
  ]);
  const menu = (menus ?? []).find((m) => m.menuCode === menuCode);
  const perm = menu
    ? (menuRoles ?? []).find((mr) => Number(mr.menuId) === Number(menu.id))
    : undefined;
  if (!perm) return FORBIDDEN;

  const allowed = isRead ? perm.canRead : method === "DELETE" ? perm.canDelete : perm.canWrite;
  return allowed ? { ok: true } : FORBIDDEN;
}

export function authzErrorResponse(result: Exclude<AuthzResult, { ok: true }>) {
  return { error: result.error, ...(result.code ? { code: result.code } : {}) };
}
