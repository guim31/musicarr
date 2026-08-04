#!/bin/bash

# Pas de `set -e` : le script gère lui-même les codes retour de rsync/ssh.
set -uo pipefail

# --- Configuration ---
# Renseignez ces valeurs dans un fichier .env local (non versionné) ou
# exportez-les avant d'appeler le script. Voir .env.example.
if [ -f .env ]; then
    # shellcheck disable=SC1091
    set -a; . ./.env; set +a
fi

NAS_USER="${NAS_USER:-}"
NAS_HOST="${NAS_HOST:-}"
NAS_PATH="${NAS_PATH:-/mnt/user/appdata/musicarr}"

if [ -z "$NAS_USER" ] || [ -z "$NAS_HOST" ]; then
    echo "❌ NAS_USER et NAS_HOST doivent être définis (dans .env ou via l'environnement)."
    echo "   Exemple : NAS_USER=root NAS_HOST=192.168.1.10 ./deploy.sh"
    exit 1
fi

# Couleurs pour le terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Préparation du déploiement de Musicarr vers le NAS...${NC}"

# Vérification de la présence du fichier .env
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  Attention: Aucun fichier .env trouvé localement.${NC}"
fi

echo -e "${YELLOW}📦 Synchronisation des fichiers vers ${NAS_HOST}:${NAS_PATH}...${NC}"

# Commande rsync optimisée pour Unraid
# -a : archive (conserve permissions, dates, etc.)
# -v : verbeux
# -z : compression
# --delete : supprime les fichiers sur le NAS qui n'existent plus localement
# --chown=99:100 : force l'appartenance à nobody:users (standard Unraid)
rsync -avz --delete --chown=99:100 \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.next' \
  --exclude 'data' \
  --exclude '.env*' \
  --exclude '.DS_Store' \
  --exclude 'deploy.sh' \
  --exclude 'README.md' \
  --exclude 'DEPLOIEMENT_NAS.md' \
  --exclude '.gemini' \
  --exclude '.agents' \
  --exclude 'AI_CONTEXT.md' \
  ./ "$NAS_USER@$NAS_HOST:$NAS_PATH"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Synchronisation terminée avec succès !${NC}"
    
    echo -e "${BLUE}🔄 Voulez-vous reconstruire et redémarrer le conteneur sur le NAS ?${NC}"
    read -p "(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}🐳 Exécution de docker compose sur le NAS...${NC}"
        # On se déplace dans le dossier et on lance le build
        ssh "$NAS_USER@$NAS_HOST" "cd $NAS_PATH && docker compose up -d --build"
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✨ Musicarr est à jour et redémarré sur le NAS !${NC}"
            echo -e "${BLUE}🌐 Application : http://$NAS_HOST:3005${NC}"
        else
            echo -e "${RED}❌ Erreur lors du redémarrage Docker sur le NAS.${NC}"
        fi
    else
        echo -e "${YELLOW}ℹ️  Mise à jour terminée. N'oubliez pas de redémarrer le conteneur si nécessaire.${NC}"
        echo -e "${BLUE}🌐 Une fois démarré, l'app sera sur http://$NAS_HOST:3005${NC}"
    fi
else
    echo -e "${RED}❌ Erreur lors du transfert rsync. Vérifiez votre connexion SSH et l'IP du NAS.${NC}"
    exit 1
fi
