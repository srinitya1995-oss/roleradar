/**
 * Outreach messages: principal-level tone, Job ID only (no URL).
 * No em dashes, no buzzword stacking, no corporate filler.
 * Connected -> referral ask; Not connected / Unknown -> connect note.
 */

export function connectNote(name: string, jobId: string): string {
  return `Hi ${name}, I'm Srinitya, PM-T at Amazon Alexa AI. I saw the Principal GenAI role (Job ID: ${jobId}) and wanted to connect.`;
}

export function referralAsk(name: string, jobId: string): string {
  return `Thanks for connecting, ${name}. I'm looking at the Principal GenAI role (Job ID: ${jobId}) on your team. I've led 0-to-1 GenAI work, reasoning and evaluation, and shipped customer-facing AI at scale at Alexa. I'd like to be referred if you think there's a fit.`;
}

export function referralMessage(name: string, jobId: string): string {
  return referralAsk(name, jobId);
}
