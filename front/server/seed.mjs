// json-server 목업 데이터 생성 스크립트.
// 실행: node server/seed.mjs  →  server/db.json 생성
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ══════════════════════════════════════════════
   시드 난수 (재현 가능한 목데이터 생성용)
══════════════════════════════════════════════ */
function makeRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const int = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;

/* ══════════════════════════════════════════════
   1. 역할 (roles)
══════════════════════════════════════════════ */
const ROLES = [
  { roleName: 'ROLE_SYSTEM_ADMIN', label: '시스템관리자', roleDesc: '시스템 전체 관리자' },
  { roleName: 'ROLE_MANAGER', label: '매니저', roleDesc: '운영 매니저' },
  { roleName: 'ROLE_RESIDENT_PL', label: '상주PL', roleDesc: '상주 프로젝트 리더' },
  { roleName: 'ROLE_RESIDENT_ENGINEER', label: '상주엔지니어', roleDesc: '상주 엔지니어' },
  { roleName: 'ROLE_PARTNER', label: '협력업체', roleDesc: '협력업체 담당자' },
  { roleName: 'ROLE_USER', label: '일반사용자', roleDesc: '일반 사용자' },
  { roleName: 'ROLE_VIEWER', label: '조회전용', roleDesc: '읽기 전용 사용자' },
  { roleName: 'ROLE_GUEST', label: '임시게스트', roleDesc: '임시 접근 계정' },
].map((r, i) => ({ id: i + 1, ...r }));

const roleIdByName = Object.fromEntries(ROLES.map((r) => [r.roleName, r.id]));

/* ══════════════════════════════════════════════
   2. 메뉴 IA (그룹 > 모듈 > 서브)
══════════════════════════════════════════════ */
const MENU_TREE = [
  {
    name: '공통', code: 'GRP_COM', modules: [
      { name: '대시보드', icon: 'LayoutDashboard', subs: [{ name: '대시보드', code: 'COM_DASHBOARD_MAIN', screenId: 'UI-COM-002', icon: 'LayoutDashboard' }] },
      { name: '공지사항', icon: 'Megaphone', subs: [{ name: '공지사항 목록', code: 'COM_NOTICE_LIST', screenId: 'UI-COM-003', icon: 'Megaphone' }] },
    ],
  },
  {
    name: '자산 관리', code: 'GRP_AST', modules: [
      { name: '서버실', icon: 'Building2', subs: [
        { name: '서버실 로비', code: 'FAC_LOBBY', screenId: 'UI-FAC-001', icon: 'Building2' },
        { name: '랙 상세 · 실장도', code: 'RACK_DETAIL', screenId: 'UI-RACK-001', icon: 'Server' },
      ] },
      { name: '자산관리', icon: 'HardDrive', subs: [{ name: 'IT자산 목록', code: 'AST_ASSET_LIST', screenId: 'UI-AST-001', icon: 'HardDrive' }] },
      { name: '자산 모델', icon: 'Package', subs: [{ name: '모델 · 분류체계', code: 'MDL_MODEL_LIST', screenId: 'UI-MDL-001', icon: 'Package' }] },
    ],
  },
  {
    name: '운영 · 현황 관리', code: 'GRP_OPS', modules: [
      { name: '백업관리', icon: 'DatabaseBackup', subs: [
        { name: '구성 목록', code: 'BKP_CONFIG_LIST', screenId: 'UI-BKP-001', icon: 'DatabaseBackup' },
        { name: '스케줄 현황', code: 'BKP_SCHEDULE', screenId: 'UI-BKP-002', icon: 'CalendarClock' },
      ] },
      { name: '라이선스', icon: 'FileKey2', subs: [{ name: '라이선스 관리 · 할당', code: 'SWL_LICENSE_LIST', screenId: 'UI-SWL-001', icon: 'FileKey2' }] },
      { name: '유지보수', icon: 'Wrench', subs: [
        { name: '장애 · 작업 관리', code: 'MTN_INCIDENT', screenId: 'UI-MTN-001', icon: 'AlertTriangle' },
        { name: '예비부품 · 자재', code: 'MTN_SPAREPART', screenId: 'UI-MTN-002', icon: 'Boxes' },
      ] },
      { name: '모니터링', icon: 'Activity', subs: [
        { name: '에이전트 수집정보', code: 'MON_AGENT', screenId: 'UI-MON-001', icon: 'Activity' },
        { name: '메트릭 수집관리', code: 'MON_METRIC', screenId: 'UI-MON-002', icon: 'Gauge' },
      ] },
      { name: 'AI 분석', icon: 'BrainCircuit', subs: [{ name: '분석 현황', code: 'AI_ANALYSIS_STATUS', screenId: 'UI-AI-001', icon: 'BrainCircuit' }] },
    ],
  },
  {
    name: '반출입 · 연계', code: 'GRP_IOM', modules: [
      { name: '반출입', icon: 'Truck', subs: [{ name: '반출입 관리', code: 'IOM_CARRY_LIST', screenId: 'UI-IOM-001', icon: 'Truck' }] },
      { name: '설비/전력', icon: 'Zap', subs: [{ name: '설비 · 전력정보 조회', code: 'LNK_FACILITY_VIEW', screenId: 'UI-LNK-001', icon: 'Zap' }] },
    ],
  },
  {
    name: '시스템', code: 'GRP_SYS', modules: [
      { name: '시스템관리', icon: 'Settings', subs: [
        { name: '계정 · 권한 관리', code: 'SYS_ACCOUNT', screenId: 'UI-SYS-001', icon: 'Users' },
        { name: '허용 IP · 접속 이력', code: 'SYS_ACCESS', screenId: 'UI-SYS-002', icon: 'ShieldCheck' },
        { name: '공통 코드 관리', code: 'SYS_CODE', screenId: 'UI-SYS-003', icon: 'Code2' },
        { name: '역할별 메뉴 권한 관리', code: 'SYS_MENU_ROLE', screenId: 'UI-SYS-004', icon: 'Shield' },
        { name: '메뉴 관리', code: 'SYS_MENU', screenId: null, icon: 'Menu' },
      ] },
    ],
  },
];

