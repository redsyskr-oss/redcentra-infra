import { create } from 'zustand';

// 탭이 너무 많아지면 스크롤이 길어지므로 최대 개수를 넘으면 가장 오래전에 연 탭부터 자동으로 닫는다.
export const MAX_TABS = 8;

export interface TabState {
  id: string;
  appId: string;
  title: string;
  icon?: string | null;
  data?: unknown;
}

interface ConsoleState {
  tabs: TabState[];
  activeTabId: string | null;

  openTab: (appId: string, title: string, data?: unknown, icon?: string | null) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
}

export const useTabStore = create<ConsoleState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (appId, title, data, icon) => {
    // 싱글톤: 동일 appId 탭이 이미 열려있으면 활성화
    const existing = get().tabs.find((t) => t.appId === appId);
    if (existing) {
      set((state) => ({
        tabs: state.tabs.map((tab) => (
          tab.id === existing.id ? { ...tab, title, data, icon } : tab
        )),
        activeTabId: existing.id,
      }));
      return;
    }

    const newId = `${appId}-${Date.now()}`;
    const newTab: TabState = { id: newId, appId, title, icon, data };

    set((state) => {
      let tabs = state.tabs;
      if (tabs.length >= MAX_TABS) {
        // 가장 오래전에 연 탭부터 닫되, 현재 작업 중인 탭은 건너뛴다.
        const oldest = tabs.find((t) => t.id !== state.activeTabId) ?? tabs[0];
        tabs = tabs.filter((t) => t.id !== oldest.id);
      }
      return { tabs: [...tabs, newTab], activeTabId: newId };
    });
  },

  closeTab: (id) =>
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === id);
      const tabs = state.tabs.filter((t) => t.id !== id);
      let activeTabId = state.activeTabId;
      if (state.activeTabId === id) {
        const next = tabs[Math.max(0, idx - 1)];
        activeTabId = next ? next.id : null;
      }
      return { tabs, activeTabId };
    }),

  activateTab: (id) => set({ activeTabId: id }),
}));
