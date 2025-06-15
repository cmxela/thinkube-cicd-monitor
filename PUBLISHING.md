# Publishing Guide

This guide explains how to publish the Thinkube CI/CD Monitor extension to Open VSX Registry.

## Prerequisites

1. Create an account at https://open-vsx.org/
2. Generate a personal access token from your account settings
3. Store the token securely

## Publishing Steps

### 1. Prepare the Release

```bash
# Ensure you're on main branch with latest changes
git checkout main
git pull

# Update version in package.json
# Follow semantic versioning: MAJOR.MINOR.PATCH

# Install dependencies
npm install

# Run compilation to ensure no errors
npm run compile

# Create the VSIX package
npm run package
```

### 2. Publish to Open VSX

```bash
# Using npm script (requires OVSX_TOKEN environment variable)
OVSX_TOKEN=your-token npm run publish:ovsx

# Or directly with ovsx CLI
npx ovsx publish -p your-token

# Or if you have ovsx installed globally
ovsx publish -p your-token
```

### 3. Publish with specific VSIX file

```bash
# If you want to publish a specific VSIX file
ovsx publish thinkube-cicd-monitor-1.0.0.vsix -p your-token
```

## Automated Publishing (GitHub Actions)

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to Open VSX

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - run: npm install
      
      - run: npm run compile
      
      - run: npm run publish:ovsx
        env:
          OVSX_TOKEN: ${{ secrets.OVSX_TOKEN }}
```

Don't forget to add `OVSX_TOKEN` to your repository secrets!

## Version Management

Before publishing a new version:

1. Update `version` in `package.json`
2. Update `CHANGELOG.md` (if you have one)
3. Commit changes: `git commit -m "Bump version to X.Y.Z"`
4. Create a git tag: `git tag vX.Y.Z`
5. Push changes and tags: `git push && git push --tags`

## Marketplace Listing

Enhance your Open VSX listing by ensuring these fields in `package.json`:

- `displayName`: Clear, descriptive name
- `description`: Concise explanation of functionality
- `categories`: Appropriate categories for discovery
- `keywords`: Relevant search terms
- `icon`: 128x128px PNG icon
- `repository`: Link to source code
- `license`: License identifier

## Testing Before Publishing

Always test your extension locally:

```bash
# Install the VSIX in code-server
code-server --install-extension thinkube-cicd-monitor-*.vsix

# Verify functionality
# Check all commands work as expected
```

## Post-Publishing

After publishing:

1. Verify the extension appears on Open VSX
2. Test installation from the marketplace
3. Update documentation with installation instructions
4. Announce the release