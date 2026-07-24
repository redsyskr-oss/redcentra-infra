import { useQuery } from '@tanstack/react-query';
import { filterReadable, type UserInfo } from '@/store/useUserStore';

export function useUser() {
    return useQuery({
        queryKey: ['user'],
        queryFn: async (): Promise<UserInfo> => {
            const res = await fetch('/api/auth/me');
            if (res.status === 401 || res.status === 403) {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/login';
                throw new Error('Session expired');
            }
            if (!res.ok) {
                throw new Error('Failed to fetch user');
            }
            return res.json();
        },
        select: (data) => {
            return {
                ...data,
                menus: filterReadable(data.menus),
            };
        },
        retry: false,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}
