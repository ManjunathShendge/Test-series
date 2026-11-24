import type { Queryable } from '@exam-prep/db';

export const authoringAssetsRepository = {
  async create(
    db: Queryable,
    id: string,
    ownerId: string,
    classification: 'public_media' | 'question_asset' | 'examiner_kyc' | 'import_archive' | 'payout_document',
    accessScope: 'public' | 'examiner' | 'staff' | 'student_attempt',
    bucket: string,
    objectKey: string,
    originalName: string,
    mimeType: string,
    sizeBytes: number,
  ): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO assets
       (id, owner_id, bucket, object_key, original_name, mime_type, size_bytes, classification, access_scope)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        id,
        ownerId,
        bucket,
        objectKey,
        originalName,
        mimeType,
        sizeBytes,
        classification,
        accessScope,
      ],
    );
    return rows[0]!.id;
  },

  async createVerified(
    db: Queryable,
    values: {
      id: string;
      ownerId: string;
      bucket: string;
      objectKey: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      sha256: string;
    },
  ): Promise<void> {
    await db.query(
      `INSERT INTO assets
       (id,owner_id,bucket,object_key,original_name,mime_type,size_bytes,sha256,scan_status,
        classification,access_scope,uploaded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'clean','question_asset','examiner',now())`,
      [
        values.id,
        values.ownerId,
        values.bucket,
        values.objectKey,
        values.originalName,
        values.mimeType,
        values.sizeBytes,
        values.sha256,
      ],
    );
  },

  async get(db: Queryable, id: string, ownerId: string) {
    const { rows } = await db.query<{
      id: string;
      bucket: string;
      object_key: string;
      mime_type: string;
      original_name: string;
      classification: 'public_media' | 'question_asset' | 'examiner_kyc' | 'import_archive' | 'payout_document';
      size_bytes: string | null;
      sha256: string | null;
      scan_status: 'pending' | 'scanning' | 'clean' | 'rejected';
      uploaded_at: Date | null;
    }>(
      `SELECT id,bucket,object_key,mime_type,original_name,classification,size_bytes,sha256,scan_status,uploaded_at
         FROM assets WHERE id=$1 AND owner_id=$2`,
      [id, ownerId],
    );
    return rows[0];
  },

  async getKycAssetForReview(db: Queryable, applicationId: string, assetId: string) {
    const { rows } = await db.query<{
      id: string;
      bucket: string;
      object_key: string;
      mime_type: string;
      original_name: string;
      scan_status: 'pending' | 'scanning' | 'clean' | 'rejected';
      uploaded_at: Date | null;
    }>(
      `SELECT a.id,a.bucket,a.object_key,a.mime_type,a.original_name,a.scan_status,a.uploaded_at
         FROM assets a
         JOIN examiner_applications e ON e.id=$1 AND a.owner_id=e.examiner_id
        WHERE a.id=$2 AND a.classification='examiner_kyc'
          AND a.id=ANY(ARRAY[e.photo_asset_id,e.pan_doc_asset_id,e.bank_proof_asset_id,e.business_proof_asset_id])`,
      [applicationId, assetId],
    );
    return rows[0];
  },

  async complete(
    db: Queryable,
    id: string,
    ownerId: string,
    objectKey: string,
    sha256: string,
    sizeBytes: number,
    scanStatus: 'clean' | 'rejected',
  ): Promise<boolean> {
    const result = await db.query(
      `UPDATE assets SET object_key=$3,sha256=$4,size_bytes=$5,scan_status=$6,uploaded_at=COALESCE(uploaded_at,now())
       WHERE id=$1 AND owner_id=$2`,
      [id, ownerId, objectKey, sha256, sizeBytes, scanStatus],
    );
    return result.rowCount === 1;
  },

  /** A verified question image the caller owns; anything else is treated as not found. */
  async getOwnCleanImage(
    db: Queryable,
    ownerId: string,
    id: string,
  ): Promise<
    | { bucket: string; object_key: string; mime_type: 'image/jpeg' | 'image/png' | 'image/webp' }
    | undefined
  > {
    const { rows } = await db.query<{
      bucket: string;
      object_key: string;
      mime_type: 'image/jpeg' | 'image/png' | 'image/webp';
    }>(
      `SELECT bucket,object_key,mime_type FROM assets
        WHERE id=$1 AND owner_id=$2 AND classification='question_asset' AND scan_status='clean'
          AND uploaded_at IS NOT NULL AND mime_type IN ('image/jpeg','image/png','image/webp')`,
      [id, ownerId],
    );
    return rows[0];
  },

  async validateOwnedAssets(
    db: Queryable,
    ownerId: string,
    ids: string[],
    classifications: Array<'public_media' | 'question_asset' | 'examiner_kyc' | 'import_archive' | 'payout_document'>,
  ): Promise<boolean> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) return false;
    if (uniqueIds.length === 0) return true;
    const { rows } = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM assets
        WHERE owner_id=$1 AND id=ANY($2::uuid[]) AND classification=ANY($3::asset_classification_type[])
          AND uploaded_at IS NOT NULL AND scan_status = 'clean'`,
      [ownerId, uniqueIds, classifications],
    );
    return rows[0]!.count === uniqueIds.length;
  },
};
