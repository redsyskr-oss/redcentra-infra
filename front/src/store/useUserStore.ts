export interface MenuItem {
  id: number;
  menuCode: string;
  menuName: string;
  menuPath: string | null;
  icon: string | null;
  menuType: 'PAGE' | 'CATEGORY';
  sortOrder: number;
  openNewWindow: boolean | null;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  children: MenuItem[];
}

export interface UserInfo {
  memberId: number;
  userId: string;
  name: string;
  companyId: number | null;
  companyName: string | null;
  mustChangePassword?: boolean;
  roles: string[];
  menus: MenuItem[];
}

export function filterReadable(menus: MenuItem[]): MenuItem[] {
  return menus
    .filter((m) => m.canRead)
    .map((m) => ({
      ...m,
      children: filterReadable(m.children),
    }))
    .filter((m) => m.menuType === 'PAGE' || m.children.length > 0);
}

export function collectPages(menus: MenuItem[]): MenuItem[] {
  const pages: MenuItem[] = [];
  for (const m of menus) {
    if (m.menuType === 'PAGE') pages.push(m);
    if (m.children.length > 0) pages.push(...collectPages(m.children));
  }
  return pages;
}
