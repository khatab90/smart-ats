/** Semantic versions ("2.12.0"), compared numerically part by part. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export interface AppRequirements {
  min_version?: string;
  latest_version?: string;
  download_url?: string;
}

/** What this installed version must or may do, given the server's requirements. */
export function updateState(
  current: string,
  req: AppRequirements | null,
): "required" | "available" | "none" {
  if (!req) return "none";
  if (req.min_version && compareVersions(current, req.min_version) < 0) return "required";
  if (req.latest_version && compareVersions(current, req.latest_version) < 0) return "available";
  return "none";
}