// 서브메뉴별 권한(요약 문서 C.2). 순서: SYSTEM_ADMIN,MANAGER,RESIDENT_PL,RESIDENT_ENGINEER,PARTNER,USER,VIEWER,GUEST
// 'D'=RWD, 'W'=RW, 'R'=R, '-'=없음. SYSTEM_ADMIN은 항상 D로 하드락.
const PERM_ROLE_ORDER = ['ROLE_SYSTEM_ADMIN', 'ROLE_MANAGER', 'ROLE_RESIDENT_PL', 'ROLE_RESIDENT_ENGINEER', 'ROLE_PARTNER', 'ROLE_USER', 'ROLE_VIEWER', 'ROLE_GUEST'];
const PERM_MATRIX = {
  COM_DASHBOARD_MAIN: 'D,R,R,R,R,R,R,R',
  COM_NOTICE_LIST: 'D,W,R,R,R,R,R,R',
  FAC_LOBBY: 'D,W,W,R,R,R,R,R',
  RACK_DETAIL: 'D,W,W,W,R,R,R,R',
  AST_ASSET_LIST: 'D,W,W,R,R,R,R,R',
  MDL_MODEL_LIST: 'D,W,-,-,-,-,-,-',
  BKP_CONFIG_LIST: 'D,W,W,W,R,R,R,R',
  BKP_SCHEDULE: 'D,R,R,R,R,R,R,R',
  SWL_LICENSE_LIST: 'D,W,-,-,-,-,-,-',
  MTN_INCIDENT: 'D,W,W,W,W,W,R,R',
  MTN_SPAREPART: 'D,W,W,W,-,-,-,-',
  MON_AGENT: 'D,W,W,W,R,R,R,R',
  MON_METRIC: 'D,W,W,W,-,-,-,-',
  AI_ANALYSIS_STATUS: 'D,R,R,R,R,R,R,R',
  IOM_CARRY_LIST: 'D,W,W,W,W,W,R,R',
  LNK_FACILITY_VIEW: 'D,R,R,R,R,R,R,R',
  SYS_ACCOUNT: 'D,-,-,-,-,-,-,-',
  SYS_ACCESS: 'D,-,-,-,-,-,-,-',
  SYS_CODE: 'D,-,-,-,-,-,-,-',
  SYS_MENU_ROLE: 'D,-,-,-,-,-,-,-',
  SYS_MENU: 'D,-,-,-,-,-,-,-', // IA에 없는 자체 추가 화면 → 관리자 전용
};

function permToFlags(letter) {
  if (letter === 'D') return { canRead: true, canWrite: true, canDelete: true };
  if (letter === 'W') return { canRead: true, canWrite: true, canDelete: false };
  if (letter === 'R') return { canRead: true, canWrite: false, canDelete: false };
  return { canRead: false, canWrite: false, canDelete: false };
}

let menuId = 1;
const menus = [];
const menuRoles = [];
let menuRoleId = 1;

for (const group of MENU_TREE) {
  const groupId = menuId++;
  menus.push({ id: groupId, parentMenuId: null, menuCode: group.code, menuName: group.name, menuType: 'GROUP', icon: null, windowTarget: null, sortOrder: groupId, isActive: true });

  for (const mod of group.modules) {
    const moduleId = menuId++;
    const moduleCode = `${group.code}_${mod.name}`; // 내부용 (데스크톱에는 노출 안 함)
    menus.push({ id: moduleId, parentMenuId: groupId, menuCode: moduleCode, menuName: mod.name, menuType: 'MODULE', icon: mod.icon, windowTarget: null, sortOrder: moduleId, isActive: true });

    for (const sub of mod.subs) {
      const subId = menuId++;
      menus.push({ id: subId, parentMenuId: moduleId, menuCode: sub.code, menuName: sub.name, menuType: 'SUB', icon: sub.icon, windowTarget: sub.screenId, sortOrder: subId, isActive: true });

      const perms = (PERM_MATRIX[sub.code] ?? '-,-,-,-,-,-,-,-').split(',');
      PERM_ROLE_ORDER.forEach((roleName, idx) => {
        const letter = roleName === 'ROLE_SYSTEM_ADMIN' ? 'D' : perms[idx];
        menuRoles.push({ id: menuRoleId++, menuId: subId, roleId: roleIdByName[roleName], roleName, ...permToFlags(letter) });
      });
    }
  }
}

/* ══════════════════════════════════════════════
   3. 계정 (users) / 업체 (companies)
══════════════════════════════════════════════ */
const companies = [
  { id: 1, companyName: '(주)레드센트라', businessNumber: '123-45-67890', phone: '02-1234-5678' },
  { id: 2, companyName: '협력업체 A', businessNumber: '222-33-44444', phone: '02-2222-3333' },
  { id: 3, companyName: '협력업체 B', businessNumber: '333-44-55555', phone: '02-3333-4444' },
];

