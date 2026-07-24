/** 계정 · 권한 관리 — UI-SYS-001 */
export type UserRole = 'SYSTEM_ADMIN' | 'RESIDENT_PL' | 'RESIDENT_ENGINEER' | 'PARTNER' | 'MANAGER' | 'USER' | 'VIEWER' | 'GUEST';
export type UserStatus = 'ACTIVE' | 'PENDING' | 'LOCKED' | 'REJECTED' | 'INACTIVE';
export type FilterTab = 'all' | 'ACTIVE' | 'PENDING' | 'LOCKED';

export interface ApiUser {
  id: number;
  userId: string;
  name: string;
  email: string;
  mobile: string | null;
  employeeNumber: string | null;
  companyId?: number | null;
  department: string | null;
  position: string | null;
  role: UserRole;
  status: UserStatus;
  guestExpireAt: string | null;
  createdAt: string;
}

export interface Approval {
  id: number;
  targetUserId: number;
  requestType: 'USER_REGISTRATION' | 'ACCOUNT_UNLOCK' | 'ROLE_CHANGE' | 'PERMISSION_GRANT' | 'TEMPORARY_ACCESS';
  requestReason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
}

export interface ApiRole {
  id: number;
  roleName: string; // 'ROLE_SYSTEM_ADMIN' 형태 — UserRole enum에 'ROLE_' 접두사만 붙은 형태
  label: string;
  roleDesc: string;
}

/* ── 역할 메타 (배지 색상만 별도 지정, 그 외 UI는 앱 공통 톤을 따른다) ── */
export const ROLE_META: Record<UserRole, { label: string; color: string }> = {
  SYSTEM_ADMIN: { label: '시스템 관리자', color: '#8b5cf6' },
  RESIDENT_PL: { label: '상주 PL', color: '#3b82f6' },
  RESIDENT_ENGINEER: { label: '상주 엔지니어', color: '#06b6d4' },
  PARTNER: { label: '파트너 업체', color: '#f59e0b' },
  MANAGER: { label: '매니저', color: '#10b981' },
  USER: { label: '일반 사용자', color: '#6b7280' },
  VIEWER: { label: '읽기 전용', color: '#64748b' },
  GUEST: { label: '임시 접근', color: '#ef4444' },
};

export const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: '활성', PENDING: '승인 대기', LOCKED: '잠금', REJECTED: '반려됨', INACTIVE: '비활성',
};
export const STATUS_DOT: Record<UserStatus, string> = {
  ACTIVE: 'bg-emerald-500', PENDING: 'bg-amber-500', LOCKED: 'bg-red-500', REJECTED: 'bg-muted-foreground', INACTIVE: 'bg-muted-foreground',
};
export const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'ACTIVE', label: '활성' },
  { key: 'PENDING', label: '대기' },
  { key: 'LOCKED', label: '잠금' },
];

export const REQUEST_TYPE_LABEL: Record<Approval['requestType'], string> = {
  USER_REGISTRATION: '가입 승인',
  ACCOUNT_UNLOCK: '잠금 해제 승인',
  ROLE_CHANGE: '역할 변경 승인',
  PERMISSION_GRANT: '권한 부여 승인',
  TEMPORARY_ACCESS: '임시 접근 승인',
};

