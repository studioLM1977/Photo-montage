# DiapLIOrama

Application de montage photo premium — transitions élégantes, fondus, durée d'affichage réglable, musique de fond et partage direct sur WhatsApp.

Site **statique**, sans framework ni étape de build : `index.html`, `style.css`, `app.js`, `manifest.json` et les fichiers d'icône (`icon.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) — tous à la racine, pour rester compatibles avec un upload par glisser-déposer sur GitHub (qui ne recrée pas de sous-dossiers). Tout le traitement (rendu des transitions et génération de la vidéo) se fait **côté client**, dans le navigateur — aucune photo n'est envoyée à un serveur.

## Fonctionnalités

- Import de photos par sélection ou glisser-déposer.
- Réorganisation des photos (glisser-déposer sur desktop, boutons ‹ › partout ailleurs).
- 10 transitions : fondu croisé, fondu au noir, fondu au blanc, glissement, zoom Ken Burns (Classiques) + dissolve granuleux, morphing doux, Cross Zoom, Cube 3D, Porte dérobée (Premium ✨).
- Option « Transitions aléatoires » : un style différent (mais stable) à chaque changement de photo, piochée parmi toutes les transitions.
- Durée d'affichage réglable globalement, avec possibilité de durée personnalisée par photo.
- Musique de fond optionnelle, mixée dans l'export.
- Filigrane texte optionnel.
- Templates de style prêts à l'emploi (Romantique, Voyage, Fête, Minimaliste) ou réglages personnalisés.
- Aperçu en temps réel avant export.
- Export vidéo (MP4 si le navigateur le supporte, WebM sinon, via `MediaRecorder` + `canvas.captureStream`), qualité Standard ou Haute définition.
- Partage direct vers WhatsApp (`navigator.share`), avec repli téléchargement + ouverture de WhatsApp si l'appareil ne supporte pas le partage de fichier.
- Historique des montages générés dans la session en cours.
- Thème sombre/clair, respect de `prefers-reduced-motion`.

## Développement local

Un simple serveur statique suffit (l'app n'a pas de backend) :

```bash
python3 -m http.server 8000
```

Puis ouvrir `http://localhost:8000`. `MediaRecorder` et le partage de fichiers nécessitent un contexte sécurisé : `localhost` fonctionne, mais en production il faut du HTTPS (Vercel, Netlify, GitHub Pages… fournissent HTTPS par défaut).

## Notes techniques

- Les 5 transitions « Premium » (Dissolve granuleux, Morphing doux, Cross Zoom, Cube 3D, Porte
  dérobée) utilisent des shaders GLSL de la bibliothèque
  [gl-transitions](https://github.com/gl-transitions/gl-transitions) (MIT), vendorisés dans
  `vendor/gl-transitions/` et intégrés à `app.js` via un petit moteur WebGL (aucune dépendance de
  build). Repli automatique sur un fondu croisé si WebGL n'est pas disponible.
- L'export vidéo se déroule en temps réel (la génération dure aussi longtemps que la vidéo finale) car elle repose sur la capture du flux du canvas — c'est la contrepartie du traitement 100 % côté client, sans dépendance lourde type `ffmpeg.wasm`.
- Format de sortie : MP4 (H.264/AAC) en priorité — c'est le seul format que WhatsApp accepte de façon fiable pour un partage vidéo. Repli sur WebM (VP9/VP8 + Opus) si le navigateur ne sait pas encoder de MP4 côté client.
- Aucune dépendance externe, aucun `package.json` : à héberger tel quel sur n'importe quel hébergeur statique.
- `MediaRecorder` produit un MP4 **fragmenté** (`moov` + `moof` + `mdat`, sans vraies tables
  d'échantillons, durée à 0) — une structure valide en soi, mais que WhatsApp semble refuser pour
  un envoi de document (il attend une vidéo "classique" façon caméra). `flattenMp4()` dans `app.js`
  reconstruit une table d'échantillons classique (`stts`/`stsc`/`stsz`/`stco`/`stss`) à partir des
  boîtes `moof`/`traf`/`trun`, sans toucher aux octets image, sans dépendance externe. Gère aussi
  le cas où `MediaRecorder` découpe un enregistrement en **plusieurs fragments** (plusieurs paires
  `moof`+`mdat`) — chaque fragment est recollé dans un seul `mdat` final, avec recalcul des offsets
  par échantillon (sans quoi les données des fragments précédant le dernier étaient perdues,
  corrompant visiblement la fin des montages un peu longs). Validé par re-décodage pixel-perfect.
- Le `ftyp` produit par `MediaRecorder` déclare des marques réservées au streaming fragmenté
  (`iso5`/`hlsf`/`cmfc` — HLS/CMAF d'Apple), même une fois le fichier reconstruit en MP4 classique
  par `flattenMp4()`. WhatsApp semble s'y fier pour refuser un envoi en document malgré un fichier
  par ailleurs valide. Le `ftyp` est donc réécrit avec des marques génériques `isom`/`iso2`/`avc1`/
  `mp41`, standard pour une vidéo "classique".
- Les transitions restent légèrement plus compressées que les photos statiques (mesuré ~2-3 dB de
  PSNR en moins) : c'est une limite normale de l'encodage vidéo temps réel du navigateur (chaque
  image change beaucoup pendant un fondu, contre presque rien sur une photo fixe) — augmenter le
  bitrate n'apporte qu'un gain marginal (testé), pas un vrai correctif.
