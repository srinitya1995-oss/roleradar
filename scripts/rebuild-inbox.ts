/**
 * Clear job index and re-poll. Applies GATE 0–4; only eligible PM roles are stored with CPI.
 * Deletes job_referral_targets, job_people, then jobs; then runs poll.
 */

import { db } from "../src/lib/db";
import { runPoll } from "./poll";

function main() {
  db.exec(`
    DELETE FROM job_referral_targets;
    DELETE FROM job_people;
    DELETE FROM jobs;
  `);
  console.log("Cleared jobs, job_people, and job_referral_targets.");
  return runPoll();
}

main()
  .then(({ count }) => {
    console.log(`Rebuild complete. ${count} new jobs inserted (after gates + location).`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
