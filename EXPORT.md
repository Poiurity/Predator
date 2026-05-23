# Code and Asset Export Checklist

The deployed service uses a temporary account. Keys and Cloud Run resources expire after the
judging period. Walk through this checklist today — do not leave it for tomorrow.

---

## Repository

- [ ] Confirm the public GitHub repo is accessible without sign-in:
      https://github.com/Poiurity/Predator
- [ ] Confirm the `submission` tag is visible on GitHub:
      https://github.com/Poiurity/Predator/releases/tag/submission
      (or: `git ls-remote --tags origin | grep submission`)
- [ ] Clone a fresh copy to verify the public URL works:
      `git clone https://github.com/Poiurity/Predator.git living-stage-backup`
- [ ] Confirm the clone includes the tag:
      `cd living-stage-backup && git fetch --tags && git tag`

---

## Critical files to back up individually

These files are in the repo, but make explicit copies to a personal Google Drive or local folder
outside this machine's temp account:

- [ ] `src/rehearsed.json` — the fallback replay data (all five widget types, ordered index). If this
      file is lost, the fallback demo cannot replay without Gemini.
- [ ] `src/PREFIX.ts` — the 4500-token byte-stable prefix. The SHA logged on boot comes from this
      file. Record the current SHA from the browser console (`PREFIX_SHA:` line on first load) so
      you can verify it later.
- [ ] `server.js` — the Cloud Run proxy. Not complex, but re-typing from memory is error-prone.
- [ ] `src/lib/safe-math.ts` — the AST sandbox. The allowed function list is the contract between
      the model and the evaluator.

---

## Cloud Run service

- [ ] Record the service URL: `https://predator-635265297806.us-central1.run.app/`
- [ ] Record the service name: `living-stage` (or verify with `gcloud run services list`)
- [ ] Record the region: `us-central1`
- [ ] List the current env var names (NOT values) set on the service:
      `gcloud run services describe living-stage --region us-central1 --format='value(spec.template.spec.containers[0].env[].name)'`
      Expected: `GEMINI_API_KEY` (at minimum)
- [ ] Do NOT record the key value anywhere in this repo or in a cloud document. It is a temporary
      key that will expire — recording it provides no durable value and is a security risk.

---

## API key note

The `GEMINI_API_KEY` configured on the Cloud Run service is a temporary account key.
It will expire after the judging period ends. To redeploy this project after the hackathon:

1. Obtain a new API key from Google AI Studio (aistudio.google.com).
2. Set it on the Cloud Run service:
   `gcloud run services update living-stage --update-env-vars GEMINI_API_KEY=NEW_KEY --region us-central1`
3. Run `npm run scan:keys` to confirm the key is not in the repo.

---

## PREFIX SHA record

On the first page load, the browser console logs a line like:

```
PREFIX_SHA: sha256-<hex>  length: <N>
```

Record this value here so you can detect prefix drift if you redeploy:

```
PREFIX_SHA: [FILL IN FROM CONSOLE ON NEXT PAGE LOAD]
```

---

## Demo recording

- [ ] Screen recording of the working demo at 1080p/60fps is saved to personal Google Drive
      (the video submitted to the hackathon form counts — confirm you have a copy, not just
      the YouTube/Drive link)
- [ ] Video filename includes the date: e.g. `living-stage-demo-2026-05-23.mp4`

---

## Zip backup (belt and suspenders)

Create a zip of the repo at submission state and upload to personal Google Drive:

```bash
cd "/Users/lee/Desktop/Personal/2026 Google IO Hackathon"
git -C Predator archive --format=zip --prefix=living-stage/ submission > living-stage-submission-2026-05-23.zip
```

Then upload `living-stage-submission-2026-05-23.zip` to your personal Google account's Drive
(not the temporary hackathon account).

---

## Verification: nothing missed

After completing the checklist:

- [ ] The GitHub repo is public and the `submission` tag resolves to commit `0e858354b98a22bc5836b8331805262dc8a9a530`
- [ ] `rehearsed.json`, `PREFIX.ts`, `server.js`, `safe-math.ts` copies exist outside this machine
- [ ] Demo video copy exists outside this machine
- [ ] Cloud Run service URL and env var name are recorded
- [ ] You can `npm install && npm run dev` from the cloned backup repo (with your own `GEMINI_API_KEY`)
