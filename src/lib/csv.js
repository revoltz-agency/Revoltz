function safeCell(value) {
  let text = value == null ? '' : String(value);
  // Prevent spreadsheet formula execution while preserving CRM data.
  if (/^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildWorkflowCsv(leads, getCrm) {
  const columns = [
    ['google_place_id_google_sourced', (lead) => lead.source === 'google' ? lead.placeId || lead.id : ''],
    ['user_status', (lead) => getCrm(lead).status],
    ['user_notes', (lead) => getCrm(lead).notes],
    ['user_last_contacted_date', (lead) => getCrm(lead).lastContacted],
    ['user_last_contacted_timestamp', (lead) => getCrm(lead).lastContactedAt],
    ['user_follow_up_anchor_date', (lead) => getCrm(lead).followUpAnchorDate],
    ['user_follow_up_step', (lead) => getCrm(lead).followUpStep],
    ['user_next_follow_up', (lead) => getCrm(lead).nextFollowUp],
    ['user_assigned_service', (lead) => getCrm(lead).assignedService],
    ['user_estimated_deal_value', (lead) => getCrm(lead).estimatedDealValue],
    ['user_entered_business_email', (lead) => getCrm(lead).email],
    ['user_verified_email_by_user', (lead) => getCrm(lead).emailVerifiedByUser],
    ['user_email_contact_basis_confirmed', (lead) => getCrm(lead).emailPermissionConfirmed],
    ['user_whatsapp_opt_in_confirmed', (lead) => getCrm(lead).whatsappOptInConfirmed],
    ['user_tags', (lead) => (getCrm(lead).tags || []).join('; ')],
  ];
  return [
    columns.map(([name]) => safeCell(name)).join(','),
    ...leads.map((lead) => columns.map(([, getter]) => safeCell(getter(lead))).join(',')),
  ].join('\r\n');
}
