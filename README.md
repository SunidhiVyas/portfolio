# Sunidhi Vyas — Portfolio

Plain HTML / CSS / JavaScript + Three.js. No build step, no npm dependencies.

## Run it
The page uses ES modules and WebGL textures, so it must be served over http
(double-clicking index.html will NOT work). Pick one:

    python3 -m http.server 8000      -> http://localhost:8000
    npm start                        -> http://localhost:3000   (needs Node)
    VS Code "Live Server" extension  -> right-click index.html > Open with Live Server

Refresh the browser after each change.

## Project structure
    index.html               page markup (all sections)
    css/style.css            all styles (colors are CSS variables at the top: :root)
    js/experience-data.js    EDIT: About / experience content
    js/skills-data.js        EDIT: skills shown in the 3D universe
    js/projects-data.js      EDIT: project cards (title, github link, image)
    js/contact-data.js       EDIT: email, socials, form handler (handleSubmit)
    js/assets.js             paths of the portrait images
    js/main.js               all animation / WebGL logic (Three.js scenes)
    assets/                  portrait + depth-map images
    vendor/three.module.js   Three.js r160 (local copy, works offline)

## Common changes
- Text / links / skills / projects  -> the four js/*-data.js files
- Colors, fonts, spacing            -> css/style.css (:root variables)
- Page title / meta description     -> index.html <head>
- Project screenshots               -> put images in a new projects/ folder and
                                       reference them in js/projects-data.js
- Contact form backend              -> handleSubmit() in js/contact-data.js

Google Fonts (Instrument Serif, Manrope) load from the internet; everything
else works offline.

## Deploy
Upload the whole folder to Netlify, Vercel, GitHub Pages or any static host.