const users = [
  { id: 1, userId: 'admin', userPassword: '1234', name: '김관리', email: 'admin@redcentra.com', mobile: '010-1000-0001', extensionNumber: '1001', employeeNumber: 'EMP0001', department: '인프라운영팀', position: 'MANAGER', role: 'SYSTEM_ADMIN', status: 'ACTIVE', companyId: 1, defaultMenu: 'COM_DASHBOARD_MAIN', lastLoginAt: '2026-07-15T08:30:00', createdAt: '2025-01-10T09:00:00' },
  { id: 2, userId: 'manager', userPassword: '1234', name: '박매니저', email: 'manager@redcentra.com', mobile: '010-1000-0002', extensionNumber: '1002', employeeNumber: 'EMP0002', department: '인프라운영팀', position: 'DEPUTY_GENERAL_MANAGER', role: 'MANAGER', status: 'ACTIVE', companyId: 1, defaultMenu: 'COM_DASHBOARD_MAIN', lastLoginAt: '2026-07-14T09:10:00', createdAt: '2025-01-15T09:00:00' },
  { id: 3, userId: 'pl', userPassword: '1234', name: '이피엘', email: 'pl@redcentra.com', mobile: '010-1000-0003', extensionNumber: '1003', employeeNumber: 'EMP0003', department: '상주운영팀', position: 'ASSISTANT_MANAGER', role: 'RESIDENT_PL', status: 'ACTIVE', companyId: 1, defaultMenu: 'FAC_LOBBY', lastLoginAt: '2026-07-14T08:00:00', createdAt: '2025-02-01T09:00:00' },
  { id: 4, userId: 'engineer', userPassword: '1234', name: '최엔지니어', email: 'engineer@redcentra.com', mobile: '010-1000-0004', extensionNumber: '1004', employeeNumber: 'EMP0004', department: '상주운영팀', position: 'STAFF', role: 'RESIDENT_ENGINEER', status: 'ACTIVE', companyId: 1, defaultMenu: 'MTN_INCIDENT', lastLoginAt: '2026-07-15T07:50:00', createdAt: '2025-02-10T09:00:00' },
  { id: 5, userId: 'partner', userPassword: '1234', name: '정협력', email: 'partner@partner-a.com', mobile: '010-1000-0005', extensionNumber: null, employeeNumber: null, department: '협력업체 A', position: 'STAFF', role: 'PARTNER', status: 'ACTIVE', companyId: 2, defaultMenu: 'MTN_INCIDENT', lastLoginAt: '2026-07-13T10:00:00', createdAt: '2025-03-01T09:00:00' },
  { id: 6, userId: 'user1', userPassword: '1234', name: '한사용', email: 'user1@redcentra.com', mobile: '010-1000-0006', extensionNumber: '1006', employeeNumber: 'EMP0006', department: '개발팀', position: 'STAFF', role: 'USER', status: 'ACTIVE', companyId: 1, defaultMenu: 'COM_DASHBOARD_MAIN', lastLoginAt: '2026-07-12T09:00:00', createdAt: '2025-04-01T09:00:00' },
  { id: 7, userId: 'viewer', userPassword: '1234', name: '조회자', email: 'viewer@redcentra.com', mobile: '010-1000-0007', extensionNumber: '1007', employeeNumber: 'EMP0007', department: '감사팀', position: 'STAFF', role: 'VIEWER', status: 'ACTIVE', companyId: 1, defaultMenu: 'COM_DASHBOARD_MAIN', lastLoginAt: '2026-07-10T09:00:00', createdAt: '2025-05-01T09:00:00' },
  { id: 8, userId: 'guest', userPassword: '1234', name: '임시게스트', email: 'guest@partner-b.com', mobile: '010-1000-0008', extensionNumber: null, employeeNumber: null, department: '협력업체 B', position: 'STAFF', role: 'GUEST', status: 'ACTIVE', companyId: 3, guestExpireAt: '2026-08-15T00:00:00', defaultMenu: 'COM_DASHBOARD_MAIN', lastLoginAt: '2026-07-11T09:00:00', createdAt: '2026-07-01T09:00:00' },
  { id: 9, userId: 'pending.yoon', userPassword: '1234', name: '윤대기', email: 'yoon@redcentra.com', mobile: '010-1000-0009', extensionNumber: null, employeeNumber: null, department: '개발팀', position: 'STAFF', role: 'USER', status: 'PENDING', companyId: 1, applyReason: '신규 입사자 계정 신청입니다.', defaultMenu: null, createdAt: '2026-07-14T15:00:00' },
  { id: 10, userId: 'locked.song', userPassword: '1234', name: '송잠김', email: 'song@redcentra.com', mobile: '010-1000-0010', extensionNumber: '1010', employeeNumber: 'EMP0010', department: '개발팀', position: 'STAFF', role: 'USER', status: 'LOCKED', companyId: 1, defaultMenu: null, createdAt: '2025-06-01T09:00:00' },
];

const userApprovals = [
  { id: 1, targetUserId: 9, requestType: 'USER_REGISTRATION', requestReason: '신규 입사자 계정 신청입니다.', status: 'PENDING', approverId: null, processComment: null, processedAt: null, requestedCompanyName: '(주)레드센트라', requestedBusinessNumber: '123-45-67890', requestedCompanyPhone: '02-1234-5678', createdAt: '2026-07-14T15:00:00' },
  { id: 2, targetUserId: 10, requestType: 'ACCOUNT_UNLOCK', requestReason: '비밀번호 5회 오류로 계정이 잠겼습니다. 잠금 해제 요청합니다.', status: 'PENDING', approverId: null, processComment: null, processedAt: null, createdAt: '2026-07-15T09:00:00' },
  { id: 3, targetUserId: 6, requestType: 'ROLE_CHANGE', requestReason: '상주 엔지니어 권한으로 변경 요청', status: 'APPROVED', approverId: 1, processComment: '승인 처리합니다.', processedAt: '2026-07-05T11:00:00', createdAt: '2026-07-04T09:00:00' },
];

/* ══════════════════════════════════════════════
   4. 서버실 / 랙 / 자산 / 네트워크
══════════════════════════════════════════════ */
const DEVICE_TYPES = ['SERVER', 'SWITCH', 'PDU'];
const rng = makeRng(20260715);

