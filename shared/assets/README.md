# Fichiers servis par jsDelivr au lieu du CDN Webflow

Ces fichiers étaient servis par le CDN Webflow et comptaient dans la bande passante du site Prod
(limite de 300 Go par mois ; deux mois de suite au-dessus = option facturée d'office). Servis ici
par jsDelivr, épinglés sur un commit, ils ne coûtent plus rien à Webflow. Le visiteur ne voit pas
de différence : ce sont les mêmes fichiers, et la page est déjà connectée à jsDelivr.

| Dossier | Contenu | Utilisé par |
|---|---|---|
| `fonts/` | Inter v20 latin + latin-ext, 6 graisses, octet pour octet les fichiers téléversés dans Webflow le 19/05/2026 | `@font-face` et préchargements du code d'en-tête du site |
| `amt/` | Fiche automesure tensionnelle (même fichier que `Fiche AMT_compressed.pdf`) | liens « Imprimer » de /tools/amt |
| `onboarding/` | les 4 vidéos du diaporama | Code Embed de /membership/prise-en-main |
| `meta/` | aperçu de lien (1200 px, JPEG) et icône d'écran d'accueil iPhone (180 px) | réglages de page (Open Graph) et code d'en-tête |

Règles :

- Toujours épingler un commit dans l'URL (`ordotype-scripts@<sha>/shared/assets/…`), jamais `@main`.
- Après une nouvelle épingle, préchauffer chaque URL sur jsDelivr avant de la mettre en ligne.
- Ne jamais modifier un fichier en place : ajouter un nouveau nom, puis changer l'épingle.
