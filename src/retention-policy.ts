export function retentionDays(value = process.env.SCAN_RETENTION_DAYS): number {
  const configured = Number(value || 90);
  return Number.isInteger(configured) && configured >= 7 && configured <= 3650 ? configured : 90;
}