const categories = [
  { id: 1, parentId: null, name: '서버', depth: 1 },
  { id: 2, parentId: null, name: '네트워크장비', depth: 1 },
  { id: 3, parentId: null, name: '전원장비', depth: 1 },
  { id: 4, parentId: 1, name: '랙마운트 서버', depth: 2 },
  { id: 5, parentId: 1, name: '블레이드 서버', depth: 2 },
  { id: 6, parentId: 2, name: 'L2 스위치', depth: 2 },
  { id: 7, parentId: 2, name: 'L3 스위치', depth: 2 },
  { id: 8, parentId: 3, name: 'PDU', depth: 2 },
  { id: 9, parentId: 4, name: '1U 서버', depth: 3 },
  { id: 10, parentId: 4, name: '2U 서버', depth: 3 },
];

const productModels = [
  { id: 1, categoryId: 9, vendor: 'Dell', modelName: 'PowerEdge R640', uSize: 1, powerWatt: 495, imageUrl: null },
  { id: 2, categoryId: 10, vendor: 'HPE', modelName: 'ProLiant DL380 Gen10', uSize: 2, powerWatt: 800, imageUrl: null },
  { id: 3, categoryId: 6, vendor: 'Cisco', modelName: 'Catalyst 2960-X', uSize: 1, powerWatt: 350, imageUrl: null },
  { id: 4, categoryId: 7, vendor: 'Cisco', modelName: 'Catalyst 9300', uSize: 1, powerWatt: 450, imageUrl: null },
  { id: 5, categoryId: 8, vendor: 'APC', modelName: 'AP8941', uSize: 0, powerWatt: 0, imageUrl: null },
];

const portTemplates = [
  { id: 1, productModelId: 1, portPrefix: 'eth', startIndex: 0, endIndex: 3, indexStep: 1, zeroPadding: 0, portType: 'RJ45', portRole: 'DATA' },
  { id: 2, productModelId: 3, portPrefix: 'Gi1/0/', startIndex: 1, endIndex: 24, indexStep: 1, zeroPadding: 0, portType: 'RJ45', portRole: 'DATA' },
  { id: 3, productModelId: 4, portPrefix: 'Gi1/0/', startIndex: 1, endIndex: 48, indexStep: 1, zeroPadding: 0, portType: 'SFP_PLUS', portRole: 'UPLINK' },
];

const ROOM_DEFS = [
  { id: 1, roomName: '본관 1층 전산실', floor: 1, area: 220.5, gridWidth: 12, gridHeight: 8, rackCount: 6 },
  { id: 2, roomName: '본관 2층 전산실', floor: 2, area: 180.0, gridWidth: 10, gridHeight: 8, rackCount: 5 },
  { id: 3, roomName: '별관 지하 전산실', floor: -1, area: 150.0, gridWidth: 10, gridHeight: 6, rackCount: 4 },
];

let rackIdSeq = 1;
let deviceIdSeq = 1;
let portIdSeq = 1;
let cableIdSeq = 1;

const racksFlat = [];
const devicesFlat = [];
const cableLinksFlat = [];

function genDevicesForRack(rack) {
  const devices = [];
  let u = 1;
  while (u <= rack.totalUnit) {
    const remaining = rack.totalUnit - u + 1;
    const r = rng();
    let type, uSize, modelId;
    if (r < 0.12) { u += 1; continue; } // 빈 칸
    if (r < 0.28) { type = 'SWITCH'; uSize = 1; modelId = pick(rng, [3, 4]); }
    else if (r < 0.38) { type = 'PDU'; uSize = 1; modelId = 5; }
    else if (r < 0.75 || remaining < 2) { type = 'SERVER'; uSize = 1; modelId = 1; }
    else { type = 'SERVER'; uSize = 2; modelId = 2; }
    if (u + uSize - 1 > rack.totalUnit) { u += 1; continue; }

    const model = productModels.find((m) => m.id === modelId);
    const idx = String(devices.length + 1).padStart(2, '0');
    const namePrefix = type === 'SWITCH' ? 'SW' : type === 'PDU' ? 'PDU' : 'SRV';
    const deviceId = deviceIdSeq++;
    const deviceName = `${rack.rackName}-${namePrefix}${idx}`;
    const ports = [];
    if (type !== 'PDU') {
      const portCount = type === 'SWITCH' ? 4 : 2;
      for (let p = 0; p < portCount; p++) {
        ports.push({
          id: portIdSeq++,
          type: type === 'SWITCH' ? 'RJ45' : 'RJ45',
          clientType: 'CLI',
          connectionAddress: `10.10.${rack.id}.${deviceId}:22`,
          deviceNetworkName: `eth${p}`,
          gateway: `10.10.${rack.id}.1`,
          subnetMask: '255.255.255.0',
        });
      }
    }
    devices.push({
      id: deviceId,
      rackId: rack.id,
      deviceName,
      deviceType: type,
      modelName: model?.modelName ?? '',
      productModelId: modelId,
      hostName: `${deviceName.toLowerCase()}.redcentra.local`,
      serialNumber: `SN-${deviceId.toString().padStart(6, '0')}`,
      assetNo: `AST-${deviceId.toString().padStart(5, '0')}`,
      bizName: pick(rng, ['ERP', '그룹웨어', '홈페이지', 'DB운영', '백업시스템', '모니터링', '메일서버']),
      osVersion: type === 'SERVER' ? pick(rng, ['Rocky Linux 9.3', 'Ubuntu 22.04 LTS', 'Windows Server 2022']) : '-',
      introDate: `202${int(rng, 2, 5)}-0${int(rng, 1, 9)}-1${int(rng, 0, 5)}`,
      status: pick(rng, ['OPERATING', 'OPERATING', 'OPERATING', 'STANDBY']),
      uPosition: u,
      uSize,
      frontColor: null,
      backColor: null,
      companyId: 1,
      ports,
      cableLinks: [],
    });
    u += uSize;
  }
  return devices;
}

