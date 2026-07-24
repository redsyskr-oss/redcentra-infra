import { createElement, type ReactElement, type SVGProps } from 'react';
import {
  Router as RouterIcon, Network, ShieldAlert, ShieldCheck, Shield, Fingerprint,
  Server, Database, Monitor, Cloud, Radio, Lock, Cable,
  type LucideIcon,
} from 'lucide-react';

/** 네트워크 구성도 편집기(NetworkDiagramEditor)와 대시보드 위젯(DashboardNetworkWidget)이
 * 노드 아이콘·타입 정의를 공유하기 위한 모듈 — 두 곳에서 서로 다른 아이콘/모양으로
 * 그려지는 것을 막기 위해 반드시 이 파일의 정의를 그대로 재사용한다. */
export type NodeType = 'cloud' | 'wan' | 'vpn' | 'firewall' | 'ips' | 'ddos' | 'nac' | 'router' | 'backbone' | 'l3' | 'switch' | 'server' | 'db' | 'pc';

export interface DiagramNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  deviceId: number | null;
  hostName?: string;
  modelName?: string;
  managementIp?: string;
  status?: string;
}
export interface DiagramLink {
  id: string;
  a: string;
  b: string;
  color: string;
  dash: boolean;
  sourcePortId?: number | null;
  sourcePortName?: string;
  destPortId?: number | null;
  destPortName?: string;
  cableType?: string;
  route?: 'ORTHOGONAL' | 'CURVED' | 'STRAIGHT';
}
export interface DiagramZone { id: string; x: number; y: number; w: number; h: number; label: string; color: string; }
export interface DiagramState { nodes: DiagramNode[]; links: DiagramLink[]; zones: DiagramZone[]; }

export const NODE_ICON: Record<NodeType, LucideIcon> = {
  cloud: Cloud, wan: Radio, vpn: Lock,
  firewall: ShieldAlert, ips: ShieldCheck, ddos: Shield, nac: Fingerprint,
  router: RouterIcon, backbone: Network, l3: Network, switch: Cable,
  server: Server, db: Database, pc: Monitor,
};

export const PALETTE: { group: string; items: { type: NodeType; label: string }[] }[] = [
  { group: '외부/연결', items: [{ type: 'cloud', label: 'ISP/클라우드' }, { type: 'wan', label: '전용선' }, { type: 'vpn', label: 'VPN 장비' }] },
  { group: '보안 장비', items: [{ type: 'firewall', label: '방화벽' }, { type: 'ips', label: 'IPS/IDS' }, { type: 'ddos', label: 'DDoS 차단' }, { type: 'nac', label: 'NAC' }] },
  { group: '네트워크 장비', items: [{ type: 'router', label: '라우터' }, { type: 'backbone', label: '백본' }, { type: 'l3', label: 'L3 스위치' }, { type: 'switch', label: '스위치' }] },
  { group: '시스템', items: [{ type: 'server', label: '서버' }, { type: 'db', label: 'DB' }, { type: 'pc', label: '사용자 PC' }] },
];

// JSX 태그로 직접 렌더링하면 컴파일러가 "렌더링 중 컴포넌트 생성"으로 오탐하므로 createElement로 우회
export function NodeTypeIcon({ type, ...props }: { type: NodeType } & SVGProps<SVGSVGElement>): ReactElement {
  return createElement(NODE_ICON[type] ?? Server, props);
}
