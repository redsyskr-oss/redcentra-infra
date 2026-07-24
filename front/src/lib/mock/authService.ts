import { fetchMock } from "./jsonServerClient";
import type { MenuItem, UserInfo } from "@/store/useUserStore";

const TOKEN_PREFIX = "mock.";

export function makeMockToken(memberId: number): string {
  return `${TOKEN_PREFIX}${memberId}`;
}

export function parseMockToken(cookieHeader: string): number | null {
  const match = cookieHeader.match(/access_token=([^;]*)/);
  if (!match) return null;
  const value = decodeURIComponent(match[1]);
  if (!value.startsWith(TOKEN_PREFIX)) return null;
  const memberId = Number(value.slice(TOKEN_PREFIX.length));
  return Number.isFinite(memberId) ? memberId : null;
}

interface MockUser {
  id: number;
  userId: string;
  userPassword: string;
  name: string;
  companyId: number | null;
  role: string;
  status: "PENDING" | "ACTIVE" | "INACTIVE" | "LOCKED" | "REJECTED";
  defaultMenu: string | null;
  mustChangePassword?: boolean;
}

interface MockCompany {
  id: number;
  companyName: string;
}

interface MockMenu {
  id: number;
  parentMenuId: number | null;
  menuCode: string;
  menuName: string;
  menuType: "GROUP" | "MODULE" | "SUB";
  icon: string | null;
  windowTarget: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface MockMenuRole {
  menuId: number;
  roleName: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
}

const STATUS_MESSAGE: Record<string, string> = {
  PENDING: "가입 승인 대기 중인 계정입니다.",
  INACTIVE: "비활성화된 계정입니다.",
  LOCKED: "잠긴 계정입니다. 관리자에게 잠금 해제를 요청하세요.",
  REJECTED: "가입이 반려된 계정입니다.",
};

export async function authenticateUser(
  userId: string,
  password: string,
): Promise<{ ok: true; memberId: number; mustChangePassword: boolean } | { ok: false; message: string }> {
  const users = await fetchMock<MockUser[]>(`/users?userId=${encodeURIComponent(userId)}`);
  const user = users?.[0];

  if (!user || user.userPassword !== password) {
    return { ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }
  if (user.status !== "ACTIVE") {
    return { ok: false, message: STATUS_MESSAGE[user.status] ?? "로그인할 수 없는 계정입니다." };
  }
  return { ok: true, memberId: Number(user.id), mustChangePassword: user.mustChangePassword === true };
}

/** 신규 IA(그룹>모듈>서브) → 데스크톱 2단계 트리(CATEGORY>PAGE)로 변환하며 역할별 권한을 계산한다. */
export async function getUserInfo(memberId: number): Promise<UserInfo | null> {
  const user = await fetchMock<MockUser>(`/users/${memberId}`);
  if (!user) return null;

  const roleName = `ROLE_${user.role}`;
  const company = user.companyId ? await fetchMock<MockCompany>(`/companies/${user.companyId}`) : null;

  const [menus, menuRoles] = await Promise.all([
    fetchMock<MockMenu[]>("/menus"),
    fetchMock<MockMenuRole[]>(`/menuRoles?roleName=${roleName}`),
  ]);

  // json-server는 각 컬렉션의 `id` 필드만 문자열로 반환하고, 그 외 필드(FK)는 원래 타입(숫자)을
  // 그대로 유지한다. 조인 비교는 항상 Number()로 정규화해야 한다.
  const permByMenuId = new Map<number, MockMenuRole>();
  for (const mr of menuRoles ?? []) permByMenuId.set(Number(mr.menuId), mr);

  const active = (menus ?? []).filter((m) => m.isActive);
  const subs = active.filter((m) => m.menuType === "SUB");
  const modules = active.filter((m) => m.menuType === "MODULE");

  const subItems: MenuItem[] = subs
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => {
      const perm = permByMenuId.get(Number(m.id));
      return {
        id: Number(m.id),
        menuCode: m.menuCode,
        menuName: m.menuName,
        menuPath: m.windowTarget,
        icon: m.icon,
        menuType: "PAGE" as const,
        sortOrder: m.sortOrder,
        openNewWindow: null,
        canRead: perm?.canRead ?? false,
        canWrite: perm?.canWrite ?? false,
        canDelete: perm?.canDelete ?? false,
        children: [],
      };
    });

  const moduleItems: MenuItem[] = modules
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => {
      const children = subItems.filter((s) => {
        const original = active.find((x) => x.menuCode === s.menuCode);
        return Number(original?.parentMenuId) === Number(m.id);
      });
      return {
        id: Number(m.id),
        menuCode: m.menuCode,
        menuName: m.menuName,
        menuPath: null,
        icon: m.icon,
        menuType: "CATEGORY" as const,
        sortOrder: m.sortOrder,
        openNewWindow: null,
        canRead: children.some((c) => c.canRead),
        canWrite: children.some((c) => c.canWrite),
        canDelete: children.some((c) => c.canDelete),
        children,
      };
    })
    // 서브가 1개뿐이면 바로 페이지로 노출 (대시보드/공지사항처럼 하위메뉴가 하나인 모듈)
    .map((m) => (m.children.length === 1 ? { ...m.children[0] } : m));

  return {
    memberId: Number(user.id),
    userId: user.userId,
    name: user.name,
    companyId: user.companyId != null ? Number(user.companyId) : null,
    companyName: company?.companyName ?? null,
    mustChangePassword: user.mustChangePassword === true,
    roles: [roleName],
    menus: moduleItems,
  };
}
