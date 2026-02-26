/**
 * Seed people pool for outreach recommendations.
 * Run: npx tsx scripts/seed-people.ts
 * These are SAMPLE contacts for demo only—names and LinkedIn URLs are not real.
 * Replace with real people (same company as your job sources) for real recommendations.
 */
import { db } from "../src/lib/db";

const existing = db.prepare("SELECT 1 FROM people LIMIT 1").get();
if (existing) {
  console.log("people already has data, skip seed.");
  process.exit(0);
}

// Sample/demo contacts only—LinkedIn URLs are placeholders; replace with real people.
const people = [
  {
    name: "Sample contact (Anthropic)",
    title: "Senior PM",
    company: "Anthropic",
    linkedin_url: null as string | null, // placeholder; add real LinkedIn URL for real contacts
    relationship_type: "Ex-Amazon",
    connection_status: "Not connected",
    notes: "Demo contact—replace with real person",
  },
  {
    name: "Sample contact 2 (Anthropic)",
    title: "Principal PM",
    company: "Anthropic",
    linkedin_url: null,
    relationship_type: "Same team",
    connection_status: "Connected",
    notes: "Demo contact—replace with real person",
  },
  {
    name: "Sample contact 3 (Anthropic)",
    title: "Engineering Manager",
    company: "Anthropic",
    linkedin_url: null,
    relationship_type: "Adjacent org",
    connection_status: "Unknown",
    notes: "Demo contact—replace with real person",
  },
];

const insert = db.prepare(`
  INSERT INTO people (name, title, company, linkedin_url, relationship_type, connection_status, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

for (const p of people) {
  insert.run(p.name, p.title, p.company, p.linkedin_url, p.relationship_type, p.connection_status, p.notes);
}

console.log(`Seeded ${people.length} sample people (demo only—names/URLs are not real).`);
console.log("Replace with real contacts at your target companies for real recommendations. People to connect only shows contacts at the same company as each job.");
process.exit(0);
