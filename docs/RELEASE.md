# Release Process

This repo uses a `vX.Y.Z` tag format. Publishing a GitHub Release triggers the
release workflows (`release-web.yml`, `release-desktop.yml`).

## Pre-Release Checklist

- Ensure `main` is green in CI.
- Confirm any migrations or breaking changes are documented.
- Decide the version bump (major/minor/patch).

## Version Bump

1. Update all package versions using the version sync script:
   ```bash
   pnpm run version:set X.Y.Z
   ```
2. Verify versions are consistent:
   ```bash
   pnpm run version:check
   ```
3. Run basic checks:
   ```bash
   pnpm lint
   pnpm typecheck
   ```

## Tag and Release

1. Commit version changes:
   ```bash
   git add .
   git commit -m "chore(release): vX.Y.Z"
   ```
2. Create and push an annotated tag:
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin main --tags
   ```
3. Create a GitHub Release for the tag (publish it).

Publishing the release triggers web and desktop release workflows.

## Release Candidates (Optional)

To produce a staging build, publish a prerelease tag like:

- `vX.Y.Z-rc.1`

The `release-web.yml` workflow deploys to staging when the release tag contains
`rc`. You can also trigger a build via workflow dispatch with a specific tag.
