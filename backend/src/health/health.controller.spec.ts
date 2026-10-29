import { getHealthResponse } from './health.response';

describe('HealthController', () => {
  it('returns a minimal healthy status without database details', () => {
    expect(getHealthResponse()).toEqual({ status: 'ok' });
  });
});