for (const roomDef of ROOM_DEFS) {
  for (let i = 0; i < roomDef.rackCount; i++) {
    const rackId = rackIdSeq++;
    const col = i % 4;
    const row = Math.floor(i / 4);
    const rack = {
      id: rackId,
      roomId: roomDef.id,
      rackName: `${String.fromCharCode(65 + row)}${String(col + 1).padStart(2, '0')}`,
      posX: col + 1,
      posY: row + 1,
      totalUnit: pick(rng, [42, 42, 45, 48]),
      installedAt: `202${int(rng, 2, 5)}-0${int(rng, 1, 9)}-0${int(rng, 1, 9)}`,
    };
    rack.devices = genDevicesForRack(rack);
    racksFlat.push(rack);
    devicesFlat.push(...rack.devices);
  }
}

// 미실장 자산 (랙 배치 대기 중인 신규 반입 장비 몇 대)
const UNRACKED_DEFS = [
  { type: 'SERVER', modelId: 1, biz: '신규 도입 서버' },
  { type: 'SERVER', modelId: 2, biz: '증설 대기' },
  { type: 'SWITCH', modelId: 3, biz: '예비 스위치' },
];
for (const def of UNRACKED_DEFS) {
  const model = productModels.find((m) => m.id === def.modelId);
  const deviceId = deviceIdSeq++;
  const deviceName = `UNRACKED-${String(deviceId).padStart(3, '0')}`;
  devicesFlat.push({
    id: deviceId,
    rackId: null,
    deviceName,
    deviceType: def.type,
    modelName: model?.modelName ?? '',
    productModelId: def.modelId,
    hostName: `${deviceName.toLowerCase()}.redcentra.local`,
    serialNumber: `SN-${deviceId.toString().padStart(6, '0')}`,
    assetNo: `AST-${deviceId.toString().padStart(5, '0')}`,
    bizName: def.biz,
    osVersion: def.type === 'SERVER' ? 'Rocky Linux 9.3' : '-',
    introDate: '2026-07-01',
    status: 'STANDBY',
    uPosition: null,
    uSize: model?.uSize ?? 1,
    frontColor: null,
    backColor: null,
    companyId: 1,
    ports: [],
    cableLinks: [],
  });
}

// 케이블 연결: 각 방마다 스위치↔서버 몇 개씩 무작위 연결
for (const roomDef of ROOM_DEFS) {
  const roomRacks = racksFlat.filter((r) => r.roomId === roomDef.id);
  const switches = roomRacks.flatMap((r) => r.devices.filter((d) => d.deviceType === 'SWITCH'));
  const servers = roomRacks.flatMap((r) => r.devices.filter((d) => d.deviceType === 'SERVER'));
  const linkCount = Math.min(servers.length, switches.length * 4, 8);
  for (let i = 0; i < linkCount; i++) {
    const sw = switches[i % switches.length];
    const srv = servers[i];
    if (!sw || !srv || !sw.ports?.[i % sw.ports.length] || !srv.ports?.[0]) continue;
    const srcPort = sw.ports[i % sw.ports.length];
    const destPort = srv.ports[0];
    const link = {
      id: cableIdSeq++,
      cableType: pick(rng, ['UTP_CAT6', 'OM3', 'OM4']),
      color: pick(rng, ['YELLOW', 'BLUE', 'ORANGE']),
      memo: `${sw.deviceName} ↔ ${srv.deviceName}`,
      srcDeviceId: sw.id,
      srcDeviceName: sw.deviceName,
      srcPortName: srcPort.deviceNetworkName,
      destDeviceId: srv.id,
      destDeviceName: srv.deviceName,
      destPortName: destPort.deviceNetworkName,
    };
    cableLinksFlat.push(link);
    sw.cableLinks.push(link);
    srv.cableLinks.push(link);
  }
}

const rooms = ROOM_DEFS.map((r) => ({
  id: r.id,
  roomName: r.roomName,
  floor: r.floor,
  area: r.area,
  gridWidth: r.gridWidth,
  gridHeight: r.gridHeight,
  totalGridCells: r.gridWidth * r.gridHeight,
  racks: racksFlat.filter((rk) => rk.roomId === r.id).map((rk) => ({ id: rk.id, posX: rk.posX, posY: rk.posY, rackName: rk.rackName, totalUnit: rk.totalUnit })),
}));

/* ══════════════════════════════════════════════
   5. 백업 / 네트워크 케이블(flat)
══════════════════════════════════════════════ */
const backups = devicesFlat.filter((d) => d.deviceType === 'SERVER').slice(0, 14).map((d, i) => ({
  id: i + 1,
  deviceId: d.id,
  deviceName: d.deviceName,
  hostName: d.hostName,
  bizName: d.bizName,
  rackName: racksFlat.find((r) => r.id === d.rackId)?.rackName ?? '',
  roomName: rooms.find((r) => r.racks.some((rk) => rk.id === d.rackId))?.roomName ?? '',
  osVersion: d.osVersion,
  backupIp: `10.20.0.${i + 10}`,
  backupType: pick(rng, ['OS', 'FILE']),
  backupSystem: pick(rng, ['NetWorker', 'Avamar', 'Veeam']),
  capacity: `${int(rng, 50, 500)}GB`,
  createdAt: '2026-01-10T09:00:00',
}));

const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
let scheduleId = 1;
const backupSchedules = [];
for (const b of backups) {
  const days = pick(rng, [['DAILY'], ['MON', 'WED', 'FRI'], ['SAT'], ['SUN']]);
  for (const day of days) {
    backupSchedules.push({ id: scheduleId++, backupConfigId: b.id, deviceName: b.deviceName, dayOfWeek: day, runTime: `0${int(rng, 1, 4)}:00` });
  }
}

