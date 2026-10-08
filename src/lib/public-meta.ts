export function publicMeta(title: string, description: string) {
  const name = `${title} — CAREFLOW AI`;
  return { meta: [{ title: name }, { name: "description", content: description }, { property: "og:title", content: name }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] };
}
