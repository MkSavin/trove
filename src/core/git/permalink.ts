/** A repository with a web view that serves files at any commit. */
export type WebRepo = { base: string; blob: string };

const SCP_LIKE = /^(?:[^@/]+@)?([^:/]+):(?!\/)(.+)$/;
const WEB_SCHEMES = new Set(["https:", "http:", "ssh:", "git+ssh:"]);

const hostAndPath = (remote: string): { host: string; path: string } | undefined => {
  if (URL.canParse(remote)) {
    const url = new URL(remote);
    if (!WEB_SCHEMES.has(url.protocol)) return undefined;
    return { host: url.protocol.startsWith("http") ? url.host : url.hostname, path: url.pathname };
  }
  const scp = SCP_LIKE.exec(remote);
  return scp?.[1] && scp[2] ? { host: scp[1], path: scp[2] } : undefined;
};

/** GitHub and GitLab remotes, by host name; credentials in the URL are dropped. */
export const webRepo = (remote: string): WebRepo | undefined => {
  const parsed = hostAndPath(remote.trim());
  if (!parsed) return undefined;
  const blob = parsed.host.includes("github")
    ? "blob"
    : parsed.host.includes("gitlab")
      ? "-/blob"
      : undefined;
  const path = parsed.path
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
  if (!blob || !path.includes("/")) return undefined;
  return { base: `https://${parsed.host}/${path}`, blob };
};

export const permalink = (repo: WebRepo, commit: string, path: string): string =>
  `${repo.base}/${repo.blob}/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`;
