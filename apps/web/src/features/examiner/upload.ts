import { adminApi } from '@/lib/api/admin';

type UploadClass = 'examiner_kyc' | 'question_asset' | 'import_archive' | 'payout_document';
type AllowedMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'application/pdf'
  | 'application/zip'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function contentType(file: File): AllowedMime {
  const known: Record<string, AllowedMime> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  // Browsers report some files under other names (Windows: application/x-zip-compressed), so
  // fall back to the extension; the server verifies the bytes either way.
  const type = Object.values(known).find((candidate) => candidate === file.type) ?? known[extension];
  if (!type) throw new Error('Choose a supported JPEG, PNG, WebP, PDF, ZIP, or XLSX file.');
  return type;
}

export async function uploadExaminerFile(file: File, classification: UploadClass): Promise<string> {
  const mimeType = contentType(file);
  const intent = await adminApi.examinerUploadIntent({
    classification,
    filename: file.name,
    mimeType,
    sizeBytes: file.size,
  });
  let response: Response;
  try {
    response = await fetch(intent.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': mimeType },
      body: file,
    });
  } catch (error) {
    throw new Error(
      'The file could not reach object storage. Check the browser upload connection and try again.',
      { cause: error },
    );
  }
  if (!response.ok)
    throw new Error(`Object storage rejected the upload (HTTP ${response.status}).`);

  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  const sha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  await adminApi.completeUpload(intent.id, { sha256, sizeBytes: file.size });
  return intent.id;
}
