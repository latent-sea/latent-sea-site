// A picture made small enough to upload, in the browser: a phone's photo is
// several megabytes, and a page never shows one larger than about 1200
// pixels. Its longest side is brought down to that, as a JPEG; a picture
// already small enough, or one that moves (a GIF), goes as it is.
//
//     import { shrinkPicture } from "./backend/pictures.js?v=5acfd9881574";
//     const reply = await backend.uploadPicture("dj.jpg", await shrinkPicture(file));

/** The picture, its longest side at most longest pixels, as a JPEG Blob; a GIF, or one already small, unchanged. */
export async function shrinkPicture(file, longest = 1200, quality = 0.86) {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.type === "image/jpeg" && file.size < 1024 * 1024) { bitmap.close?.(); return file; }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const drawn = canvas.getContext("2d");
  drawn.fillStyle = "#000"; // a transparent PNG's clear parts, on black rather than JPEG's undefined
  drawn.fillRect(0, 0, canvas.width, canvas.height);
  drawn.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((done) => canvas.toBlob((blob) => done(blob ?? file), "image/jpeg", quality));
}
