import type { DiagramState, NodeType } from '@/lib/networkDiagram';

export interface ApiDiagramRow extends DiagramState { id: number; companyId: number; name: string; updatedAt: string; }

export const EMPTY_DIAGRAM: DiagramState = { nodes: [], links: [], zones: [] };

export const LINE_COLORS = ['#35e0c8', '#ffb03a', '#ff5f7a', '#7ad46a', '#5aa9ff', '#c58cff', '#9aa7a5'];

export const NODE_W = 168, NODE_H = 82;

export type Mode = 'select' | 'connect' | 'zone';
export type Selected = { kind: 'node' | 'link' | 'zone'; id: string } | null;

export interface ApiPort {
  id: number;
  portName?: string;
  deviceNetworkName?: string;
  connectionAddress?: string;
  type?: string;
}

export interface ApiDevice {
  id: number;
  deviceName: string;
  deviceType?: string;
  hostName?: string;
  modelName?: string;
  status?: string;
  ports?: ApiPort[];
}

export interface PendingLink {
  sourceNodeId: string;
  destNodeId: string;
}

export interface ApiRoom {
  id: number;
  roomName: string;
  floor?: number;
}

export interface ApiRackDetail {
  id: number;
  rackName: string;
  devices: ApiDevice[];
}

export interface ApiCableLink {
  id: number;
  srcDeviceId: number;
  srcDeviceName?: string;
  srcPortName?: string;
  destDeviceId: number;
  destDeviceName?: string;
  destPortName?: string;
  cableType?: string;
  color?: string;
}

export function nodeTypeForDevice(device: ApiDevice): NodeType {
  const value = `${device.deviceType ?? ''} ${device.deviceName} ${device.modelName ?? ''}`.toUpperCase();
  if (/BACKBONE|CORE|백본/.test(value)) return 'backbone';
  if (/FIREWALL|방화벽|UTM/.test(value)) return 'firewall';
  if (/IPS|IDS/.test(value)) return 'ips';
  if (/DDOS/.test(value)) return 'ddos';
  if (/ROUTER|라우터/.test(value)) return 'router';
  if (/L3/.test(value)) return 'l3';
  if (/SWITCH|스위치/.test(value)) return 'switch';
  if (/DATABASE|\bDB\b/.test(value)) return 'db';
  return 'server';
}
