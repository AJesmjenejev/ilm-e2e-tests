import { IHttpClient } from './http-client';

export interface StatisticsDto {
  totalCertificates: number;
  totalGroups: number;
  totalDiscoveries: number;
  totalRaProfiles: number;
}

export class StatisticsClient {
  constructor(private readonly http: IHttpClient) {}

  async get(): Promise<StatisticsDto> {
    return this.http.get<StatisticsDto>('/api/v1/statistics');
  }
}