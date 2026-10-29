import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppError, ErrorCode } from '../utils/errors.js';

// Security: Store uploads in memory to prevent filesystem pollution
// Files are processed immediately and never persisted to disk
const storage = multer.memoryStorage();

// Security: Strict file type validation
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file

// File filter with MIME type validation
const fileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(
      new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
      )
    );
    return;
  }
  cb(null, true);
};

// Multer instance for condition inspection image uploads
export const uploadConditionPhotos = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 2, // Exactly 2 files expected: check_in_photo and check_out_photo
  },
}).fields([
  { name: 'check_in_photo', maxCount: 1 },
  { name: 'check_out_photo', maxCount: 1 },
]);

// Certificate file types for eligibility verification
const CERTIFICATE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
];

// File filter for certificates
const certificateFileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  if (!CERTIFICATE_MIME_TYPES.includes(file.mimetype)) {
    cb(
      new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `Invalid certificate file type. Allowed types: ${CERTIFICATE_MIME_TYPES.join(', ')}`
      )
    );
    return;
  }
  cb(null, true);
};

// Multer instance for certificate upload (Phase 2)
export const uploadCertificate = multer({
  storage,
  fileFilter: certificateFileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
}).single('certificate');

/**
 * Validates that required image files are present and contain actual image data
 */
export function validateImageUploads(files: any): {
  checkInPhoto: Express.Multer.File;
  checkOutPhoto: Express.Multer.File;
} {
  if (!files || typeof files !== 'object') {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      'Missing required image uploads'
    );
  }

  const checkInPhotos = files['check_in_photo'];
  const checkOutPhotos = files['check_out_photo'];

  if (!checkInPhotos || !Array.isArray(checkInPhotos) || checkInPhotos.length === 0) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      'Missing required field: check_in_photo'
    );
  }

  if (!checkOutPhotos || !Array.isArray(checkOutPhotos) || checkOutPhotos.length === 0) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      'Missing required field: check_out_photo'
    );
  }

  const checkInPhoto = checkInPhotos[0];
  const checkOutPhoto = checkOutPhotos[0];

  // Validate actual image data present
  if (!checkInPhoto.buffer || checkInPhoto.buffer.length === 0) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      'check_in_photo contains no data'
    );
  }

  if (!checkOutPhoto.buffer || checkOutPhoto.buffer.length === 0) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      'check_out_photo contains no data'
    );
  }

  // Basic image header validation (magic bytes)
  validateImageMagicBytes(checkInPhoto.buffer, 'check_in_photo');
  validateImageMagicBytes(checkOutPhoto.buffer, 'check_out_photo');

  return { checkInPhoto, checkOutPhoto };
}

/**
 * Validates image magic bytes to ensure file is actually an image
 */
function validateImageMagicBytes(buffer: Buffer, fieldName: string): void {
  if (buffer.length < 8) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `${fieldName}: File too small to be a valid image`
    );
  }

  const header = buffer.subarray(0, 8);

  // JPEG: FF D8 FF
  const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a;

  // WebP: RIFF ... WEBP
  const isWebp =
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    buffer.length >= 12 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50;

  if (!isJpeg && !isPng && !isWebp) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `${fieldName}: File header does not match a supported image format (JPEG, PNG, WebP)`
    );
  }
}
