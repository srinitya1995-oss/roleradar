/**
 * Add Adobe as job source (Workday) and Adobe people for outreach.
 * Run: npx tsx scripts/seed-adobe.ts
 */
import { db } from "../src/lib/db";

const ADOBE_WORKDAY_URL = "https://adobe.wd5.myworkdayjobs.com/external_experienced";

const adobeSource = db.prepare("SELECT id FROM job_sources WHERE company = ?").get("Adobe") as { id: number } | undefined;
if (!adobeSource) {
  db.prepare(
    "INSERT INTO job_sources (company, url, parser, enabled) VALUES (?, ?, ?, 1)"
  ).run("Adobe", ADOBE_WORKDAY_URL, "workday");
  console.log("Added job source: Adobe (Workday).");
} else {
  db.prepare("UPDATE job_sources SET url = ?, parser = ?, enabled = 1 WHERE company = ?").run(ADOBE_WORKDAY_URL, "workday", "Adobe");
  console.log("Updated Adobe job source to Workday.");
}

// Add Adobe sample people if none exist for Adobe (demo only—not real profiles)
const adobePeople = db.prepare("SELECT 1 FROM people WHERE company = ? LIMIT 1").get("Adobe");
if (!adobePeople) {
  const people = [
    { name: "Sample contact (Adobe)", title: "Senior PM", company: "Adobe", linkedin_url: null as string | null, relationship_type: "Ex-Amazon", connection_status: "Not connected", notes: "Demo—replace with real person" },
    { name: "Sample contact 2 (Adobe)", title: "Principal PM", company: "Adobe", linkedin_url: null, relationship_type: "Same team", connection_status: "Connected", notes: "Demo—replace with real person" },
    { name: "Sample contact 3 (Adobe)", title: "Engineering Lead", company: "Adobe", linkedin_url: null, relationship_type: "Adjacent org", connection_status: "Unknown", notes: "Demo—replace with real person" },
  ];
  const insert = db.prepare(`
    INSERT INTO people (name, title, company, linkedin_url, relationship_type, connection_status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of people) {
    insert.run(p.name, p.title, p.company, p.linkedin_url, p.relationship_type, p.connection_status, p.notes);
  }
  console.log(`Added ${people.length} sample people for Adobe (demo only—replace with real contacts).`);
} else {
  console.log("Adobe people already in pool.");
}

console.log("Done. Run npm run poll to fetch Adobe jobs.");
process.exit(0);
