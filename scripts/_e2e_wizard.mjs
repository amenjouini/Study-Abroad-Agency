import { chromium } from "playwright";
const S = "C:/Users/LENOVO/AppData/Local/Temp/claude/d--Projects-bon-ita/d32f9915-3dc4-42be-866e-87aeb3303891/scratchpad/";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
const email = `e2e${Date.now()}@student.test`;
await page.goto("http://localhost:3000/register");
await page.fill("#firstName", "Test"); await page.fill("#lastName", "Student");
await page.fill("#email", email); await page.fill("#password", "Password#12345"); await page.fill("#confirmPassword", "Password#12345");
await page.check("input[type=checkbox]");
await Promise.all([page.waitForURL(/onboarding/, { timeout: 60000 }), page.click("button[type=submit]")]);
console.log("registered ->", page.url());
const next = async (label) => { const n = Number(label.replace("step","")); await page.click("main button[type=submit]"); await page.waitForURL(new RegExp("step=" + (n + 1)), { timeout: 30000 }); await page.waitForLoadState("networkidle"); console.log(label, "->", page.url().replace("http://localhost:3000", "")); };
// 1
await page.fill("#phone", "+216 20 000 111"); await page.fill("#dob", "2001-05-05");
await page.fill("#passportNumber", "TN9999999"); await page.fill("#passportExpiry", "2031-01-01");
await next("step1");
// 2
await page.check("input[type=radio][value=EN]"); await page.selectOption("#lvl", "B2");
await next("step2");
// 3
await page.fill("#bacYear", "2019"); await page.fill("#bacSection", "Maths"); await page.fill("#bacGrade", "15");
await page.selectOption("#level", "MASTER");
await next("step3");
// 4
await page.selectOption("#cityId", { index: 1 });
await next("step4");
// 5
await page.locator("input[type=radio][name=programId]").first().check();
await next("step5");
await page.screenshot({ path: S + "wiz6.png" });
// 6: no scholarship
await page.locator("input[name=wants]").nth(1).check();
await next("step6");
// 7: funding sponsor 10179.85
await page.locator("main form select").first().selectOption("SPONSOR");
await page.locator("main form input[inputmode=decimal]").fill("10179.85");
await page.getByRole("button", { name: /Add this source|Ajouter cette source/i }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: S + "wiz7.png" });
await page.getByRole("button", { name: /^Continue$|^Continuer$/ }).click();
await page.waitForURL(/step=8/, { timeout: 30000 });
// 8
await page.locator("main form input").nth(1).fill("Karim Test");
await page.locator("main form select").first().selectOption("UNCLE_AUNT");
await page.getByRole("button", { name: /^(Save|Enregistrer)$/ }).click();
await page.waitForTimeout(2500);
await page.getByRole("button", { name: /^(Continue|Continuer)$/ }).click();
await page.waitForURL(/step=9/, { timeout: 30000 });
// 9
await page.locator("main form select").first().selectOption("RETIRED");
await page.locator("main form select").nth(1).selectOption("CNRPS");
await page.getByRole("button", { name: /^(Save|Enregistrer)$/ }).click();
await page.waitForTimeout(2500);
await page.getByRole("button", { name: /^(Continue|Continuer)$/ }).click();
await page.waitForURL(/step=10/, { timeout: 30000 });
await page.waitForLoadState("networkidle");
await page.screenshot({ path: S + "wiz10.png", fullPage: true });
console.log((await page.locator("main").innerText()).slice(0, 900));
await page.getByRole("button", { name: /checklist|documents/i }).last().click();
await page.waitForURL(/student\/documents/, { timeout: 60000 });
console.log("done ->", page.url());
if (errors.length) console.log("ERRORS:\n" + errors.slice(0, 10).join("\n"));
await browser.close();
