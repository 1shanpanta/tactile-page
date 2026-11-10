# Tactile Page

Tactile Page is a website: a single-page web app that runs fully in your browser. It is not a browser extension and not a desktop app. There is no server, no account and no upload.

Tactile Page makes a first-pass tactile graphic from a clean diagram, for teachers of blind students. It checks the result against selected BANA tactile graphics rules.

## What it does

- Simplifies a clean diagram (PNG, JPG, SVG or a built-in sample) for swell paper with plain pixel arithmetic.
- Sets labels in uncontracted braille, with a key where a word does not fit, and checks 17 BANA rules.
- Lets the teacher edit labels and parts, then exports an SVG and a PDF at true size.

## Run it

No hosted copy exists yet. Run it locally.

```
npm install
npm run dev
npm test
npm run build
```

`npm run build` writes static files to `dist/`.

## Folder map

- `src/pipeline/`: image steps and label placement.
- `src/rules/`: rule data and the checker.
- `src/braille/`: braille table and dot geometry.
- `src/export/`: page layout, SVG and PDF writers.
- `src/io/`, `src/ai/`: source loading and the optional AI step.
- `src/components/`: React interface.
- `src/samples/`: four original sample diagrams.
- `docs/`: documentation.

## Limits

- It handles clean diagrams only. Phone photos, shaded art and 3D drawings do not work.
- No blind reader has felt the output.
- A teacher must review every page by touch.
- Text in an uploaded image may need typing.
- It is a check against selected rules, not BANA compliance.

## Docs

- [Architecture](docs/architecture.md)
- [Components](docs/components.md)
- [Data model](docs/data-model.md)
- [Rules](docs/rules.md)

## Licence

MIT. See `LICENSE`.

Built for the CTRL-V Hackathon.
