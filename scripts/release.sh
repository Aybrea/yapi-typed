#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/release.sh <version>"
  echo "Example: ./scripts/release.sh 0.1.2"
  exit 1
fi

VERSION=$1

echo "📦 Releasing version $VERSION..."

echo "1️⃣ Updating version..."
pnpm release:version --ver $VERSION

echo "2️⃣ Building packages..."
pnpm build

echo "3️⃣ Publishing yapi-typed-runtime..."
cd packages/runtime
pnpm publish --access public --no-git-checks

echo "4️⃣ Publishing yapi-typed..."
cd ../cli
pnpm publish --no-git-checks

cd ../..

echo "✅ Released version $VERSION successfully!"
echo "📝 Don't forget to: git add . && git commit -m 'chore: release v$VERSION' && git tag v$VERSION && git push && git push --tags"
