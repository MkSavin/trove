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

/** The host of an SSH remote, `git@host:path` or `ssh://host/path`, which may be an alias. */
export const sshHost = (remote: string): string | undefined => {
  const trimmed = remote.trim();
  if (URL.canParse(trimmed)) {
    const url = new URL(trimmed);
    return url.protocol === "ssh:" || url.protocol === "git+ssh:" ? url.hostname : undefined;
  }
  const host = SCP_LIKE.exec(trimmed)?.[1];
  return host && host.length > 1 ? host : undefined;
};

/**
 * GitHub and GitLab remotes, by host name; credentials in the URL are dropped. `host` replaces the
 * remote's own, e.g. the real host behind an SSH alias.
 */
export const webRepo = (remote: string, host?: string): WebRepo | undefined => {
  const parsed = hostAndPath(remote.trim());
  if (!parsed) return undefined;
  const server = host ?? parsed.host;
  const blob = server.includes("github")
    ? "blob"
    : server.includes("gitlab")
      ? "-/blob"
      : undefined;
  const path = parsed.path
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
  if (!blob || !path.includes("/")) return undefined;
  return { base: `https://${server}/${path}`, blob };
};

export const permalink = (repo: WebRepo, commit: string, path: string): string =>
  `${repo.base}/${repo.blob}/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`;
