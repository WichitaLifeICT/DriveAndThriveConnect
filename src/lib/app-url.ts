/** Public base URL of the app, used in emails and share links. */
export function appUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://drive-and-thrive-connect.vercel.app").replace(/\/$/, "");
  return `${base}${path}`;
}
