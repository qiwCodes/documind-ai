export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}
