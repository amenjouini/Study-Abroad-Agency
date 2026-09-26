import { chromium } from "playwright";
const [,, email, password, ...paths] = process.argv;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300)); });
await page.goto("http://localhost:3000/login");
await page.fill("#email", email);
await page.fill("#password", password);
await Promise.all([page.waitForURL(/dashboard|onboarding/, { timeout: 60000 }), page.click("button[type=submit]")]);
console.log("logged in ->", page.url());
for (const p of paths) {
  await page.goto("http://localhost:3000" + p, { waitUntil: "networkidle", timeout: 90000 });
  const name = p.replace(/[^\w]+/g, "_");
  await page.screenshot({ path: `C:/Users/LENOVO/AppData/Local/Temp/claude/d--Projects-bon-ita/d32f9915-3dc4-42be-866e-87aeb3303891/scratchpad/${name}.png`, fullPage: true });
  const text = await page.locator("main").innerText().catch(() => "");
  const missing = text.match(/\b(student|common|enums|nav)\.[\w.]+/g);
  console.log(p, "->", page.url().replace("http://localhost:3000", ""), missing ? "MISSING KEYS: " + [...new Set(missing)].slice(0, 8).join(", ") : "ok");
}
if (errors.length) console.log("ERRORS:\n" + errors.slice(0, 10).join("\n"));
await browser.close();
