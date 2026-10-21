// Uploaded media keeps the extension the server sniffed it into, so the url
// tells the markdown renderer whether image syntax should become a player.
export function isVideo(url: string) {
  return /\.(mp4|webm)(?:[?#]|$)/i.test(url);
}

// hasMedia reports whether body contains an attachment: images and video share
// the markdown image syntax.
export function hasMedia(body: string) {
  return /!\[[^\]]*\]\([^)]+\)/.test(body);
}

// attachmentNames lists the alt text of each attachment in body.
export function attachmentNames(body: string) {
  return [...body.matchAll(/!\[([^\]]*)\]\([^)]+\)/g)].map((m) => m[1] || "attachment");
}
