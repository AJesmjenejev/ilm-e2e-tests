// ── Request DTOs ──────────────────────────────────────────────────────────────

export interface UploadCertificateRequest {
  certificate: string;
  customAttributes?: CustomAttribute[];
}

export interface CustomAttribute {
  uuid?: string;
  name?: string;
  content?: unknown[];
}

export interface ListCertificatesRequest {
  filters?: CertificateFilter[];
  itemsPerPage?: number;
  pageNumber?: number;
  includeArchived?: boolean;
}

export interface CertificateFilter {
  fieldSource: string;
  fieldIdentifier: string;
  condition: string;
  value: unknown;
}

// ── Response DTOs ─────────────────────────────────────────────────────────────

export interface UploadCertificateResponse {
  uuid: string;
}

export interface CertificateDto {
  uuid: string;
  commonName?: string;
  subjectDn?: string;
  issuerDn?: string;
  issuerCommonName?: string;
  serialNumber?: string;
  certificateType?: string;
  subjectType?: string;
  state?: string;
  validationStatus?: string;
  fingerprint?: string;
  notBefore?: string;
  notAfter?: string;
}

export interface ListCertificatesResponse {
  certificates?: CertificateDto[];
  data?: CertificateDto[];
  totalItems?: number;
  totalPages?: number;
  itemsPerPage?: number;
  pageNumber?: number;
}