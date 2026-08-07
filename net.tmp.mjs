const key = process.env.OPENAI_API_KEY;

for (const [label, url] of [
  ["api.openai.com/v1/models", "https://api.openai.com/v1/models"],
]) {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const text = await res.text();
    const blocked = text.includes("Cloudflare") || text.trimStart().startsWith("<!DOCTYPE");
    console.log(`${label}: HTTP ${res.status}  ${blocked ? "← intercepted (HTML block page)" : "JSON ok"}`);
    if (blocked) {
      const title = text.match(/<title>([^<]*)<\/title>/)?.[1];
      console.log(`  page title: ${title}`);
    }
  } catch (e) {
    console.log(`${label}: threw ${(e as Error).message}`);
  }
}
