'use client';

import { useTabStore } from '@/store/useTabStore';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import type { ComponentType } from 'react';

// 앱 레지스트리: menuCode를 키로 사용 (menu_ia_and_permissions.xlsx 기준 신규 코드 체계)
// 각 앱마다 받는 data 프롭 타입이 제각각이라(RoomView는 {room:{...}} 등) 공통 레지스트리
// 값 타입은 ComponentType<any>로 느슨하게 잡는다 — 구조적 분산성 문제로 unknown을 쓰면
// next/dynamic()이 감싼 각 컴포넌트의 구체적인 data 타입과 대입 관계가 성립하지 않는다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 이질적인 data 프롭 타입들을 한 레지스트리에 담기 위한 의도적 any
const Apps: Record<string, ComponentType<any>> = {
  // 공통
  COM_DASHBOARD_MAIN: dynamic(() => import('@/components/apps/Dashboard')),
  COM_NOTICE_LIST: dynamic(() => import('@/components/apps/Notice')),
  // 자산 관리 — 서버실
  FAC_LOBBY: dynamic(() => import('@/components/apps/ServerRoom')),
  RACK_DETAIL: dynamic(() => import('@/components/apps/RackManage')),
  // 자산 관리 — 자산/모델
  AST_ASSET_LIST: dynamic(() => import('@/components/apps/DeviceList')),
  MDL_MODEL_LIST: dynamic(() => import('@/components/apps/ProductModel')),
  // 운영 · 현황 관리
  BKP_CONFIG_LIST: dynamic(() => import('@/components/apps/BackupSchedule')),
  BKP_SCHEDULE: dynamic(() => import('@/components/apps/BackupSchedule')),
  SWL_LICENSE_LIST: dynamic(() => import('@/components/apps/LicenseManage')),
  // 대시보드 위젯("직접 그리기")에서 진입하는 커스텀 구성도 에디터 — IA에는 리프 메뉴 없음
  NET_DIAGRAM_EDIT: dynamic(() => import('@/components/apps/NetworkDiagramEditor')),
  MTN_INCIDENT: dynamic(() => import('@/components/apps/WorkLog')),
  MTN_SPAREPART: dynamic(() => import('@/components/apps/SparePart')),
  MON_AGENT: dynamic(() => import('@/components/apps/AgentMonitor')),
  MON_METRIC: dynamic(() => import('@/components/apps/MetricConfig')),
  AI_ANALYSIS_STATUS: dynamic(() => import('@/components/apps/AiAnalysis')),
  // 반출입 · 연계
  IOM_CARRY_LIST: dynamic(() => import('@/components/apps/CarryInOut')),
  LNK_FACILITY_VIEW: dynamic(() => import('@/components/apps/FacilityView')),
  // 시스템
  SYS_ACCOUNT: dynamic(() => import('@/components/apps/UserList')),
  SYS_COMPANY: dynamic(() => import('@/components/apps/CompanyManage')),
  SYS_ACCESS: dynamic(() => import('@/components/apps/AuditLog')),
  SYS_CODE: dynamic(() => import('@/components/apps/CommonCode')),
  SYS_MENU_ROLE: dynamic(() => import('@/components/apps/PermissionManage')),
  SYS_MENU: dynamic(() => import('@/components/apps/MenuManage')),
  // 룸 내부 3D 뷰 (동적 appId: ROOM_VIEW_{roomId}, ServerRoom의 "입장"에서 진입)
  ROOM_VIEW: dynamic(() => import('@/components/apps/RoomView')),
};

function resolveApp(appId: string) {
  if (appId in Apps) return Apps[appId];
  if (appId.startsWith('ROOM_VIEW_')) return Apps.ROOM_VIEW;
  if (appId.startsWith('AST_ASSET_RECEIVE_')) return Apps.AST_ASSET_LIST;
  return null;
}

// 메뉴코드 하나가 화면 하나를 공유할 때(탭 등) 기본으로 넘겨줄 data
const DEFAULT_DATA: Record<string, unknown> = {
  BKP_SCHEDULE: { initialTab: 'schedule' },
  BKP_CONFIG_LIST: { initialTab: 'list' },
};

export default function TabContent() {
  const { tabs, activeTabId } = useTabStore();

  return (
    <>
      {tabs.map((tab) => {
        const AppComponent = resolveApp(tab.appId);
        const data = tab.data ?? DEFAULT_DATA[tab.appId];
        const isActive = tab.id === activeTabId;

        return (
          <div
            key={tab.id}
            className={cn(
              'w-full h-full min-h-0 flex-col overflow-auto',
              isActive ? 'flex' : 'hidden',
            )}
          >
            {AppComponent ? (
              <AppComponent data={data} />
            ) : (
              <div className="p-4 text-red-500">Error: App not found ({tab.appId})</div>
            )}
          </div>
        );
      })}
    </>
  );
}
