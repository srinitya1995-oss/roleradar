/**
 * Seed people pool for outreach recommendations.
 * Run: npx tsx scripts/seed-people.ts
 * Add people for companies you have job sources for (e.g. Anthropic).
 */
import { db } from "../src/lib/db";

const existing = db.prepare("SELECT 1 FROM people LIMIT 1").get();
if (existing) {
  console.log("people already has data, skip seed.");
  process.exit(0);
}

const people = [
  {
    name: "Alex Chen",
    title: "Senior PM",
    company: "Anthropic",
    linkedin_url: "https://www.linkedin.com/in/example-alex",
    relationship_type: "Ex-Amazon",
    connection_status: "Not connected",
    notes: null,
  },
  {
    name: "Jordan Lee",
    title: "Principal PM",
    company: "Anthropic",
    linkedin_url: "https://www.linkedin.com/in/example-jordan",
    relationship_type: "Same team",
    connection_status: "Connected",
    notes: null,
  },
  {
    name: "Sam Rivera",
    title: "Engineering Manager",
    company: "Anthropic",
    linkedin_url: "https://www.linkedin.com/in/example-sam",
    relationship_type: "Adjacent org",
    connection_status: "Unknown",
    notes: null,
  },
];

const insert = db.prepare(`
  INSERT INTO people (name, title, company, linkedin_url, relationship_type, connection_status, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

for (const p of people) {
  insert.run(p.name, p.title, p.company, p.linkedin_url, p.relationship_type, p.connection_status, p.notes);
}

console.log(`Seeded ${people.length} people. Recommendations show on job detail; most relevant for Apply now / Strong fit / Near match jobs.`);
process.exit(0);
