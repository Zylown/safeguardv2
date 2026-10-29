// UI availability only; the backend independently enforces the auth policy.
export function isBetterAuthDevelopmentEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.BETTER_AUTH_DEV_ENABLED === 'true' &&
    process.env.BETTER_AUTH_SCHEMA_READY === 'true'
  );
}