/* ══════════════════════════════════════════════
   6. 유지보수(장애·작업 통합) / 반출입 / 라이선스 / 예비부품
══════════════════════════════════════════════ */
const maintenanceTasks = [
  { id: 1, kind: 'FAULT', title: 'DB-01 디스크 I/O 지연', content: '디스크 응답속도 저하로 쿼리 지연 발생', deviceId: devicesFlat[2]?.id, deviceName: devicesFlat[2]?.deviceName, occurredAt: '2026-07-14T10:20:00', assigneeId: 4, assigneeName: '최엔지니어', status: 'IN_PROGRESS', actionNote: null, createdBy: 3, createdAt: '2026-07-14T10:25:00' },
  { id: 2, kind: 'WORK', title: 'WEB-01 OS 패치 적용', content: '보안 패치 KB2026-07 적용 예정', deviceId: devicesFlat[0]?.id, deviceName: devicesFlat[0]?.deviceName, occurredAt: '2026-07-16T02:00:00', assigneeId: 4, assigneeName: '최엔지니어', status: 'RECEIVED', actionNote: null, createdBy: 2, createdAt: '2026-07-13T09:00:00' },
  { id: 3, kind: 'FAULT', title: '스위치 포트 다운', content: 'A01 랙 스위치 3번 포트 링크다운', deviceId: devicesFlat[1]?.id, deviceName: devicesFlat[1]?.deviceName, occurredAt: '2026-07-10T15:00:00', assigneeId: 4, assigneeName: '최엔지니어', status: 'DONE', actionNote: '케이블 재체결 후 정상화 확인', createdBy: 3, createdAt: '2026-07-10T15:05:00' },
  { id: 4, kind: 'WORK', title: '백업 스토리지 증설', content: '백업 스토리지 2TB 증설 작업', deviceId: null, deviceName: '스토리지', occurredAt: '2026-07-20T01:00:00', assigneeId: 5, assigneeName: '정협력', status: 'RECEIVED', actionNote: null, createdBy: 2, createdAt: '2026-07-12T09:00:00' },
  { id: 5, kind: 'FAULT', title: 'AD 서버 응답 지연', content: '로그인 인증 지연 이슈 접수', deviceId: null, deviceName: 'AD 서버', occurredAt: '2026-07-15T09:00:00', assigneeId: 4, assigneeName: '최엔지니어', status: 'RECEIVED', actionNote: null, createdBy: 6, createdAt: '2026-07-15T09:05:00' },
];

const carryInOuts = [
  { id: 1, deviceId: devicesFlat[5]?.id, deviceName: devicesFlat[5]?.deviceName, kind: 'OUT', reason: '장애 수리를 위한 반출', plannedDate: '2026-07-18', requesterId: 4, requesterName: '최엔지니어', approverId: null, approverName: null, status: 'REQUESTED', decisionNote: null, createdAt: '2026-07-15T11:00:00' },
  { id: 2, deviceId: devicesFlat[8]?.id, deviceName: devicesFlat[8]?.deviceName, kind: 'IN', reason: '신규 서버 반입', plannedDate: '2026-07-12', requesterId: 3, requesterName: '이피엘', approverId: 1, approverName: '김관리', status: 'DONE', decisionNote: '반입 완료 확인', createdAt: '2026-07-10T09:00:00' },
];

const swLicenses = [
  { id: 1, swName: 'Windows Server 2022 Standard', version: '2022', purchasedQty: 20, expireDate: '2027-03-31', licenseKey: 'XXXXX-XXXXX-XXXXX-XXXXX-AB12C' },
  { id: 2, swName: 'VMware vSphere', version: '8.0', purchasedQty: 10, expireDate: '2026-09-30', licenseKey: 'XXXXX-XXXXX-XXXXX-XXXXX-VM8U0' },
  { id: 3, swName: 'Veeam Backup & Replication', version: '12', purchasedQty: 5, expireDate: '2026-08-15', licenseKey: 'XXXXX-XXXXX-XXXXX-XXXXX-VBR12' },
];
const licenseAssignments = [
  { id: 1, licenseId: 1, deviceId: devicesFlat[0]?.id, memberId: null, assignedAt: '2026-01-15T09:00:00', revokedAt: null },
  { id: 2, licenseId: 2, deviceId: devicesFlat[3]?.id, memberId: null, assignedAt: '2026-02-01T09:00:00', revokedAt: null },
];

const spareParts = [
  { id: 1, name: '10G SFP+ 트랜시버', spec: 'Cisco 호환', stockQty: 8, thresholdQty: 5, location: '자재창고 A-1' },
  { id: 2, name: 'UTP CAT6 케이블 (3m)', spec: '3m', stockQty: 40, thresholdQty: 20, location: '자재창고 A-2' },
  { id: 3, name: '서버용 SSD 960GB', spec: 'SATA', stockQty: 3, thresholdQty: 4, location: '자재창고 B-1' },
  { id: 4, name: 'PDU 전원케이블', spec: 'C13-C14', stockQty: 15, thresholdQty: 10, location: '자재창고 A-3' },
];
const partStockHistory = [
  { id: 1, partId: 3, inOut: 'OUT', qty: 2, reason: 'DB-01 디스크 교체', createdBy: 4, createdAt: '2026-07-14T11:00:00' },
  { id: 2, partId: 1, inOut: 'IN', qty: 10, reason: '정기 구매', createdBy: 1, createdAt: '2026-06-01T09:00:00' },
];

