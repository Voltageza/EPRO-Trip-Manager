import config from '../config.js';
import db from '../db.js';

/**
 * Fire a webhook to Make.com when a job event occurs.
 * Events: job_assigned, job_completed, job_created
 *
 * Make.com will use this data to create/update Microsoft To-Do tasks.
 */
export async function fireWebhook(event, jobData) {
  const url = config.makecomWebhookUrl;
  if (!url) return; // webhook not configured — skip silently

  // Look up electrician phone for WhatsApp notification
  let electricianPhone = null;
  if (jobData.assigned_to) {
    const elec = db.prepare(
      'SELECT phone FROM electricians WHERE name = ?'
    ).get(jobData.assigned_to);
    if (elec?.phone) {
      electricianPhone = elec.phone.replace(/[\s\-()]/g, '');
      if (electricianPhone.startsWith('0')) electricianPhone = '27' + electricianPhone.slice(1);
      if (!electricianPhone.startsWith('+') && !electricianPhone.startsWith('27')) {
        electricianPhone = '27' + electricianPhone;
      }
      electricianPhone = electricianPhone.replace('+', '');
    }
  }

  const payload = {
    event,
    timestamp: new Date().toISOString(),
    job: {
      id: jobData.id,
      reference_number: jobData.reference_number,
      status: jobData.status,
      priority: jobData.priority,
      description: jobData.description || '',
      special_instructions: jobData.special_instructions || '',
      assigned_to: jobData.assigned_to || null,
      customer_name: jobData.customer_name || null,
      customer_phone: jobData.customer_phone || null,
      customer_address: jobData.customer_address || null,
      created_at: jobData.created_at,
      completed_at: jobData.completed_at || null,
    },
    electrician_phone: electricianPhone,
  };

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (config.makecomWebhookSecret) {
      headers['X-Webhook-Secret'] = config.makecomWebhookSecret;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!res.ok) {
      console.error(`[webhook] Make.com returned ${res.status}: ${await res.text().catch(() => '')}`);
    } else {
      console.log(`[webhook] Fired ${event} for ${jobData.reference_number}`);
    }
  } catch (err) {
    // Don't let webhook failures block the main flow
    console.error(`[webhook] Failed to fire ${event}:`, err.message);
  }
}
