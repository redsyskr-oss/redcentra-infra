'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // With SSR, we usually want to set some default staleTime
            // above 0 to avoid refetching immediately on the client
            staleTime: 60 * 1000,
            // 1. 실패 시 자동 재시도 횟수 (0으로 설정하거나 false)
            retry: false, 
            // 2. 창 포커스 시 다시 가져오기 끄기 (테스트 중에는 끄는 게 편함)
            refetchOnWindowFocus: false, 
            // 3. 네트워크 재연결 시 다시 가져오기 끄기
            refetchOnReconnect: false,

            refetchOnMount: false,       // 컴포넌트 마운트 시 중복 요청 방지
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
