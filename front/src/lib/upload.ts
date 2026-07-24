/**
 * SeaweedFS S3 파일 업로드 (자산 사진, 반출입 첨부 등)
 *
 * 흐름 — 파일 바이너리가 Next BFF 프록시를 통과하지 않도록 presigned URL 방식 사용:
 *   1) BFF 프록시 경유로 Spring Boot에 presigned URL 발급 요청 (인증은 프록시가 처리)
 *   2) 브라우저가 발급받은 URL로 SeaweedFS S3 게이트웨이에 직접 PUT
 *   3) 반환된 objectKey를 업무 API에 저장
 *
 * 전제:
 *   - S3 자격증명은 Spring Boot에만 존재 (프론트 비노출)
 *   - SeaweedFS에 프론트 도메인 CORS 허용 필요
 *   - 백엔드 엔드포인트(제안): POST /api/v1/files/presigned-url
 *     req: { fileName, contentType, category } → res: { uploadUrl, objectKey }
 */

import { apiFetch } from './api';

export interface PresignedUploadResult {
  objectKey: string;
}

export async function uploadFile(
  file: File,
  category: string,
): Promise<PresignedUploadResult> {
  // 1) presigned URL 발급 (BFF 프록시 → Spring Boot)
  const presignRes = await apiFetch('/api/v1/files/presigned-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      category,
    }),
  });
  if (!presignRes.ok) throw new Error('presigned URL 발급에 실패했습니다.');
  const { uploadUrl, objectKey } = (await presignRes.json()) as {
    uploadUrl: string;
    objectKey: string;
  };

  // 2) SeaweedFS S3 게이트웨이로 직접 PUT (BFF 미경유)
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error('파일 업로드에 실패했습니다.');

  return { objectKey };
}

/** 다운로드/미리보기용 presigned GET URL 조회 */
export async function getFileUrl(objectKey: string): Promise<string> {
  const res = await apiFetch(
    `/api/v1/files/presigned-url?objectKey=${encodeURIComponent(objectKey)}`,
  );
  if (!res.ok) throw new Error('파일 URL 조회에 실패했습니다.');
  const { url } = (await res.json()) as { url: string };
  return url;
}
