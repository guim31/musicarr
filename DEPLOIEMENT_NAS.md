# Instructions de déploiement et de test sur le NAS (Unraid / IP: 192.168.100.150)

Ces instructions vous permettront de transférer et de lancer manuellement Musicarr sur votre NAS afin d'effectuer des tests rapides sans passer par un dépôt Git ou une CI/CD complexe.

## 1. Transférer le code local vers le NAS
Depuis le terminal de votre ordinateur de développement, placez-vous à la racine du projet `musicarr` et exécutez la commande suivante. Elle synchronisera les fichiers tout en ignorant ceux inutiles à confier au NAS (node_modules, build...).

*Note : Adaptez `root` à votre utilisateur NAS et `/mnt/user/appdata/musicarr/` au chemin de destination sur votre serveur. Pour corriger les problèmes de permissions sur Unraid, on utilise `--chown=99:100` afin que les fichiers appartiennent à `nobody:users`.*

```bash
rsync -avz --chown=99:100 \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  --exclude 'data' \
  ./ root@192.168.100.150:/mnt/user/appdata/musicarr/
```

## 2. Se connecter au NAS
Ouvrez une nouvelle fenêtre de terminal et connectez-vous au NAS en SSH :

```bash
ssh root@192.168.100.150
```

## 3. Configurer l'environnement de Production
Sur le NAS, déplacez-vous dans le dossier qui vient d'être synchronisé :

```bash
cd /mnt/user/appdata/musicarr/
```

Si c'est la première fois ou que des fichiers ont des mauvais droits, appliquez immédiatement le bon propriétaire Unraid (`nobody:users`) sur tout le dossier :
```bash
chown -R 99:100 /mnt/user/appdata/musicarr
chmod -R 777 /mnt/user/appdata/musicarr
```

Ouvrez le fichier de configuration Docker (`.env`) avec l'éditeur `nano` :

```bash
nano .env
```

Modifiez le fichier pour qu'il mappe le bon volume persistant. Il doit ressembler à ceci :

```env
# Pointant vers votre NAS (Production) :
MUSIC_DIR=/mnt/user/data/media/music
```

*(Si `nano` est utilisé : Sauvegardez avec `Ctrl+O` puis `Entrée`, et quittez avec `Ctrl+X`)*.

## 4. Démarrer Musicarr
Toujours dans ce même dossier sur le NAS, dites à Docker de re-construire l'image avec les nouveaux fichiers, puis de la lancer en arrière-plan :

```bash
docker compose up -d --build
```
*Le premier lancement prendra quelques minutes pour télécharger les dépendances Node.js d'une image vierge.*

## 5. Tester l'application
Sur votre ordinateur de développement, ouvrez simplement votre navigateur à l'adresse suivante :

👉 **http://192.168.100.150:3005**

Vous voici sur l'instance de test côté NAS !

---

### Commandes utiles (sur le NAS)
- Voir les logs en direct (et surveiller les erreurs API ou le téléchargement d'albums en fond) :
  ```bash
  docker logs -f musicarr
  ```
- Arrêter proprement le conteneur de test :
  ```bash
  docker compose down
  ```
