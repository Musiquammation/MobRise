---
name: push-android-presentation
description: Upload the MobRise store listing images from dist/android-presentation (app icon, feature graphic, phone, 7" and 10" tablet screenshots) to the Google Play Console default store listing and save it as a draft. Use when asked to push, upload or update the Android / Play Store listing images, or "mettre à jour la fiche android".
---

# Push the Android presentation images to Google Play

Replaces every image of the **default store listing** (Fiche Play Store par défaut, en-US) with the files from `dist/android-presentation/` (made by the `android-presentation` skill), in upload order, then **saves as a draft**.

- Console app URL: `https://play.google.com/console/u/0/developers/6260870797944746330/app/4973667727940247656/app-dashboard`
- Listing editor: `…/app/4973667727940247656/store-listings/default/edit` (open it from the dashboard if a direct link redirects to Home: Grow > Store presence > Fiches Play Store > "Modifier la fiche par défaut").
- The Console UI is in French: labels below are the French ones.

| Slot (section) | Files |
|---|---|
| Icône de l'application | `icon-512.png` |
| Image de présentation | `feature-graphic-1024x500.png` |
| Captures d'écran pour téléphone (Éléments pour téléphone) | `phone/01…08` (1080×1920; 09–13 are spares, Play takes 8 max) |
| Captures d'écran pour tablette 7 pouces (Éléments pour tablette) | `tablet-7in/01…08` (1920×1080) |
| Captures d'écran pour tablette 10 pouces (Éléments pour tablette) | `tablet-10in/01…08` (2560×1440) |

## Browser

Use **Claude in Chrome** (the user is signed in to the Play Console there). The built-in browser cannot upload files. Upload with `file_upload` on the hidden `file-input` (found with `find "file-input"`), never by clicking "Importer" (that opens a native picker). Keep each `file_upload` call under 10 MB: 4 phone or 4 tablet images per call.

## Steps

### 1. Stage the files

```bash
bash skills/push-android-presentation/scripts/stage.sh <scratchpad>/upload
```

It copies the images with a `-YYYYMMDD-HHMM` suffix. **Distinct names are required**: the asset library keeps old files under their original name, and the same name is shared by the phone and tablet versions of one image, so the suffix plus the pixel size is how you tell them apart.

Look at the images (or a contact sheet) before pushing if they were not reviewed already.

### 2. Open the listing editor

`tabs_context_mcp`, new tab, navigate to the dashboard then to the default listing editor. Wait for the "Chargement…" screen to finish.

### 3. Remove the old images (form only)

Every image has a button `aria-label="Supprimer <file name>"`. Removing them only changes the form until saved. Buttons re-render after each click, so re-query each time:

```js
const q=()=>[...document.querySelectorAll('button')].filter(b=>/^Supprimer .*\.png$/.test(b.getAttribute('aria-label')||''));
// DOM order: icon, feature graphic, phone ×8, 7" ×8, 10" ×8
```

Click one, wait ~700 ms, query again. Remove one slot at a time (e.g. always click `q()[2]` for the phone slot while it holds old files), and check the remaining list after each pass.

### 4. Fill each screenshot slot in order

For each slot (phone, 7", 10"):

1. Click the slot's **"Ajouter des composants"** (use `find "Ajouter des composants button under Captures d'écran pour tablette 7 pouces"`; the tablet section may need "Éléments pour tablette" expanded first). An asset library panel opens on the right.
2. `find "file-input"` and upload the slot's 8 files (2 calls of 4). Wait ~8 s.
3. **The upload auto-adds files to the slot in completion order, not 01→08** (and sometimes only the last one). So remove every new file from that slot again (step 3 loop, on the slot's index range).
4. Tag the right library rows, because names collide between phone/tablet versions: walk up from each `[role=group]` whose `aria-label` starts with `Élément 0N-…-<suffix>.png` until the text contains `NxMpx`, and when it is the slot's size (`1080x1920px`, `1920x1080px`, `2560x1440px`) rename it: `g.setAttribute('aria-label','PICK<slot> slot 0N')`. Beware `16:9` prefixes the size in the text (`…91920x1080px`): test with `includes('1920x1080px')`, not a regex capture.
5. `find "group PICK<slot> slot"` to get refs, then **real clicks** (JS `.click()` does not select) on 01, 02, … 08 in that order. Check that 8 groups have `aria-label` ending in ` Sélectionné`.
6. Click **"Ajouter"** at the bottom of the panel (≈ x 1520, y 660 in a 1568×739 frame), then close the panel (X at the top right).
7. Check the slot: list the `Supprimer …` labels and take a screenshot (tablet thumbnails must be landscape, phone ones portrait).

### 5. Icon and feature graphic

Remove the old one, click that section's "Ajouter des composants", upload the single file: with one file it is added directly. Close the panel.

### 6. Save

Check the whole list once more (2 + 8 + 8 + 8 files, all with the new suffix, in order), then click **"Enregistrer comme brouillon"** (bottom bar) and wait for "Vos modifications ont été enregistrées".

**Stop there** unless the user explicitly asked in chat to send it for review. Otherwise ask (after the draft is saved), then continue with step 7 on their yes. Close the tab you opened and report what was replaced.

### 7. Send for review (only on the user's explicit yes)

Managed publishing is off for this app, so once Google approves, the listing goes live automatically.

1. In the listing editor (draft reloaded intact), click **"Suivant"**. This opens step 2, "Avis".
2. **Déclaration relative aux éléments d'IA**: pick a radio button. The user chose **"Ne pas signaler les éléments"** on 2026-11-12, because the images are real game captures framed by a script, with no image-generation model. The user kept the same choice on 2026-11-12 for listing text drafted with Claude. Ask again if the images are ever made differently. The page scrolls while it loads: click the radio by `find` ref, not by coordinates, then check `input[type=radio]` `.checked`.
3. Click **"Enregistrer"**. In the dialog "Accéder à 'Vue d'ensemble de la publication' ?", click **"Accéder à l'aperçu"**.
4. On the publishing overview (`…/app/4973667727940247656/publishing`), check the list under "Modifications pas encore envoyées pour examen". It should hold only our changes: icon, phone, 7", 10" screenshots and feature graphic (5 rows). If anything else is pending, ask before sending.
5. Click **"Envoyer N modifications pour examen"**, then confirm with **"Envoi des modifications pour examen"** in the dialog. The heading turns into "Modifications en cours d'examen". Review usually takes up to 7 days, and the quick checks can still be running (≈ 15 min), which does not block sending.
6. If a review is already running, Play shows "Voulez-vous recommencer l'examen ?": sending cancels and restarts it, which makes the wait longer. Ask the user before clicking "Recommencer l'examen".

## Notes

- The Console may block JS results that contain URLs or cookies (`[BLOCKED: Cookie/query string data]`): return only labels or counts, never `outerHTML` or `href` lists with query strings.
- If the listing text also changed (`skills/android-presentation/references/listing-text.md`), it lives in the same form (Nom de l'application ≤ 30, Brève description ≤ 80, Description complète ≤ 4000); update it only when asked.
