/** Environment variables the build reads through `import.meta.env`. */
interface ImportMetaEnv {
  /** A fine-grained GitHub token with read-only Metadata on all repositories; `src/lib/activity.ts` reads the GitHub activity with it. */
  readonly GITHUB_ACTIVITY_TOKEN?: string;
}
