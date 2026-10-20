# GCO — Technical and security overview (for partners and prospective clients)

*Version of 2026-10-20. This summary is intentionally high level. It is not a contract, a compliance certification or a service-level commitment.*

## What GCO is
GCO provides **managed human conversation operations**: trained operators handle your customer conversations and community moderation, supported by an operations platform that routes work, tracks response times, supports multiple languages and extended coverage, and reports on quality and volume.

## How the platform works
- A web application for each role (operators, supervisors, managers, client users, management), backed by a database and a job-queue service, hosted on a cloud server in the EU (Germany).
- Your platform connects through a **signed, HTTPS-based interface**. Integration is agreed per client: we review your API documentation, test in a sandbox, and go live only after joint acceptance testing.
- **People stay in control:** every reply is written and sent by a human operator. **AI is currently disabled** across the platform; no AI-generated content is produced or sent, and it will not be enabled without a separate, documented security and privacy review and approval.

## Security approach
- **Role-based access** with server-side checks on every function; **strict separation between clients' data**; supervisors see only their own teams.
- **Signed requests** between your platform and ours, with replay protection and size limits; outbound calls only to approved HTTPS destinations with network-level safeguards.
- **Secure sign-in**: hashed passwords, session revocation, optional two-factor authentication.
- **Audit trail** of sensitive actions; message contents are kept out of logs and audit records.
- **Encrypted connections** between users' browsers, our edge provider and our servers.
- **Backups:** a daily backup with an off-site copy is configured; recovery procedures are documented, and a formal test of restoring a production backup is still to be completed.
- **Separate environments** for development, testing and production; test environments hold fictional data only.
- Automated tests of access rules, client separation, delivery retries and failure handling are part of our release process, and dependencies are checked for known vulnerabilities.

## Data and privacy
Client conversation data is processed on your behalf for the purpose of the service. Retention periods are agreed per client; tools to export or delete an end user's data on your instruction exist and are being finalised together with legal review. We will provide data-processing terms and a sub-processor list as part of the contract process.

## Where we are today (honest status)
The platform is in a **pre-launch review phase**: its functions have been tested thoroughly in a controlled environment, and the first real client integration, a full recovery test of production backups, third-party security testing and the legal documentation are still to be completed. We will share the current status and evidence with you on request.

## Contact
founder@globalconversationoperations.com