/* ══════════════════════════════════════════════
   7. 모니터링 / AI / 설비 / 시스템
══════════════════════════════════════════════ */
const agents = devicesFlat.filter((d) => d.deviceType === 'SERVER').slice(0, 20).map((d, i) => ({
  id: i + 1,
  deviceId: d.id,
  deviceName: d.deviceName,
  agentKey: `agent-key-${d.id}`,
  installedAt: '2026-01-20T09:00:00',
  status: i % 9 === 0 ? 'NOT_RECEIVED' : 'NORMAL',
  lastReceivedAt: i % 9 === 0 ? '2026-07-10T09:00:00' : '2026-07-15T09:55:00',
}));

const agentPerformance = agents.map((a) => ({ id: a.id, agentId: a.id, deviceName: a.deviceName, cpuPercent: int(rng, 10, 90), memPercent: int(rng, 20, 95), collectedAt: '2026-07-15T09:55:00' }));
const agentDisk = agents.map((a) => ({ id: a.id, agentId: a.id, deviceName: a.deviceName, diskPath: '/', totalGb: 500, usedGb: int(rng, 100, 480), collectedAt: '2026-07-15T09:55:00' }));

const metricDefs = [
  { id: 1, metricKey: 'PSU_STATUS', metricName: '전원 상태', unit: '', protocol: null, warnThreshold: null, critThreshold: null, inUse: true },
  { id: 2, metricKey: 'CPU_TEMP', metricName: 'CPU 온도', unit: '°C', protocol: null, warnThreshold: 70, critThreshold: 85, inUse: true },
  { id: 3, metricKey: 'FAN_RPM', metricName: '팬 속도', unit: 'RPM', protocol: null, warnThreshold: 500, critThreshold: 200, inUse: true },
];
const metricTargets = devicesFlat.filter((d) => d.deviceType === 'SWITCH').map((d, i) => ({
  id: i + 1,
  deviceId: d.id,
  deviceName: d.deviceName,
  protocol: pick(rng, ['REDFISH', 'IPMI', 'SNMPV2C']),
  address: `10.10.0.${100 + i}`,
  port: 443,
  intervalSec: 60,
  collectItems: 'PSU_STATUS,CPU_TEMP,FAN_RPM',
  status: 'NORMAL',
  failCount: 0,
  lastCollectedAt: '2026-07-15T09:50:00',
}));
const metricLatest = metricTargets.flatMap((t) => [
  { id: t.id * 10 + 1, deviceId: t.deviceId, deviceName: t.deviceName, metricKey: 'PSU_STATUS', metricValue: 1, statusText: 'OK', collectedAt: '2026-07-15T09:50:00' },
  { id: t.id * 10 + 2, deviceId: t.deviceId, deviceName: t.deviceName, metricKey: 'CPU_TEMP', metricValue: int(rng, 40, 75), statusText: 'OK', collectedAt: '2026-07-15T09:50:00' },
]);

const aiBatchHistory = [
  { id: 1, startedAt: '2026-07-15T01:00:00', finishedAt: '2026-07-15T01:12:00', durationSec: 720, targetCount: 80, result: 'SUCCESS', failReason: null, triggeredBy: 'SCHEDULE', executedBy: null },
  { id: 2, startedAt: '2026-07-14T01:00:00', finishedAt: '2026-07-14T01:11:00', durationSec: 660, targetCount: 80, result: 'SUCCESS', failReason: null, triggeredBy: 'SCHEDULE', executedBy: null },
  { id: 3, startedAt: '2026-07-13T01:00:00', finishedAt: null, durationSec: null, targetCount: 80, result: 'FAIL', failReason: 'InfluxDB 연결 타임아웃', triggeredBy: 'SCHEDULE', executedBy: null },
];
const aiResults = devicesFlat.filter((d) => d.deviceType === 'SERVER').slice(0, 10).map((d, i) => ({
  id: i + 1,
  batchId: 1,
  deviceId: d.id,
  deviceName: d.deviceName,
  analysisDate: '2026-07-15',
  anomalyScore: Number((int(rng, 0, 100)).toFixed(2)),
  riskGrade: pick(rng, ['NORMAL', 'NORMAL', 'CAUTION', 'DANGER']),
  topFactors: 'CPU 사용률, 디스크 I/O',
  predictType: pick(rng, ['DISK_EXHAUST', 'POWER']),
  predictTarget: d.deviceName,
  predictDate: '2026-08-01',
  createdAt: '2026-07-15T01:12:00',
}));

const facilityMetrics = rooms.flatMap((r) =>
  Array.from({ length: 7 }).map((_, i) => ({
    id: r.id * 100 + i,
    roomId: r.id,
    roomName: r.roomName,
    metricType: 'TEMP',
    metricValue: Number((22 + rng() * 4).toFixed(1)),
    receivedAt: `2026-07-${String(9 + i).padStart(2, '0')}T09:00:00`,
  })),
);
const interfaceLogs = [
  { id: 1, interfaceCode: 'LNK_FACILITY', result: 'SUCCESS', message: '설비관제 연계 정상 수신', createdAt: '2026-07-15T09:00:00' },
  { id: 2, interfaceCode: 'EXT_HR', result: 'SUCCESS', message: '인사시스템 사번 동기화 완료', createdAt: '2026-07-15T06:00:00' },
  { id: 3, interfaceCode: 'LNK_FACILITY', result: 'FAIL', message: '응답 타임아웃', createdAt: '2026-07-14T09:00:00' },
];

const accessIps = [
  { id: 1, memberId: null, ipAddress: '0.0.0.0/0', description: '전체 허용(임시)' },
  { id: 2, memberId: null, ipAddress: '10.0.0.0/8', description: '사내망' },
  { id: 3, memberId: 5, ipAddress: '203.0.113.10', description: '협력업체 A 고정IP' },
];
const accessHistory = [
  { id: 1, memberId: 1, loginId: 'admin', ip: '10.0.0.5', success: true, blockReason: null, accessedAt: '2026-07-15T08:30:00' },
  { id: 2, memberId: null, loginId: 'unknown', ip: '198.51.100.20', success: false, blockReason: '허용되지 않은 IP', accessedAt: '2026-07-15T03:12:00' },
  { id: 3, memberId: 10, loginId: 'locked.song', ip: '10.0.0.9', success: false, blockReason: '계정 잠김', accessedAt: '2026-07-14T13:00:00' },
  { id: 4, memberId: 2, loginId: 'manager', ip: '10.0.0.6', success: true, blockReason: null, accessedAt: '2026-07-14T09:10:00' },
];

