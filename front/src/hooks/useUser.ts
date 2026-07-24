import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { filterReadable, type UserInfo } from '@/store/useUserStore';

export function useUser() {
    return useQuery({
        queryKey: ['user'],
        queryFn: async (): Promise<UserInfo> => {
            // 401(세션 만료) 처리는 apiFetch가 전역으로 담당한다.
            const res = await apiFetch('/api/auth/me');
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
