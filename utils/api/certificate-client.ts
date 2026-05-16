import { IHttpClient } from './http-client';
import {
  CertificateDto,
  ListCertificatesRequest,
  ListCertificatesResponse,
  UploadCertificateRequest,
  UploadCertificateResponse,
} from '../../types/certificate';

export class CertificateClient {
  constructor(private readonly http: IHttpClient) {}

  async upload(request: UploadCertificateRequest): Promise<UploadCertificateResponse> {
    return this.http.post<UploadCertificateResponse>('/api/v1/certificates/upload', request);
  }

  async getById(uuid: string): Promise<CertificateDto> {
    return this.http.get<CertificateDto>(`/api/v1/certificates/${uuid}`);
  }

  async list(request?: ListCertificatesRequest): Promise<CertificateDto[]> {
    const body = await this.http.post<ListCertificatesResponse>('/api/v1/certificates', request ?? {});
    // API returns `certificates` in paginated responses; `data` is a fallback for alternative shapes.
    return body.certificates ?? body.data ?? [];
  }

  async remove(uuid: string): Promise<void> {
    return this.http.delete(`/api/v1/certificates/${uuid}`);
  }

  async exists(uuid: string): Promise<boolean> {
    const status = await this.http.getStatus(`/api/v1/certificates/${uuid}`);
    return status !== 404;
  }
}