import {
  LayoutDashboard,
  LayoutGrid,
  Building2,
  DoorOpen,
  Server,
  HardDrive,
  Package,
  Cable,
  AlertTriangle,
  FileText,
  Users,
  User,
  UserCheck,
  Shield,
  ShieldCheck,
  Settings,
  Menu,
  FileSearch,
  Cpu,
  ClipboardList,
  History,
  ScrollText,
  Megaphone,
  DatabaseBackup,
  CalendarClock,
  FileKey2,
  Wrench,
  Boxes,
  Activity,
  Gauge,
  BrainCircuit,
  Truck,
  Zap,
  Code2,
  AppWindow,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import { createElement } from 'react';

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  LayoutGrid,
  Building2,
  DoorOpen,
  Server,
  HardDrive,
  Package,
  Cable,
  AlertTriangle,
  FileText,
  Users,
  User,
  UserCheck,
  Shield,
  ShieldCheck,
  Settings,
  Menu,
  FileSearch,
  Cpu,
  ClipboardList,
  History,
  ScrollText,
  Megaphone,
  DatabaseBackup,
  CalendarClock,
  FileKey2,
  Wrench,
  Boxes,
  Activity,
  Gauge,
  BrainCircuit,
  Truck,
  Zap,
  Code2,
};

const fallbackIcon: LucideIcon = AppWindow;

export function getIcon(name: string | null | undefined): LucideIcon {
  if (!name) return fallbackIcon;
  return iconMap[name] ?? fallbackIcon;
}

// 동적으로 아이콘 이름을 받아 렌더링할 때 사용 (JSX 태그로 직접 쓰면 컴파일러가
// "컴포넌트를 렌더링 중 생성"으로 오탐하므로 createElement로 우회)
export function MenuIcon({ name, ...props }: { name?: string | null } & Omit<LucideProps, 'name'>) {
  return createElement(getIcon(name), props);
}
