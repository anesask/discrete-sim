# Release Checklist for v0.1.7

## Pre-Release Verification ✅

- [x] All tests passing (570/570)
- [x] Version updated in package.json (0.1.7)
- [x] CHANGELOG.md updated with release notes
- [x] Build successful (dist/ files generated)
- [x] Linter passing (no errors)
- [x] Examples working (traffic-light tested)

## Git Workflow

### 1. Check Current Status
```bash
git status
```

### 2. Stage All Changes
```bash
# Add all modified files
git add .

# Or add specific files
git add src/ tests/ examples/ CHANGELOG.md package.json
```

### 3. Create Commit
```bash
git commit -m "$(cat <<'EOF'
Release v0.1.7: Event coordination and observability

Added:
- SimEvent class for process coordination (barriers, broadcasts, signals)
- Observability system with trace mode (events, resources, processes)
- Traffic light example demonstrating event coordination
- 41 new comprehensive tests (24 SimEvent + 17 observability)

Updated:
- Process class to handle event requests and cleanup
- Simulation class with trace configuration and emission methods
- Test thresholds for performance tests (reduced flakiness)

All 570 tests passing.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### 4. Create Git Tag
```bash
# Create annotated tag for the release
git tag -a v0.1.7 -m "Release v0.1.7: Event coordination and observability"

# Verify tag was created
git tag -l
```

### 5. Push to Remote
```bash
# Push commits
git push origin main

# Push tags
git push origin --tags

# Or push both at once
git push origin main --follow-tags
```

## NPM Publishing

### 1. Verify You're Logged In
```bash
npm whoami
```

If not logged in:
```bash
npm login
```

### 2. Dry Run (Optional but Recommended)
```bash
# See what will be published
npm pack --dry-run

# Or create actual tarball to inspect
npm pack
# This creates discrete-sim-0.1.7.tgz
# Extract and review: tar -xzf discrete-sim-0.1.7.tgz
```

### 3. Publish to NPM
```bash
# Publish the package
npm publish

# For first-time publish or if package is scoped
npm publish --access public
```

### 4. Verify Publication
```bash
# Check on npmjs.com
# https://www.npmjs.com/package/discrete-sim

# Or install in a test project
mkdir test-install && cd test-install
npm init -y
npm install discrete-sim@0.1.7
node -e "const {SimEvent} = require('discrete-sim'); console.log('Success!');"
```

## Post-Release

### 1. Create GitHub Release (if using GitHub)
1. Go to: https://github.com/anesask/discrete-sim/releases/new
2. Tag: `v0.1.7`
3. Title: `v0.1.7 - Event Coordination and Observability`
4. Description: Copy from CHANGELOG.md
5. Attach: `discrete-sim-0.1.7.tgz` (optional)
6. Publish release

### 2. Update Documentation (if needed)
- Website updates
- README badges (version, downloads)
- Example links

### 3. Announce Release
- Twitter/Social media
- Discord/Slack communities
- Reddit (r/node, r/typescript)
- Dev.to or Hashnode blog post

## Troubleshooting

### If commit fails
```bash
# Unstage files if needed
git reset

# Check what will be committed
git diff --cached
```

### If push fails
```bash
# Pull latest changes first
git pull origin main --rebase

# Resolve any conflicts, then
git rebase --continue

# Push again
git push origin main --follow-tags
```

### If publish fails
```bash
# Check package.json for errors
npm run prepublishOnly

# Verify you have publish permissions
npm owner ls discrete-sim

# Check if version already exists
npm view discrete-sim versions
```

### If you need to unpublish (within 72 hours)
```bash
# Unpublish specific version (use with caution!)
npm unpublish discrete-sim@0.1.7

# Note: Can only unpublish within 72 hours of publish
```

## Quick Reference Commands

```bash
# Complete release in one go
npm run prepublishOnly  # Runs lint, test, build
git add .
git commit -m "Release v0.1.7"
git tag -a v0.1.7 -m "Release v0.1.7"
git push origin main --follow-tags
npm publish
```

## Safety Tips

1. **Always run tests before releasing**: `npm test`
2. **Use semantic versioning**: MAJOR.MINOR.PATCH
3. **Create git tags**: Makes it easy to find releases
4. **Keep CHANGELOG updated**: Users appreciate clear release notes
5. **Test in clean environment**: `npm pack` then test tarball
6. **Never commit .env or secrets**: Check .gitignore
7. **Review files being published**: Use `npm pack --dry-run`
8. **Double-check version**: Make sure it matches package.json

## Files Included in NPM Package

Based on `package.json` "files" field:
- `dist/` - Compiled JavaScript and TypeScript definitions
- `README.md` - Main documentation
- `LICENSE` - MIT license

**Not included** (and that's good):
- `src/` - Source TypeScript (users get compiled version)
- `tests/` - Test files
- `examples/` - Example code
- `.git/` - Git metadata
- `node_modules/` - Dependencies
