# MotoSave go-live checklist

This is a pre-release checklist, not a declaration of production readiness.

## Supabase and identity

- [ ] Create and approve the correct Supabase project/organization/region.
- [ ] Apply the checked-in database migration and verify all RLS policies and grants.
- [ ] Run Supabase Security and Performance Advisors and resolve findings.
- [ ] Configure email/phone verification, production redirect allowlists, abuse protection, MFA for privileged users, rate limits, and recovery procedures.
- [ ] Assign elevated roles only through a trusted, audited administrative process. Never let users update their own role.
- [ ] Review database backups, point-in-time recovery options, monitoring, and restore drills.

## Personal data and documents

- [ ] Review the intended processing with qualified Rwanda privacy/legal advisers.
- [ ] Publish privacy notice, retention rules, access/correction/deletion workflows, and complaint channels.
- [ ] Verify private Storage policies, upload size/type limits, malware scanning, and protected download URLs.
- [ ] Establish operational access controls and audit-log retention.

## Payments, loans, and insurance

- [ ] Confirm MotoSave's regulatory classification and required authorizations.
- [ ] Execute agreements with relevant licensed payment, financial, and insurance providers.
- [ ] Implement production provider adapters only from official API documentation.
- [ ] Validate callback signatures, idempotency, replay resistance, reconciliation, timeouts, reversals, and disputes.
- [ ] Test the complete payment lifecycle with provider sandbox environments.
- [ ] Verify insurer-provided policy status before displaying active cover.
- [ ] Confirm loan terms, total cost, disclosure wording, and lender-controlled decision processes.
- [ ] Disable demo payment mode in production.

## Quality and operations

- [ ] Complete security review and independent penetration testing.
- [ ] Test cross-account and cross-organization data isolation.
- [ ] Perform accessibility, low-connectivity, device compatibility, and performance testing.
- [ ] Configure error reporting, operational alerts, and incident response.
- [ ] Review all copy, Kinyarwanda translations, and legally important disclosures.
- [ ] Obtain and install appropriately licensed Gopher font assets.
- [ ] Test the final Android package, web production build, privacy flows, and backup recovery.
