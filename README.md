# Montage

Application de montage photo premium — transitions élégantes, fondus, durée d'affichage réglable, musique de fond et partage direct sur WhatsApp.

Site **statique**, sans framework ni étape de build : 3 fichiers (`index.html`, `style.css`, `app.js`). Tout le traitement (rendu des transitions et génération de la vidéo) se fait **côté client**, dans le navigateur — aucune photo n'est envoyée à un serveur.

## Fonctionnalités

- Import de photos par sélection ou glisser-déposer.
- Réorganisation des photos (glisser-déposer sur desktop, boutons ‹ › partout ailleurs).
- 7 transitions : fondu croisé, fondu au noir, fondu au blanc, glissement, zoom Ken Burns, dissolve granuleux, morphing doux.
- Durée d'affichage réglable globalement, avec possibilité de durée personnalisée par photo.
- Musique de fond optionnelle, mixée dans l'export.
- Filigrane texte optionnel.
- Templates de style prêts à l'emploi (Romantique, Voyage, Fête, Minimaliste) ou réglages personnalisés.
- Aperçu en temps réel avant export.
- Export vidéo (WebM, via `MediaRecorder` + `canvas.captureStream`), qualité Standard ou Haute définition.
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

- Les transitions « Dissolve granuleux » et « Morphing doux » utilisent deux shaders GLSL de la
  bibliothèque [gl-transitions](https://github.com/gl-transitions/gl-transitions) (MIT), vendorisés
  dans `vendor/gl-transitions/` et intégrés à `app.js` via un petit moteur WebGL (aucune dépendance
  de build). Repli automatique sur un fondu croisé si WebGL n'est pas disponible.
- L'export vidéo se déroule en temps réel (la génération dure aussi longtemps que la vidéo finale) car elle repose sur la capture du flux du canvas — c'est la contrepartie du traitement 100 % côté client, sans dépendance lourde type `ffmpeg.wasm`.
- Format de sortie : WebM (VP9/VP8 + Opus selon le support du navigateur). Compatible avec le partage WhatsApp sur mobile.
- Aucune dépendance externe, aucun `package.json` : à héberger tel quel sur n'importe quel hébergeur statique.
