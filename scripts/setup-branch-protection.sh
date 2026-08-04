#!/usr/bin/env bash
#
# Applique les règles de protection sur `main` et `dev`.
#
# ⚠️  La protection de branche n'est disponible que sur les dépôts **publics**
#     ou avec un plan **GitHub Pro/Team**. Sur un dépôt privé en plan gratuit,
#     l'API renvoie 403 — c'est attendu.
#
# Usage : ./scripts/setup-branch-protection.sh [owner/repo]

set -uo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"

protect() {
    local branch="$1" reviews="$2"

    echo "🔒 Protection de '${branch}' sur ${REPO}…"

    gh api -X PUT "repos/${REPO}/branches/${branch}/protection" \
        -H "Accept: application/vnd.github+json" \
        --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Lint, types & build", "Build de l'image Docker"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": ${reviews},
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
EOF

    if [ $? -eq 0 ]; then
        echo "✅ ${branch} protégée"
    else
        echo "❌ Échec pour ${branch} (dépôt privé en plan gratuit ?)"
    fi
}

# 0 approbation requise : projet solo, la CI verte reste obligatoire.
# Passez à 1 dès qu'un second contributeur rejoint le projet.
protect main 0
protect dev 0
