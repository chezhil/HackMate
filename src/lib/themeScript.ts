// Plain module (no "use client") so the server layout can inline the script as a string.

/** localStorage key for the light / dark choice. */
export const THEME_KEY = "hackmate-theme";

/** Runs before React, so a saved light/dark choice is in place before the first paint. */
export const themeScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