const notices = [
  { id: 1, title: '7월 정기 점검 안내 (7/20 02:00~04:00)', content: '정기 점검으로 인해 일부 서비스가 일시 중단됩니다.', pinned: true, postStart: '2026-07-14', postEnd: '2026-07-21', writerId: 1, writerName: '김관리', createdAt: '2026-07-14T09:00:00' },
  { id: 2, title: 'DCIM 시스템 v1.0 오픈 안내', content: 'DCIM 시스템이 정식 오픈되었습니다.', pinned: true, postStart: '2026-07-01', postEnd: '2026-12-31', writerId: 1, writerName: '김관리', createdAt: '2026-07-01T09:00:00' },
  { id: 3, title: '백업 정책 변경 안내', content: '8월부터 증분 백업 주기가 변경됩니다.', pinned: false, postStart: '2026-07-10', postEnd: '2026-08-10', writerId: 2, writerName: '박매니저', createdAt: '2026-07-10T09:00:00' },
];

const commonCodeGroups = [
  { groupCode: 'BACKUP_SYSTEM', groupName: '백업 시스템' },
  { groupCode: 'CABLE_TYPE', groupName: '케이블 종류' },
  { groupCode: 'DEVICE_STATUS', groupName: '장비 상태' },
];
const commonCodes = [
  { groupCode: 'BACKUP_SYSTEM', code: 'NETWORKER', codeName: 'NetWorker', inUse: true, sortOrder: 1 },
  { groupCode: 'BACKUP_SYSTEM', code: 'AVAMAR', codeName: 'Avamar', inUse: true, sortOrder: 2 },
  { groupCode: 'BACKUP_SYSTEM', code: 'VEEAM', codeName: 'Veeam', inUse: true, sortOrder: 3 },
  { groupCode: 'CABLE_TYPE', code: 'UTP_CAT6', codeName: 'UTP CAT6', inUse: true, sortOrder: 1 },
  { groupCode: 'CABLE_TYPE', code: 'OM3', codeName: 'OM3 광케이블', inUse: true, sortOrder: 2 },
  { groupCode: 'CABLE_TYPE', code: 'OM4', codeName: 'OM4 광케이블', inUse: true, sortOrder: 3 },
  { groupCode: 'DEVICE_STATUS', code: 'OPERATING', codeName: '운영중', inUse: true, sortOrder: 1 },
  { groupCode: 'DEVICE_STATUS', code: 'STANDBY', codeName: '대기', inUse: true, sortOrder: 2 },
  { groupCode: 'DEVICE_STATUS', code: 'DISPOSED', codeName: '폐기', inUse: true, sortOrder: 3 },
].map((c, i) => ({ id: i + 1, ...c }));

const dashboardSummary = {
  roomCount: rooms.length,
  rackCount: racksFlat.length,
  deviceCount: devicesFlat.length,
  floorUsagePercent: 71,
  assetTrendWeek: 12,
  incidentCounts: { RECEIVED: maintenanceTasks.filter((t) => t.status === 'RECEIVED').length, IN_PROGRESS: maintenanceTasks.filter((t) => t.status === 'IN_PROGRESS').length, DONE: maintenanceTasks.filter((t) => t.status === 'DONE').length },
  agentSummary: { normal: agents.filter((a) => a.status === 'NORMAL').length, notReceived: agents.filter((a) => a.status === 'NOT_RECEIVED').length, notReceivedDevices: agents.filter((a) => a.status === 'NOT_RECEIVED').map((a) => a.deviceName) },
  recentNotices: notices.slice(0, 5),
  trend: [
    { d: '07-09', temp: 24.1, cpu: 42 },
    { d: '07-10', temp: 24.8, cpu: 51 },
    { d: '07-11', temp: 25.2, cpu: 47 },
    { d: '07-12', temp: 24.5, cpu: 55 },
    { d: '07-13', temp: 26.0, cpu: 61 },
    { d: '07-14', temp: 25.4, cpu: 58 },
    { d: '07-15', temp: 24.9, cpu: 49 },
  ],
  backupStat: [
    { name: '성공', v: 132 },
    { name: '실패', v: 4 },
    { name: '대기', v: 11 },
  ],
};

/* ══════════════════════════════════════════════
   최종 db.json 조립
══════════════════════════════════════════════ */
const db = {
  roles: ROLES,
  menus,
  menuRoles,
  companies,
  users,
  userApprovals,
  rooms,
  racks: racksFlat,
  devices: devicesFlat,
  cableLinks: cableLinksFlat,
  categories,
  productModels,
  portTemplates,
  backups,
  backupSchedules,
  maintenanceTasks,
  carryInOuts,
  swLicenses,
  licenseAssignments,
  spareParts,
  partStockHistory,
  agents,
  agentPerformance,
  agentDisk,
  metricDefs,
  metricTargets,
  metricLatest,
  aiBatchHistory,
  aiResults,
  facilityMetrics,
  interfaceLogs,
  accessIps,
  accessHistory,
  notices,
  commonCodeGroups,
  commonCodes,
  dashboardSummary,
};

writeFileSync(join(__dirname, 'db.json'), JSON.stringify(db, null, 2), 'utf-8');
console.log('server/db.json 생성 완료');
console.log(Object.fromEntries(Object.entries(db).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1])));
